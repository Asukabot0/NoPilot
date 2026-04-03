/**
 * MOD-002: platform_launcher — thin per-platform abstraction for Worker lifecycle.
 *
 * Translated from Python lash/platform_launcher.py (511 lines).
 * Handles: platform detection (preflight), spawn, resume, cancel, check_completion,
 * monitor_heartbeat. All subprocess operations are async.
 */

import { spawn, execFile } from 'node:child_process';
import * as crypto from 'node:crypto';

import type {
  Platform,
  WorkerHandle,
  PreflightResult,
  PreflightOutput,
  CompletionStatus,
  HeartbeatResult,
  CancelResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Platform CLI command templates
// ---------------------------------------------------------------------------

const PLATFORM_BINARIES: Record<string, string> = {
  'claude-code': 'claude',
  codex: 'codex',
  opencode: 'opencode',
};

const PLATFORM_VERSION_CMDS: Record<string, string[]> = {
  'claude-code': ['claude', '--version'],
  codex: ['codex', '--version'],
  opencode: ['opencode', '--version'],
};

const PLATFORM_AUTH_CMDS: Record<string, string[]> = {
  'claude-code': ['claude', '-p', 'hi', '--max-budget-usd', '0.01'],
  codex: ['codex', '--version'],
  opencode: ['opencode', 'run', 'echo', 'ok'],
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build environment for spawned worker processes with OMC disabled. */
function workerEnv(): NodeJS.ProcessEnv {
  return { ...process.env, DISABLE_OMC: 'true' };
}

/** Current timestamp in ISO-like format matching Python's time.strftime("%Y-%m-%dT%H:%M:%S"). */
function nowTimestamp(): string {
  return new Date().toISOString().slice(0, 19);
}

/** Generate a UUID (mirrors Python uuid.uuid4()). */
function newSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Run a command with a timeout, capturing stdout/stderr.
 * Returns { returncode, stdout, stderr } or throws on failure.
 * Calls execFile via a fresh callback each time so vi.mock interception works.
 */
async function runCommand(
  cmd: string[],
  timeoutMs: number = 10_000,
): Promise<{ returncode: number; stdout: string; stderr: string }> {
  const [bin, ...args] = cmd;
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (!err) {
        resolve({ returncode: 0, stdout: stdout ?? '', stderr: stderr ?? '' });
      } else {
        const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
        const code = typeof e.code === 'number' ? e.code : 1;
        resolve({
          returncode: code,
          stdout: e.stdout ?? stdout ?? '',
          stderr: e.stderr ?? stderr ?? '',
        });
      }
    });
  });
}

/** Check whether a process with the given PID is alive (mirrors os.kill(pid, 0)). */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Sleep for N milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// preflight
// ---------------------------------------------------------------------------

/**
 * Check each platform: binary exists, version exits 0, auth probe.
 * Mirrors Python preflight().
 */
export async function preflight(platforms: string[]): Promise<PreflightOutput> {
  const results: PreflightOutput = {};

  for (const platform of platforms) {
    const binary = PLATFORM_BINARIES[platform] ?? platform;

    // Step 1: binary check via 'which'
    let whichResult: { returncode: number; stdout: string; stderr: string };
    try {
      whichResult = await runCommand(['which', binary]);
    } catch (exc) {
      results[platform] = {
        available: false,
        version: null,
        auth_ok: false,
        error: `binary check failed: ${exc}`,
      };
      continue;
    }

    if (whichResult.returncode !== 0) {
      results[platform] = {
        available: false,
        version: null,
        auth_ok: false,
        error: `binary '${binary}' not found (which returned ${whichResult.returncode})`,
      };
      continue;
    }

    // Step 2: version check
    const versionCmd = PLATFORM_VERSION_CMDS[platform] ?? [binary, '--version'];
    let version: string | null = null;
    try {
      const verResult = await runCommand(versionCmd);
      version = verResult.stdout.trim() || null;
      if (verResult.returncode !== 0) {
        results[platform] = {
          available: false,
          version: null,
          auth_ok: false,
          error: `version check returned code ${verResult.returncode}`,
        };
        continue;
      }
    } catch (exc) {
      results[platform] = {
        available: false,
        version: null,
        auth_ok: false,
        error: `version check failed: ${exc}`,
      };
      continue;
    }

    // Step 3: auth probe
    const authCmd = PLATFORM_AUTH_CMDS[platform] ?? [binary, '--version'];
    let authOk = false;
    try {
      const authResult = await runCommand(authCmd);
      authOk = authResult.returncode === 0;
    } catch {
      authOk = false;
    }

    results[platform] = {
      available: true,
      version,
      auth_ok: authOk,
      error: null,
    };
  }

  return results;
}

