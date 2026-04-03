/**
 * Lash build state persistence.
 * Mirrors Python lash/build_state.py exactly — MOD-008.
 *
 * Atomic state file read/write (write-to-temp + fs.renameSync).
 * Supports all 21 transition events. Crash recovery / resume logic.
 */
import { existsSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import type {
  BuildState,
  BuildEvent,
  BuildStatus,
  WorkerStatus,
  BatchEntry,
  WorkerEntry,
  TransitionLogEntry,
  ResumePoint,
  SessionRecoveryEntry,
  ArchiveResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALID_EVENTS: ReadonlySet<BuildEvent> = new Set<BuildEvent>([
  'worker_spawned',
  'worker_completed',
  'worker_failed',
  'worker_timed_out',
  'test_passed',
  'test_failed',
  'module_critic_spawned',
  'module_critic_passed',
  'module_critic_failed',
  'batch_completed',
  'merge_completed',
  'merge_conflict',
  'build_critic_spawned',
  'build_critic_passed',
  'build_critic_failed',
  'supervisor_spawned',
  'supervisor_passed',
  'supervisor_failed',
  'build_paused',
  'build_completed',
  'build_backtracked',
]);

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'failed']);

const REQUIRED_STATE_FIELDS: ReadonlySet<string> = new Set([
  'status',
  'spec_hash',
  'started_at',
  'updated_at',
  'current_phase',
  'tracer',
  'batches',
  'transition_log',
]);

