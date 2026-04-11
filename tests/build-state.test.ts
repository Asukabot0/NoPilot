/**
 * Tests for MOD-008: build_state (TEST-090 through TEST-103).
 * Translated from Python tests/test_build_state.py.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  createInitialState,
  loadState,
  saveState,
  recordTransition,
  getResumePoint,
  archiveState,
} from '../src/lash/build-state.js';
import type { BuildState, BuildEvent, BuildPhase } from '../src/lash/types.js';

// ---------------------------------------------------------------------------
// Helpers (mirror Python _make_* helpers)
// ---------------------------------------------------------------------------

const VALID_EVENTS: BuildEvent[] = [
  'worker_spawned',
  'worker_completed',
  'worker_failed',
  'worker_timed_out',
  'test_passed',
  'test_failed',
  'module_critic_spawned',
  'module_critic_passed',
  'module_critic_failed',
  'tracer_completed',
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
];

function makeBaseState(specHash = 'abc123'): BuildState {
  return createInitialState(specHash);
}

function makeValidTransitionInput(event: BuildEvent): {
  phase: BuildPhase;
  data: Record<string, unknown>;
} {
  switch (event) {
    case 'tracer_completed':
      return { phase: 'planning', data: {} };
    case 'batch_completed':
      return { phase: 'batch_execution', data: { batch_id: 'BATCH-001' } };
    case 'build_critic_spawned':
      return { phase: 'batch_execution', data: {} };
    case 'build_critic_passed':
    case 'build_critic_failed':
    case 'supervisor_spawned':
      return { phase: 'build_critic', data: {} };
    case 'supervisor_passed':
    case 'supervisor_failed':
    case 'build_completed':
      return { phase: 'supervisor', data: {} };
    case 'build_paused':
      return { phase: 'planning', data: { reason: 'l2' } };
    case 'build_backtracked':
      return { phase: 'planning', data: {} };
    default:
      return {
        phase: 'planning',
        data: { module_id: 'MOD-001', batch_id: 'BATCH-001' },
      };
  }
}

function prepareStateForEvent(baseState: BuildState, event: BuildEvent): BuildState {
  if (event === 'build_completed') {
    let prepared = recordTransition(baseState, 'tracer_completed', {});
    prepared = recordTransition(prepared, 'build_critic_spawned', {});
    prepared = recordTransition(prepared, 'build_critic_passed', {});
    prepared = recordTransition(prepared, 'supervisor_spawned', {});
    prepared = recordTransition(prepared, 'supervisor_passed', {});
    return prepared;
  }

  if (event === 'supervisor_spawned') {
    let prepared = recordTransition(baseState, 'tracer_completed', {});
    prepared = recordTransition(prepared, 'build_critic_spawned', {});
    prepared = recordTransition(prepared, 'build_critic_passed', {});
    return prepared;
  }

  return baseState;
}

function makeWorkerState(moduleId = 'MOD-001') {
  return {
    module_id: moduleId,
    platform: 'darwin',
    pid: 1234,
    session_id: 'sess-001',
    worktree_path: '/tmp/worktree/MOD-001',
    status: 'spawned' as const,
    retries: 0,
    retry_approach_resets: 0,
  };
}

function makeBatchState(batchId = 'BATCH-001') {
  return {
    batch_id: batchId,
    status: 'in_progress' as const,
    workers: [makeWorkerState()],
  };
}

// ---------------------------------------------------------------------------
// TEST-090: Create initial state
// ---------------------------------------------------------------------------

describe('createInitialState', () => {
  it('TEST-090: initial state schema is correct', () => {
    const state = createInitialState('deadbeef');
    expect(state.status).toBe('in_progress');
    expect(state.spec_hash).toBe('deadbeef');
    expect(state.started_at).toBeDefined();
    expect(state.updated_at).toBeDefined();
    expect(state.current_phase).toBe('planning');
    expect(state.tracer).toBeDefined();
    expect(state.tracer.status).toBeDefined();
    expect(state.tracer.module_statuses).toBeDefined();
    expect(Array.isArray(state.batches)).toBe(true);
    expect(Array.isArray(state.transition_log)).toBe(true);
  });

  it('TEST-090: timestamps are valid ISO 8601 strings', () => {
    const state = createInitialState('deadbeef');
    expect(() => new Date(state.started_at).toISOString()).not.toThrow();
    expect(() => new Date(state.updated_at).toISOString()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TEST-091: Load state
// ---------------------------------------------------------------------------

describe('loadState', () => {
  let tmp: string;
  let statePath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lash-test-'));
    statePath = path.join(tmp, 'build-state.json');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('TEST-091: returns null when file does not exist', () => {
    const result = loadState(statePath);
    expect(result).toBeNull();
  });

  it('TEST-091: returns object when file exists', () => {
    const state = makeBaseState();
    fs.writeFileSync(statePath, JSON.stringify(state), 'utf-8');

    const result = loadState(statePath);
    expect(result).not.toBeNull();
    expect(result!.spec_hash).toBe(state.spec_hash);
  });

  it('TEST-091: throws on invalid JSON', () => {
    fs.writeFileSync(statePath, 'not valid json {{', 'utf-8');

    expect(() => loadState(statePath)).toThrow('invalid_state_file');
  });

  it('TEST-091: throws on missing required field', () => {
    fs.writeFileSync(statePath, JSON.stringify({ spec_hash: 'abc' }), 'utf-8');

    expect(() => loadState(statePath)).toThrow('invalid_state_file');
  });
});

// ---------------------------------------------------------------------------
// TEST-100: Save state (atomic write)
// ---------------------------------------------------------------------------

describe('saveState', () => {
  let tmp: string;
  let statePath: string;
  let tmpPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lash-test-'));
    statePath = path.join(tmp, 'build-state.json');
    tmpPath = path.join(tmp, '.build-state.json.tmp');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('TEST-100: creates the file', () => {
    const state = makeBaseState();
    saveState(state, statePath);
    expect(fs.existsSync(statePath)).toBe(true);
  });

  it('TEST-100: atomic write — no tmp file left behind', () => {
    const state = makeBaseState();
    saveState(state, statePath);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  it('TEST-100: saved content is valid JSON', () => {
    const state = makeBaseState();
    saveState(state, statePath);
    const loaded = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(loaded.spec_hash).toBe(state.spec_hash);
  });

  it('TEST-100: save and load roundtrip', () => {
    const state = makeBaseState();
    saveState(state, statePath);
    const loaded = loadState(statePath);
    expect(loaded!.spec_hash).toBe(state.spec_hash);
    expect(loaded!.status).toBe(state.status);
  });
});

// ---------------------------------------------------------------------------
// TEST-092 through TEST-095: Transition recording
// ---------------------------------------------------------------------------

describe('recordTransition', () => {
  let state: BuildState;

  beforeEach(() => {
    state = makeBaseState();
    state.batches = [makeBatchState()];
  });

  it('TEST-092: worker_spawned appends to log', () => {
    const updated = recordTransition(state, 'worker_spawned', {
      module_id: 'MOD-001',
      batch_id: 'BATCH-001',
    });
    expect(updated.transition_log).toHaveLength(1);
    const entry = updated.transition_log[0];
    expect(entry.event).toBe('worker_spawned');
    expect(entry.module_id).toBe('MOD-001');
    expect(entry.batch_id).toBe('BATCH-001');
    expect(entry.timestamp).toBeDefined();
    expect(entry.from_status).toBeDefined();
    expect(entry.to_status).toBeDefined();
  });

  it('TEST-093: test_passed updates worker status', () => {
    const updated = recordTransition(state, 'test_passed', {
      module_id: 'MOD-001',
      batch_id: 'BATCH-001',
    });
    const worker = updated.batches[0].workers[0];
    expect(worker.status).toBe('test_passed');
    expect(updated.transition_log).toHaveLength(1);
    expect(updated.transition_log[0].event).toBe('test_passed');
  });

  it('TEST-094: build_completed updates state status', () => {
    let readyState = recordTransition(state, 'tracer_completed', {});
    readyState = recordTransition(readyState, 'build_critic_spawned', {});
    readyState = recordTransition(readyState, 'build_critic_passed', {});
    readyState = recordTransition(readyState, 'supervisor_spawned', {});
    readyState = recordTransition(readyState, 'supervisor_passed', {});

    const updated = recordTransition(readyState, 'build_completed', {});
    expect(updated.status).toBe('completed');
    expect(updated.transition_log).toHaveLength(6);
    expect(updated.transition_log[5].event).toBe('build_completed');
  });

  it('TEST-095: all 22 events are recognized when phase prerequisites are satisfied', () => {
    for (const event of VALID_EVENTS) {
      let s = makeBaseState();
      s.batches = [makeBatchState()];
      const { phase, data } = makeValidTransitionInput(event);
      s = prepareStateForEvent(s, event);
      if (event !== 'build_completed') {
        s.current_phase = phase;
      }
      expect(() => recordTransition(s, event, data)).not.toThrow();
    }
  });

  it('TEST-095: tracer_completed advances current phase to batch_execution', () => {
    const updated = recordTransition(state, 'tracer_completed', {});
    expect(updated.current_phase).toBe('batch_execution');
    expect(updated.tracer.status).toBe('completed');
    expect(updated.transition_log[0].event).toBe('tracer_completed');
  });

  it('TEST-095: guarded phase transitions reject invalid phase jumps', () => {
    expect(() => recordTransition(state, 'batch_completed', { batch_id: 'BATCH-001' })).toThrow(
      'invalid_transition',
    );
    expect(() => recordTransition(state, 'build_critic_spawned', {})).toThrow(
      'invalid_transition',
    );
    expect(() => recordTransition(state, 'build_completed', {})).toThrow('invalid_transition');
  });

  it('TEST-095: full verification chain must pass through critic and supervisor before completion', () => {
    let updated = recordTransition(state, 'tracer_completed', {});
    updated = recordTransition(updated, 'build_critic_spawned', {});
    expect(updated.current_phase).toBe('build_critic');

    updated = recordTransition(updated, 'build_critic_passed', {});

    updated = recordTransition(updated, 'supervisor_spawned', {});
    expect(updated.current_phase).toBe('supervisor');

    updated = recordTransition(updated, 'supervisor_passed', {});

    updated = recordTransition(updated, 'build_completed', {});
    expect(updated.current_phase).toBe('acceptance');
    expect(updated.status).toBe('completed');
  });

  it('TEST-095: build_completed requires passing critic and supervisor verdicts', () => {
    const missingCriticPass = {
      ...state,
      current_phase: 'supervisor' as const,
    };

    expect(() => recordTransition(missingCriticPass, 'build_completed', {})).toThrow(
      'build_critic_passed',
    );

    let missingSupervisorPass = recordTransition(state, 'tracer_completed', {});
    missingSupervisorPass = recordTransition(missingSupervisorPass, 'build_critic_spawned', {});
    missingSupervisorPass = recordTransition(missingSupervisorPass, 'build_critic_passed', {});
    missingSupervisorPass = recordTransition(missingSupervisorPass, 'supervisor_spawned', {});

    expect(() => recordTransition(missingSupervisorPass, 'build_completed', {})).toThrow(
      'supervisor_passed',
    );
  });

  it('TEST-095: supervisor_spawned only advances after a passed build_critic result', () => {
    state.current_phase = 'build_critic';
    expect(() => recordTransition(state, 'supervisor_spawned', {})).toThrow(
      'build_critic_passed',
    );

    const reviewed = recordTransition(state, 'build_critic_passed', {});
    const updated = recordTransition(reviewed, 'supervisor_spawned', {});
    expect(updated.current_phase).toBe('supervisor');
  });

  it('TEST-103: invalid event throws with invalid_transition', () => {
    expect(() => recordTransition(state, 'nonexistent_event_xyz', {})).toThrow(
      'invalid_transition',
    );
  });

  it('transition log is append-only', () => {
    let s = makeBaseState();
    s.batches = [makeBatchState()];
    s = recordTransition(s, 'worker_spawned', { module_id: 'MOD-001', batch_id: 'BATCH-001' });
    s = recordTransition(s, 'test_passed', { module_id: 'MOD-001', batch_id: 'BATCH-001' });
    s = recordTransition(s, 'tracer_completed', {});
    s = recordTransition(s, 'build_critic_spawned', {});
    s = recordTransition(s, 'build_critic_passed', {});
    s = recordTransition(s, 'supervisor_spawned', {});
    s = recordTransition(s, 'supervisor_passed', {});
    s = recordTransition(s, 'build_completed', {});
    expect(s.transition_log).toHaveLength(8);
  });

  it('transition log entry has valid timestamp', () => {
    const s = makeBaseState();
    s.batches = [makeBatchState()];
    const updated = recordTransition(s, 'worker_spawned', {
      module_id: 'MOD-001',
      batch_id: 'BATCH-001',
    });
    const ts = updated.transition_log[0].timestamp;
    expect(() => new Date(ts).toISOString()).not.toThrow();
  });

  it('updated_at is a valid timestamp after transition', () => {
    const s = makeBaseState();
    s.batches = [makeBatchState()];
    const updated = recordTransition(s, 'worker_spawned', {
      module_id: 'MOD-001',
      batch_id: 'BATCH-001',
    });
    expect(() => new Date(updated.updated_at).toISOString()).not.toThrow();
  });

  it('build_paused with reason=l2 sets paused_l2 status', () => {
    const s = makeBaseState();
    const updated = recordTransition(s, 'build_paused', { reason: 'l2' });
    expect(updated.status).toBe('paused_l2');
  });

  it('build_critic_failed marks the build as failed until a pause event overrides it', () => {
    const s = makeBaseState();
    s.current_phase = 'build_critic';
    const updated = recordTransition(s, 'build_critic_failed', { detail: 'review failed' });
    expect(updated.status).toBe('failed');
  });

  it('supervisor_failed marks the build as failed until a pause event overrides it', () => {
    const s = makeBaseState();
    s.current_phase = 'supervisor';
    const updated = recordTransition(s, 'supervisor_failed', { detail: 'review failed' });
    expect(updated.status).toBe('failed');
  });

  it('build_backtracked sets backtracked status', () => {
    const s = makeBaseState();
    const updated = recordTransition(s, 'build_backtracked', {});
    expect(updated.status).toBe('backtracked');
  });

  it('worker_failed updates worker status to failed', () => {
    const s = makeBaseState();
    s.batches = [makeBatchState()];
    const updated = recordTransition(s, 'worker_failed', {
      module_id: 'MOD-001',
      batch_id: 'BATCH-001',
    });
    expect(updated.batches[0].workers[0].status).toBe('failed');
  });

  it('worker_timed_out updates worker status to timed_out', () => {
    const s = makeBaseState();
    s.batches = [makeBatchState()];
    const updated = recordTransition(s, 'worker_timed_out', {
      module_id: 'MOD-001',
      batch_id: 'BATCH-001',
    });
    expect(updated.batches[0].workers[0].status).toBe('timed_out');
  });

  it('test_failed updates worker status to test_failed', () => {
    const s = makeBaseState();
    s.batches = [makeBatchState()];
    const updated = recordTransition(s, 'test_failed', {
      module_id: 'MOD-001',
      batch_id: 'BATCH-001',
    });
    expect(updated.batches[0].workers[0].status).toBe('test_failed');
  });

  it('batch_completed updates batch status to completed', () => {
    const s = makeBaseState();
    s.batches = [makeBatchState()];
    s.current_phase = 'batch_execution';
    const updated = recordTransition(s, 'batch_completed', { batch_id: 'BATCH-001' });
    expect(updated.batches[0].status).toBe('completed');
  });

  it('merge_conflict updates worker status to merge_conflict', () => {
    const s = makeBaseState();
    s.batches = [makeBatchState()];
    const updated = recordTransition(s, 'merge_conflict', {
      module_id: 'MOD-001',
      batch_id: 'BATCH-001',
    });
    expect(updated.batches[0].workers[0].status).toBe('merge_conflict');
  });

  it('merge_completed updates worker status to merged', () => {
    const s = makeBaseState();
    s.batches = [makeBatchState()];
    const updated = recordTransition(s, 'merge_completed', {
      module_id: 'MOD-001',
      batch_id: 'BATCH-001',
    });
    expect(updated.batches[0].workers[0].status).toBe('merged');
  });
});

// ---------------------------------------------------------------------------
// TEST-096 through TEST-098, TEST-101, TEST-102: Resume point
// ---------------------------------------------------------------------------

describe('getResumePoint', () => {
  it('TEST-096: resume from in_progress', () => {
    const state = makeBaseState();
    state.status = 'in_progress';
    state.current_phase = 'batch_execution';
    state.batches = [makeBatchState()];

    const resume = getResumePoint(state);
    expect(resume.phase).toBe('batch_execution');
    expect('batch_id' in resume).toBe(true);
    expect('module_id' in resume).toBe(true);
    expect('pending_action' in resume).toBe(true);
    expect('session_recovery' in resume).toBe(true);
    expect(Array.isArray(resume.session_recovery)).toBe(true);
  });

  it('TEST-097: resume from paused_l2', () => {
    const state = makeBaseState();
    state.status = 'paused_l2';
    state.current_phase = 'supervisor';
    state.batches = [makeBatchState()];

    const resume = getResumePoint(state);
    expect(resume.phase).toBe('supervisor');
    expect('pending_action' in resume).toBe(true);
  });

  it('TEST-098: resume from terminal status throws terminal_state', () => {
    for (const terminalStatus of ['completed', 'failed'] as const) {
      const state = makeBaseState();
      state.status = terminalStatus;
      expect(() => getResumePoint(state)).toThrow('terminal_state');
    }
  });

  it('TEST-101: session not resumable — recovery info has session_resumable=false', () => {
    const state = makeBaseState();
    state.status = 'in_progress';
    const worker = makeWorkerState();
    (worker as Record<string, unknown>).session_id = null;
    const batch = { batch_id: 'BATCH-001', status: 'in_progress' as const, workers: [worker] };
    state.batches = [batch];

    const resume = getResumePoint(state);
    const recovery = resume.session_recovery;
    expect(Array.isArray(recovery)).toBe(true);
    const modRecovery = recovery.find((r) => r.module_id === 'MOD-001');
    expect(modRecovery).not.toBeUndefined();
    expect(modRecovery!.session_resumable).toBe(false);
  });

  it('TEST-102: worktree missing — recovery info has worktree_exists=false', () => {
    const state = makeBaseState();
    state.status = 'in_progress';
    const worker = makeWorkerState();
    worker.worktree_path = '/nonexistent/path/that/does/not/exist';
    const batch = { batch_id: 'BATCH-001', status: 'in_progress' as const, workers: [worker] };
    state.batches = [batch];

    const resume = getResumePoint(state);
    const recovery = resume.session_recovery;
    const modRecovery = recovery.find((r) => r.module_id === 'MOD-001');
    expect(modRecovery).not.toBeUndefined();
    expect(modRecovery!.worktree_exists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TEST-099: Archive state
// ---------------------------------------------------------------------------

describe('archiveState', () => {
  let tmp: string;
  let statePath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lash-test-'));
    statePath = path.join(tmp, 'build-state.json');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('TEST-099: creates file with ISO8601-based name', () => {
    const state = makeBaseState();
    saveState(state, statePath);

    const result = archiveState(statePath);
    const archivePath = result.archive_path;

    expect(fs.existsSync(archivePath)).toBe(true);
    const baseName = path.basename(archivePath);
    expect(baseName.startsWith('build-state-archive-')).toBe(true);
    expect(baseName.endsWith('.json')).toBe(true);
    // Extract timestamp part and verify it starts with a digit (year)
    const tsPart = baseName.slice('build-state-archive-'.length, -'.json'.length);
    expect(tsPart[0]).toMatch(/\d/);
  });

  it('TEST-099: archive content matches original', () => {
    const state = makeBaseState();
    saveState(state, statePath);

    const result = archiveState(statePath);
    const archived = JSON.parse(fs.readFileSync(result.archive_path, 'utf-8'));
    expect(archived.spec_hash).toBe(state.spec_hash);
  });

  it('TEST-099: returns dict with archive_path string', () => {
    const state = makeBaseState();
    saveState(state, statePath);

    const result = archiveState(statePath);
    expect('archive_path' in result).toBe(true);
    expect(typeof result.archive_path).toBe('string');
  });

  it('TEST-099: archive file is in same directory as state file', () => {
    const state = makeBaseState();
    saveState(state, statePath);

    const result = archiveState(statePath);
    const archiveDir = path.dirname(result.archive_path);
    expect(archiveDir).toBe(tmp);
  });
});