// ---------------------------------------------------------------------------
// spawn_worker
// ---------------------------------------------------------------------------

/** Tracked process exit state for spawned workers. */
interface SpawnedProcess {
  pid: number;
  exitCode: number | null;
  exited: boolean;
}

/**
 * Spawn a worker process for the given platform and return a WorkerHandle.
 * Mirrors Python spawn_worker().
 */
export function spawnWorker(
  platform: string,
  task: string,
  worktreePath: string,
  instructionFile: string | null,
  moduleId: string = '',
): WorkerHandle {
  const sessionId = newSessionId();

  let cmd: string[];

  if (platform === 'claude-code') {
    if (instructionFile) {
      cmd = [
        'claude',
        '-p', task,
        '--session-id', sessionId,
        '--permission-mode', 'bypassPermissions',
        '--append-system-prompt-file', instructionFile,
      ];
    } else {
      cmd = [
        'claude',
        '-p', task,
        '--session-id', sessionId,
        '--permission-mode', 'bypassPermissions',
      ];
    }
  } else if (platform === 'codex') {
    cmd = [
      'codex', 'exec',
      '-c', 'approval_policy=auto-edit',
      task,
    ];
  } else if (platform === 'opencode') {
    cmd = [
      'opencode', 'run', task,
      '--agent', 'coder',
    ];
  } else {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const [bin, ...args] = cmd;
  const proc = spawn(bin, args, {
    cwd: worktreePath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: workerEnv(),
    detached: false,
  });

  if (proc.pid === undefined) {
    throw new Error(`Failed to spawn process for platform '${platform}'`);
  }

  return {
    platform: platform as Platform,
    pid: proc.pid,
    session_id: sessionId,
    worktree_path: worktreePath,
    module_id: moduleId,
    started_at: nowTimestamp(),
  };
}

// ---------------------------------------------------------------------------
// resume_worker
// ---------------------------------------------------------------------------

/**
 * Resume a worker with feedback via platform-specific resume command.
 * Mirrors Python resume_worker().
 */
export async function resumeWorker(handle: WorkerHandle, feedback: string): Promise<void> {
  const platform = handle.platform;

  if (platform === 'claude-code') {
    const cmd = [
      'claude',
      '--resume', handle.session_id,
      '-p', feedback,
    ];
    const [bin, ...args] = cmd;
    const proc = spawn(bin, args, {
      cwd: handle.worktree_path,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: workerEnv(),
    });
    proc.on('error', () => { /* binary not found — handled by caller via heartbeat */ });
  } else if (platform === 'codex') {
    const cmd = ['codex', 'exec', 'resume', '--last'];
    const [bin, ...args] = cmd;
    const proc = spawn(bin, args, {
      cwd: handle.worktree_path,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: workerEnv(),
    });
    // Write feedback to stdin and close (mirrors Python proc.communicate(input=feedback.encode()))
    proc.stdin?.write(feedback, 'utf8');
    proc.stdin?.end();
    // Wait for the process to exit
    await new Promise<void>((resolve) => {
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
  } else if (platform === 'opencode') {
    const cmd = [
      'opencode', 'run', feedback,
      '--session', handle.session_id,
    ];
    const [bin, ...args] = cmd;
    const proc = spawn(bin, args, {
      cwd: handle.worktree_path,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: workerEnv(),
    });
    proc.on('error', () => { /* binary not found — handled by caller via heartbeat */ });
  } else {
    throw new Error(`Unknown platform: ${platform}`);
  }
}

// ---------------------------------------------------------------------------
// cancel_worker
// ---------------------------------------------------------------------------

/** Process handle for cancel_worker (optional, enables wait-based cancellation). */
export interface CancellableProcess {
  pid: number;
  waitForExit(timeoutMs: number): Promise<number | null>;
}

/**
 * Send SIGTERM, wait, then SIGKILL if still alive.
 * Mirrors Python cancel_worker().
 *
 * @param handle - WorkerHandle with pid
 * @param proc - optional CancellableProcess for wait-based cancellation
 * @param gracefulShutdownSeconds - seconds to wait before SIGKILL
 */
export async function cancelWorker(
  handle: WorkerHandle,
  proc?: CancellableProcess,
  gracefulShutdownSeconds: number = 10,
): Promise<CancelResult> {
  const pid = handle.pid;

  // Send SIGTERM
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process not found — already gone
    return { killed: false };
  }

  // Wait for graceful exit
  if (proc !== undefined) {
    const exitCode = await proc.waitForExit(gracefulShutdownSeconds * 1000);
    if (exitCode !== null) {
      // Process exited gracefully
      return { killed: false };
    }
    // Fall through to SIGKILL
  } else {
    // No process handle: sleep and check if still alive
    await sleep(gracefulShutdownSeconds * 1000);
    if (!isProcessAlive(pid)) {
      return { killed: false };
    }
  }

  // Force kill with SIGKILL
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process already gone between the check and the kill
    return { killed: false };
  }

  return { killed: true };
}

// ---------------------------------------------------------------------------
// check_completion
// ---------------------------------------------------------------------------

/** Minimal interface for checking process exit status. */
export interface CheckableProcess {
  exitCode: number | null;
}

/**
 * Check completion status of a worker process.
 * Mirrors Python check_completion().
 */
export async function checkCompletion(
  handle: WorkerHandle,
  proc?: CheckableProcess,
): Promise<CompletionStatus> {
  if (proc === undefined) {
    return { status: 'running', exit_code: null, has_diff: null };
  }

  const exitCode = proc.exitCode;

  if (exitCode === null) {
    return { status: 'running', exit_code: null, has_diff: null };
  }

  if (exitCode !== 0) {
    return { status: 'failed', exit_code: exitCode, has_diff: null };
  }

  // exit_code === 0: check for git diff
  let hasDiff = false;
  try {
    const diffResult = await runCommand(
      ['git', 'diff', '--stat', 'HEAD'],
      30_000,
    );
    hasDiff = diffResult.stdout.trim().length > 0;
  } catch {
    hasDiff = false;
  }

  if (hasDiff) {
    return { status: 'completed', exit_code: 0, has_diff: true };
  } else {
    return { status: 'completed_empty', exit_code: 0, has_diff: false };
  }
}

// ---------------------------------------------------------------------------
// monitor_heartbeat
// ---------------------------------------------------------------------------

/**
 * Monitor heartbeat of a worker.
 *   - No stdout for heartbeat_timeout → check kill -0
 *   - If alive, send probe via platform resume
 *   - Response within probe_timeout → reset timer
 *   - Max probes per worker
 *
 * Mirrors Python monitor_heartbeat().
 */
export async function monitorHeartbeat(
  handle: WorkerHandle,
  proc?: CheckableProcess,
  heartbeatTimeout: number = 300,
  probeTimeout: number = 60,
  maxProbes: number = 2,
  lastOutputTime?: number,
  probeCount: number = 0,
): Promise<HeartbeatResult> {
  const now = Date.now() / 1000; // seconds, matching Python time.time()
  const last = lastOutputTime !== undefined ? lastOutputTime : now;
  const elapsed = now - last;

  // If within heartbeat_timeout, worker is fine
  if (elapsed < heartbeatTimeout) {
    return {
      alive: true,
      responded: true,
      probe_count: probeCount,
      action: 'continue',
    };
  }

  // Exceeded heartbeat_timeout — check if process is alive via kill(pid, 0)
  const pid = handle.pid;
  const processAlive = isProcessAlive(pid);

  if (!processAlive) {
    return {
      alive: false,
      responded: false,
      probe_count: probeCount,
      action: 'timed_out',
    };
  }

  // Process is alive but silent — check max probes
  if (probeCount >= maxProbes) {
    return {
      alive: true,
      responded: false,
      probe_count: probeCount,
      action: 'timed_out',
    };
  }

  // Send probe via resume
  const platform = handle.platform;
  let probeCmd: string[] = [];

  if (platform === 'claude-code') {
    probeCmd = [
      'claude',
      '--resume', handle.session_id,
      '-p', 'heartbeat probe: please respond',
    ];
  } else if (platform === 'codex') {
    probeCmd = ['codex', 'exec', 'resume', '--last'];
  } else if (platform === 'opencode') {
    probeCmd = [
      'opencode', 'run', 'heartbeat probe: please respond',
      '--session', handle.session_id,
    ];
  }

  let responded = false;
  if (probeCmd.length > 0) {
    try {
      const [bin, ...args] = probeCmd;
      const probeProc = spawn(bin, args, {
        cwd: handle.worktree_path,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: workerEnv(),
      });

      // Wait for process to exit with a timeout (mirrors proc.wait(timeout=probe_timeout))
      const exitCode = await Promise.race([
        new Promise<number | null>((resolve) => {
          probeProc.on('close', (code) => resolve(code));
          probeProc.on('error', () => resolve(null));
        }),
        sleep(probeTimeout * 1000).then(() => null),
      ]);

      responded = exitCode === 0;
    } catch {
      responded = false;
    }
  }

  const newProbeCount = probeCount + 1;

  if (responded) {
    return {
      alive: true,
      responded: true,
      probe_count: newProbeCount,
      action: 'continue',
    };
  }

  // Probe sent but no response within timeout
  return {
    alive: true,
    responded: false,
    probe_count: newProbeCount,
    action: 'timed_out',
  };
}