/** Maps event → worker status to set (for worker-level events). */
const WORKER_EVENT_STATUS: Readonly<Partial<Record<BuildEvent, WorkerStatus>>> = {
  worker_spawned: 'spawned',
  worker_completed: 'completed',
  worker_failed: 'failed',
  worker_timed_out: 'timed_out',
  test_passed: 'test_passed',
  test_failed: 'test_failed',
  module_critic_spawned: 'critic_review',
  module_critic_passed: 'critic_passed',
  module_critic_failed: 'critic_failed',
  merge_completed: 'merged',
  merge_conflict: 'merge_conflict',
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function workerPendingAction(workerStatus: string): string {
  const mapping: Record<string, string> = {
    pending: 'spawn_worker',
    spawned: 'wait_for_worker',
    testing: 'wait_for_tests',
    test_failed: 'fix_tests',
    critic_review: 'wait_for_critic',
    critic_failed: 'address_critic_feedback',
    merging: 'wait_for_merge',
    merge_conflict: 'resolve_merge_conflict',
    failed: 'retry_worker',
    timed_out: 'retry_worker',
    failed_preserved: 'review_preserved_worker',
  };
  return mapping[workerStatus] ?? 'continue_build';
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Return a fresh BuildState object. */
export function createInitialState(specHash: string): BuildState {
  const now = nowIso();
  return {
    status: 'in_progress',
    spec_hash: specHash,
    started_at: now,
    updated_at: now,
    current_phase: 'planning',
    tracer: {
      status: 'pending',
      module_statuses: {},
    },
    batches: [],
    transition_log: [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load BuildState from disk. Returns null if file does not exist.
 * Throws Error with 'invalid_state_file' on corrupt or incomplete data.
 */
export const DEFAULT_STATE_PATH = 'specs/build-state.json';

export function loadState(statePath: string = DEFAULT_STATE_PATH): BuildState | null {
  if (!existsSync(statePath)) {
    return null;
  }

  let data: unknown;
  try {
    const content = readFileSync(statePath, 'utf-8');
    data = JSON.parse(content);
  } catch (exc) {
    throw new Error(`invalid_state_file: ${exc}`);
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('invalid_state_file: root must be a JSON object');
  }

  const dataObj = data as Record<string, unknown>;
  const missing = [...REQUIRED_STATE_FIELDS].filter((f) => !(f in dataObj));
  if (missing.length > 0) {
    throw new Error(`invalid_state_file: missing fields ${JSON.stringify(missing.sort())}`);
  }

  return dataObj as unknown as BuildState;
}

/**
 * Atomically write state to disk using a tmp file + fs.renameSync.
 * Throws Error with 'write_error' on failure.
 */
export function saveState(state: BuildState, statePath: string = DEFAULT_STATE_PATH): void {
  const dirPath = dirname(resolve(statePath));
  const tmpPath = `${dirPath}/.build-state.json.tmp`;

  try {
    writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tmpPath, resolve(statePath));
  } catch (exc) {
    throw new Error(`write_error: ${exc}`);
  }
}

/**
 * Update state based on event type. Append to transition_log.
 * Returns updated BuildState.
 * Throws Error with 'invalid_transition' for unknown events.
 */
export function recordTransition(
  state: BuildState,
  event: string,
  data: Record<string, unknown>,
): BuildState {
  if (!VALID_EVENTS.has(event as BuildEvent)) {
    throw new Error(`invalid_transition: unknown event ${JSON.stringify(event)}`);
  }

  // Shallow copy to avoid mutating input
  const newState: BuildState = {
    ...state,
    transition_log: [...(state.transition_log ?? [])],
    batches: (state.batches ?? []).map((b) => ({ ...b })),
  };

  const now = nowIso();
  const moduleId = (data['module_id'] as string | undefined) ?? null;
  const batchId = (data['batch_id'] as string | undefined) ?? null;

  const fromStatus = newState.status as string;
  let toStatus = fromStatus;

  // --- Apply state-level transitions ---
  if (event === 'build_completed') {
    toStatus = 'completed';
    newState.status = 'completed';
    newState.current_phase = 'acceptance';
  } else if (event === 'build_backtracked') {
    toStatus = 'backtracked';
    newState.status = 'backtracked' as BuildStatus;
  } else if (event === 'build_paused') {
    const reason = (data['reason'] as string | undefined) ?? '';
    if (reason === 'l2') {
      toStatus = 'paused_l2';
      newState.status = 'paused_l2';
    } else if (reason === 'critic') {
      toStatus = 'paused_critic';
      newState.status = 'paused_critic';
    } else if (reason === 'supervisor') {
      toStatus = 'paused_supervisor';
      newState.status = 'paused_supervisor';
    }
    // If no recognised reason, leave status as-is
  } else if (event === 'supervisor_spawned') {
    newState.current_phase = 'supervisor';
  } else if (event === 'build_critic_spawned') {
    newState.current_phase = 'build_critic';
  }

  // --- Apply batch-level transitions ---
  if (event === 'batch_completed' && batchId !== null) {
    newState.batches = newState.batches.map((batch) => {
      if (batch.batch_id === batchId) {
        return { ...batch, status: 'completed' };
      }
      return batch;
    });
  }

  // --- Apply worker-level transitions ---
  const workerNewStatus = WORKER_EVENT_STATUS[event as BuildEvent];
  if (workerNewStatus !== undefined && moduleId !== null && batchId !== null) {
    newState.batches = newState.batches.map((batch) => {
      if (batch.batch_id !== batchId) return batch;
      const workers = (batch.workers ?? []).map((worker) => {
        if (worker.module_id === moduleId) {
          return { ...worker, status: workerNewStatus };
        }
        return worker;
      });
      return { ...batch, workers };
    });
  }

  newState.updated_at = now;

  // Build detail: all keys except module_id and batch_id
  const detail: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k !== 'module_id' && k !== 'batch_id') {
      detail[k] = v;
    }
  }

  const entry: TransitionLogEntry = {
    timestamp: now,
    event: event as BuildEvent,
    module_id: moduleId,
    batch_id: batchId,
    from_status: fromStatus,
    to_status: toStatus,
    detail,
  };
  newState.transition_log.push(entry);

  return newState;
}

/**
 * Return a ResumePoint for the given BuildState.
 * Throws Error with 'terminal_state' if status is completed or failed.
 */
export function getResumePoint(state: BuildState): ResumePoint {
  const status = state.status as string;
  if (TERMINAL_STATUSES.has(status)) {
    throw new Error(`terminal_state: cannot resume a build with status ${JSON.stringify(status)}`);
  }

  const phase = state.current_phase ?? 'planning';
  const batches = state.batches ?? [];

  // Find the first in-progress or paused batch
  let activeBatch: BatchEntry | null = null;
  let activeWorker: WorkerEntry | null = null;

  for (const batch of batches) {
    if (batch.status === 'in_progress' || batch.status === 'pending') {
      activeBatch = batch;
      for (const worker of batch.workers ?? []) {
        if (!['completed', 'merged', 'critic_passed'].includes(worker.status)) {
          activeWorker = worker;
          break;
        }
      }
      break;
    }
  }

  const batchId = activeBatch ? activeBatch.batch_id : null;
  const moduleId = activeWorker ? activeWorker.module_id : null;

  // Determine pending_action from current state
  let pendingAction: string;
  if (status === 'paused_l2') {
    pendingAction = 'resume_after_l2_review';
  } else if (status === 'paused_critic') {
    pendingAction = 'resume_after_critic_review';
  } else if (status === 'paused_supervisor') {
    pendingAction = 'resume_after_supervisor_review';
  } else if (activeWorker !== null) {
    pendingAction = workerPendingAction(activeWorker.status);
  } else {
    pendingAction = 'continue_build';
  }

  // Build session_recovery list for all active workers
  const sessionRecovery: SessionRecoveryEntry[] = [];
  for (const batch of batches) {
    if (batch.status === 'completed') continue;
    for (const worker of batch.workers ?? []) {
      if (worker.status === 'completed' || worker.status === 'merged') continue;
      const sessionResumable = Boolean(worker.session_id);
      const worktreePath = worker.worktree_path ?? '';
      const worktreeExists = Boolean(worktreePath && existsSync(worktreePath));
      sessionRecovery.push({
        module_id: worker.module_id,
        session_resumable: sessionResumable,
        worktree_exists: worktreeExists,
      });
    }
  }

  return {
    phase,
    batch_id: batchId,
    module_id: moduleId,
    pending_action: pendingAction,
    session_recovery: sessionRecovery,
  };
}

/**
 * Copy state file to a timestamped archive path in the same directory.
 * Returns { archive_path: string }.
 */
export function archiveState(statePath: string = DEFAULT_STATE_PATH): ArchiveResult {
  const ts = new Date().toISOString().replace(/:/g, '-');
  const dirPath = dirname(resolve(statePath));
  const archiveFilename = `build-state-archive-${ts}.json`;
  const archivePath = `${dirPath}/${archiveFilename}`;
  copyFileSync(statePath, archivePath);
  return { archive_path: archivePath };
}
