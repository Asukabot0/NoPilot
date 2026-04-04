/**
 * Tests for MOD-002: platform_launcher (TEST-015 through TEST-030)
 * Translated from tests/test_platform_launcher.py
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WorkerHandle } from '../src/lash/types.js';

// ---------------------------------------------------------------------------
// Module-level mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => {
  const mockSpawn = vi.fn();
  const mockExecFile = vi.fn();
  return {
    spawn: mockSpawn,
    execFile: mockExecFile,
  };
});

vi.mock('node:fs', () => {
  const mockReadFileSync = vi.fn();
  return {
    readFileSync: mockReadFileSync,
  };
});

// Import after mocks are set up
import { spawn, execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  preflight,
  spawnWorker,
  resumeWorker,
  cancelWorker,
  checkCompletion,
  monitorHeartbeat,
  readDoneSignal,
} from '../src/lash/platform-launcher.js';

// Typed mock references
const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeHandle(overrides: Partial<WorkerHandle> = {}): WorkerHandle {
  return {
    platform: 'claude-code',
    pid: 12345,
    session_id: 'sess-abc',
    worktree_path: '/tmp/wt',
    module_id: 'mod-1',
    started_at: '2026-04-02T00:00:00',
    ...overrides,
  };
}

/** Create a mock spawn child process. */
function makeMockProc(overrides: {
  pid?: number;
  exitCode?: number | null;
  stdinWrite?: ReturnType<typeof vi.fn>;
  stdinEnd?: ReturnType<typeof vi.fn>;
  onHandlers?: Record<string, ((...args: unknown[]) => void)[]>;
} = {}) {
  const onHandlers: Record<string, ((...args: unknown[]) => void)[]> = overrides.onHandlers ?? {};

  const proc = {
    pid: overrides.pid ?? 42,
    exitCode: overrides.exitCode ?? null,
    stdin: {
      write: overrides.stdinWrite ?? vi.fn(),
      end: overrides.stdinEnd ?? vi.fn(),
    },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!onHandlers[event]) onHandlers[event] = [];
      onHandlers[event].push(cb);
    }),
    _triggerClose: (code: number | null) => {
      (onHandlers['close'] ?? []).forEach((cb) => cb(code));
    },
    _triggerError: (err: Error) => {
      (onHandlers['error'] ?? []).forEach((cb) => cb(err));
    },
  };
  return proc;
}

/**
 * Build a promisify-compatible execFile mock that resolves with stdout/stderr.
 * util.promisify wraps execFile so we mock the raw callback form.
 */
function makeExecFileMock(returncode: number, stdout: string, stderr = '') {
  return vi.fn(
    (
      _bin: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (returncode === 0) {
        cb(null, stdout, stderr);
      } else {
        const err = Object.assign(new Error('command failed'), {
          code: returncode,
          stdout,
          stderr,
        });
        cb(err as unknown as null, stdout, stderr);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Restore mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TEST-015: claude-code spawn → correct command
// ---------------------------------------------------------------------------
describe('spawnWorker', () => {
  it('TEST-015: claude-code with instruction_file uses correct command', () => {
    const mockProc = makeMockProc({ pid: 42 });
    mockSpawn.mockReturnValue(mockProc);

    const handle = spawnWorker(
      'claude-code',
      'implement feature X',
      '/tmp/worktree',
      '.lash/worker-instructions.md',
    );

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [bin, args] = mockSpawn.mock.calls[0] as [string, string[], unknown];
    const fullCmd = [bin, ...args];

    expect(fullCmd[0]).toBe('claude');
    expect(fullCmd).toContain('-p');
    expect(fullCmd).toContain('implement feature X');
    expect(fullCmd).toContain('--session-id');
    expect(fullCmd).toContain('--permission-mode');
    expect(fullCmd).toContain('bypassPermissions');
    expect(fullCmd).toContain('--append-system-prompt-file');
    expect(fullCmd).toContain('.lash/worker-instructions.md');

    expect(handle.platform).toBe('claude-code');
    expect(handle.pid).toBe(42);
    expect(handle.worktree_path).toBe('/tmp/worktree');
  });

  // TEST-016: Codex spawn → correct command
  it('TEST-016: codex spawn uses correct command', () => {
    const mockProc = makeMockProc({ pid: 99 });
    mockSpawn.mockReturnValue(mockProc);

    const handle = spawnWorker('codex', 'fix bug Y', '/tmp/worktree2', null);

    const [bin, args] = mockSpawn.mock.calls[0] as [string, string[], unknown];
    const fullCmd = [bin, ...args];

    expect(fullCmd[0]).toBe('codex');
    expect(fullCmd).toContain('exec');
    expect(fullCmd).toContain('-c');
    expect(fullCmd).toContain('approval_policy=auto-edit');
    expect(fullCmd).toContain('fix bug Y');

    expect(handle.platform).toBe('codex');
    expect(handle.pid).toBe(99);
  });

  // TEST-017: OpenCode spawn → correct command
  it('TEST-017: opencode spawn uses correct command', () => {
    const mockProc = makeMockProc({ pid: 77 });
    mockSpawn.mockReturnValue(mockProc);

    const handle = spawnWorker('opencode', 'refactor Z', '/tmp/worktree3', null);

    const [bin, args] = mockSpawn.mock.calls[0] as [string, string[], unknown];
    const fullCmd = [bin, ...args];

    expect(fullCmd[0]).toBe('opencode');
    expect(fullCmd).toContain('run');
    expect(fullCmd).toContain('refactor Z');
    expect(fullCmd).toContain('--agent');
    expect(fullCmd).toContain('coder');

    expect(handle.platform).toBe('opencode');
    expect(handle.pid).toBe(77);
  });

  it('throws on unknown platform', () => {
    expect(() => spawnWorker('unknown-platform', 'task', '/tmp', null)).toThrow(
      'Unknown platform: unknown-platform',
    );
  });
});

// ---------------------------------------------------------------------------
// TEST-018: exit 0 + diff → completed
// ---------------------------------------------------------------------------
describe('checkCompletion', () => {
  it('TEST-018: exit 0 + diff → completed', async () => {
    const handle = makeHandle();
    const proc = { exitCode: 0 };

    // Mock git diff --stat → has output
    mockExecFile.mockImplementation(
      makeExecFileMock(0, ' 3 files changed, 42 insertions(+)'),
    );

    const status = await checkCompletion(handle, proc);

    expect(status.status).toBe('completed');
    expect(status.exit_code).toBe(0);
    expect(status.has_diff).toBe(true);
  });

  // TEST-019: exit 0 + no diff → completed_empty
  it('TEST-019: exit 0 + no diff → completed_empty', async () => {
    const handle = makeHandle();
    const proc = { exitCode: 0 };

    mockExecFile.mockImplementation(makeExecFileMock(0, ''));

    const status = await checkCompletion(handle, proc);

    expect(status.status).toBe('completed_empty');
    expect(status.exit_code).toBe(0);
    expect(status.has_diff).toBe(false);
  });

  // TEST-020: exit != 0 → failed
  it('TEST-020: nonzero exit → failed', async () => {
    const handle = makeHandle();
    const proc = { exitCode: 1 };

    const status = await checkCompletion(handle, proc);

    expect(status.status).toBe('failed');
    expect(status.exit_code).toBe(1);
    expect(status.has_diff).toBeNull();
  });

  it('TEST-020b: still running (exitCode null) → running', async () => {
    const handle = makeHandle();
    const proc = { exitCode: null };

    const status = await checkCompletion(handle, proc);

    expect(status.status).toBe('running');
    expect(status.exit_code).toBeNull();
    expect(status.has_diff).toBeNull();
  });

  it('no process argument → running', async () => {
    const handle = makeHandle();
    const status = await checkCompletion(handle);

    expect(status.status).toBe('running');
    expect(status.exit_code).toBeNull();
    expect(status.has_diff).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TEST-021: Heartbeat alive + response → continue
// ---------------------------------------------------------------------------
describe('monitorHeartbeat', () => {
  it('TEST-021: recent last_output_time → continue without probe', async () => {
    const handle = makeHandle({ platform: 'claude-code' });
    const proc = { exitCode: null };

    const result = await monitorHeartbeat(
      handle,
      proc,
      300,  // heartbeatTimeout
      60,   // probeTimeout
      2,    // maxProbes
      Date.now() / 1000,  // lastOutputTime = just now
    );

    expect(result.action).toBe('continue');
    expect(result.alive).toBe(true);
  });

  // TEST-022: Heartbeat dead → timed_out
  it('TEST-022: dead process → timed_out', async () => {
    const handle = makeHandle({ platform: 'claude-code', pid: 99999 });
    const proc = { exitCode: null };

    // Mock process.kill to throw ESRCH (process not found)
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid, sig) => {
      if (sig === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      return true;
    });

    const result = await monitorHeartbeat(
      handle,
      proc,
      1,    // heartbeatTimeout = 1s
      60,
      2,
      Date.now() / 1000 - 10,  // 10s ago > 1s timeout
    );

    expect(result.action).toBe('timed_out');
    expect(result.alive).toBe(false);

    killSpy.mockRestore();
  });

  // TEST-023: Max probes exceeded → timed_out
  it('TEST-023: max probes already reached → timed_out without spawning', async () => {
    const handle = makeHandle({ platform: 'claude-code', pid: 12345 });
    const proc = { exitCode: null };

    // Process is alive (kill(0) succeeds)
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

    const result = await monitorHeartbeat(
      handle,
      proc,
      1,    // heartbeatTimeout = 1s
      60,
      2,    // maxProbes
      Date.now() / 1000 - 10,  // exceeded
      2,    // probeCount = already at max
    );

    expect(result.action).toBe('timed_out');
    expect(result.probe_count).toBe(2);
    // No new spawn should have been triggered
    expect(mockSpawn).not.toHaveBeenCalled();

    killSpy.mockRestore();
  });

  it('alive + probe responds → continue', async () => {
    const handle = makeHandle({ platform: 'claude-code', pid: 12345 });
    const proc = { exitCode: null };

    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

    // Probe process exits with code 0 immediately
    const probeProc = makeMockProc({ pid: 999 });
    mockSpawn.mockReturnValue(probeProc);

    // Trigger 'close' event with exit code 0 after spawn
    mockSpawn.mockImplementation(() => {
      // Schedule close event asynchronously
      setTimeout(() => probeProc._triggerClose(0), 0);
      return probeProc;
    });

    const result = await monitorHeartbeat(
      handle,
      proc,
      1,    // heartbeatTimeout
      60,   // probeTimeout
      2,    // maxProbes
      Date.now() / 1000 - 10,  // exceeded
      0,    // probeCount = 0
    );

    expect(result.action).toBe('continue');
    expect(result.responded).toBe(true);
    expect(result.probe_count).toBe(1);

    killSpy.mockRestore();
  });

  it('alive + probe times out → timed_out', async () => {
    const handle = makeHandle({ platform: 'claude-code', pid: 12345 });
    const proc = { exitCode: null };

    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

    // Probe process never exits (hangs)
    const probeProc = makeMockProc({ pid: 999 });
    mockSpawn.mockReturnValue(probeProc);
    // Don't trigger 'close' — simulates timeout

    const result = await monitorHeartbeat(
      handle,
      proc,
      1,    // heartbeatTimeout
      0,    // probeTimeout = 0ms so race resolves immediately to null
      2,    // maxProbes
      Date.now() / 1000 - 10,
      0,
    );

    expect(result.action).toBe('timed_out');
    expect(result.responded).toBe(false);

    killSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TEST-024: All preflight pass
// ---------------------------------------------------------------------------
describe('preflight', () => {
  it('TEST-024: all platforms pass', async () => {
    // All subprocess.run calls succeed
    mockExecFile.mockImplementation(makeExecFileMock(0, '1.2.3\n'));

    const results = await preflight(['claude-code', 'codex', 'opencode']);

    expect(results).toHaveProperty('claude-code');
    expect(results).toHaveProperty('codex');
    expect(results).toHaveProperty('opencode');

    for (const [, r] of Object.entries(results)) {
      expect(r.available).toBe(true);
      expect(r.auth_ok).toBe(true);
      expect(r.error).toBeNull();
    }
  });

  // TEST-025: Binary missing → fail
  it('TEST-025: binary missing marks unavailable', async () => {
    // 'which' returns non-zero
    mockExecFile.mockImplementation(makeExecFileMock(1, ''));

    const results = await preflight(['claude-code']);

    const r = results['claude-code'];
    expect(r.available).toBe(false);
    expect(r.auth_ok).toBe(false);
    expect(r.error).not.toBeNull();
    expect(r.error?.toLowerCase()).toContain('binary');
  });

  // TEST-026: Binary missing → subsequent checks skipped
  it('TEST-026: version check skipped when binary missing', async () => {
    mockExecFile.mockImplementation(makeExecFileMock(1, ''));

    const results = await preflight(['codex']);
    const r = results['codex'];

    expect(r.available).toBe(false);
    expect(r.auth_ok).toBe(false);
    expect(r.error).not.toBeNull();
  });

  it('binary not found error → available=false', async () => {
    mockExecFile.mockImplementation(
      (
        _bin: string,
        _args: string[],
        _opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const err = Object.assign(new Error('not found'), { code: 1, stdout: '', stderr: '' });
        cb(err as unknown as null, '', '');
      },
    );

    const results = await preflight(['claude-code']);
    expect(results['claude-code'].available).toBe(false);
    expect(results['claude-code'].error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TEST-027: CC resume command
// ---------------------------------------------------------------------------
describe('resumeWorker', () => {
  it('TEST-027: claude-code resume uses correct command', async () => {
    const mockProc = makeMockProc({ pid: 200 });
    mockSpawn.mockReturnValue(mockProc);

    const handle = makeHandle({ platform: 'claude-code', session_id: 'resume-sess-001' });
    await resumeWorker(handle, 'please fix the import error');

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [bin, args] = mockSpawn.mock.calls[0] as [string, string[], unknown];
    const fullCmd = [bin, ...args];

    expect(fullCmd[0]).toBe('claude');
    expect(fullCmd).toContain('--resume');
    expect(fullCmd).toContain('resume-sess-001');
    expect(fullCmd).toContain('-p');
    expect(fullCmd).toContain('please fix the import error');
  });

  // TEST-028: Codex resume command
  it('TEST-028: codex resume writes feedback to stdin', async () => {
    const stdinWrite = vi.fn();
    const stdinEnd = vi.fn();
    const mockProc = makeMockProc({ pid: 201, stdinWrite, stdinEnd });

    // Trigger 'close' immediately so resumeWorker doesn't hang
    mockSpawn.mockImplementation(() => {
      setTimeout(() => mockProc._triggerClose(0), 0);
      return mockProc;
    });

    const handle = makeHandle({ platform: 'codex', session_id: 'codex-sess-002' });
    await resumeWorker(handle, 'retry with different approach');

    const [bin, args] = mockSpawn.mock.calls[0] as [string, string[], unknown];
    const fullCmd = [bin, ...args];

    expect(fullCmd[0]).toBe('codex');
    expect(fullCmd).toContain('exec');
    expect(fullCmd).toContain('resume');
    expect(fullCmd).toContain('--last');

    // Feedback passed as stdin write
    expect(stdinWrite).toHaveBeenCalledWith('retry with different approach', 'utf8');
    expect(stdinEnd).toHaveBeenCalled();
  });

  it('opencode resume uses correct command', async () => {
    const mockProc = makeMockProc({ pid: 202 });
    mockSpawn.mockReturnValue(mockProc);

    const handle = makeHandle({ platform: 'opencode', session_id: 'oc-sess-003' });
    await resumeWorker(handle, 'some opencode feedback');

    const [bin, args] = mockSpawn.mock.calls[0] as [string, string[], unknown];
    const fullCmd = [bin, ...args];

    expect(fullCmd[0]).toBe('opencode');
    expect(fullCmd).toContain('run');
    expect(fullCmd).toContain('some opencode feedback');
    expect(fullCmd).toContain('--session');
    expect(fullCmd).toContain('oc-sess-003');
  });

  it('unknown platform throws', async () => {
    const handle = makeHandle({ platform: 'unknown' as WorkerHandle['platform'] });
    await expect(resumeWorker(handle, 'feedback')).rejects.toThrow('Unknown platform');
  });
});

// ---------------------------------------------------------------------------
// TEST-029: Graceful SIGTERM cancel
// ---------------------------------------------------------------------------
describe('cancelWorker', () => {
  it('TEST-029: SIGTERM sent, process exits gracefully → killed=false', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

    const handle = makeHandle({ pid: 54321 });

    // Provide a mock proc that exits immediately (graceful)
    const mockProc = {
      pid: 54321,
      waitForExit: vi.fn().mockResolvedValue(0),
    };

    const result = await cancelWorker(handle, mockProc, 0);

    // SIGTERM should have been sent
    expect(killSpy).toHaveBeenCalledWith(54321, 'SIGTERM');
    expect(result).toEqual({ killed: false });

    killSpy.mockRestore();
  });

  // TEST-030: Forced SIGKILL cancel
  it('TEST-030: SIGTERM sent but process refuses → SIGKILL, killed=true', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

    const handle = makeHandle({ pid: 99999 });

    // Provide a mock proc that never exits (timeout → null)
    const mockProc = {
      pid: 99999,
      waitForExit: vi.fn().mockResolvedValue(null),
    };

    const result = await cancelWorker(handle, mockProc, 0);

    const calls = killSpy.mock.calls;
    const sigtermSent = calls.some((c) => c[0] === 99999 && c[1] === 'SIGTERM');
    const sigkillSent = calls.some((c) => c[0] === 99999 && c[1] === 'SIGKILL');
    expect(sigtermSent).toBe(true);
    expect(sigkillSent).toBe(true);
    expect(result.killed).toBe(true);

    killSpy.mockRestore();
  });

  it('process not found on SIGTERM → killed=false immediately', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    });

    const handle = makeHandle({ pid: 11111 });
    const result = await cancelWorker(handle, undefined, 0);

    expect(result.killed).toBe(false);
    killSpy.mockRestore();
  });

  it('no proc handle: checks pid alive, not alive → killed=false', async () => {
    let callCount = 0;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((_pid, sig) => {
      callCount++;
      if (sig === 0 && callCount >= 2) {
        // Second call (the alive check after sleep) → throw ESRCH
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      }
      return true;
    });

    const handle = makeHandle({ pid: 22222 });
    const result = await cancelWorker(handle, undefined, 0);

    expect(result.killed).toBe(false);
    killSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// readDoneSignal
// ---------------------------------------------------------------------------
describe('readDoneSignal', () => {
  it('returns valid completed signal', () => {
    const signal = {
      status: 'completed',
      timestamp: '2026-04-04T12:00:00',
      module_id: 'MOD-001',
      summary: 'Implemented feature',
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(signal));

    const result = readDoneSignal('/tmp/wt');
    expect(result).toEqual(signal);
  });

  it('returns valid failed signal', () => {
    const signal = {
      status: 'failed',
      timestamp: '2026-04-04T12:00:00',
      module_id: 'MOD-001',
      summary: 'Tests did not pass',
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(signal));

    const result = readDoneSignal('/tmp/wt');
    expect(result).toEqual(signal);
  });

  it('returns null when file missing', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = readDoneSignal('/tmp/wt');
    expect(result).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    mockReadFileSync.mockReturnValue('not json');

    const result = readDoneSignal('/tmp/wt');
    expect(result).toBeNull();
  });

  it('returns null when required fields missing', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ status: 'completed' }));

    const result = readDoneSignal('/tmp/wt');
    expect(result).toBeNull();
  });

  it('returns null on invalid status value', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      status: 'running',
      timestamp: '2026-04-04T12:00:00',
      module_id: 'MOD-001',
    }));

    const result = readDoneSignal('/tmp/wt');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkCompletion — done.json signal priority
// ---------------------------------------------------------------------------
describe('checkCompletion with done signal', () => {
  it('done.json completed takes priority over process still running', async () => {
    const signal = {
      status: 'completed',
      timestamp: '2026-04-04T12:00:00',
      module_id: 'MOD-001',
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(signal));

    const handle = makeHandle();
    const proc = { exitCode: null }; // still running

    const status = await checkCompletion(handle, proc);
    expect(status.status).toBe('completed');
    expect(status.exit_code).toBe(0);
    expect(status.has_diff).toBe(true);
  });

  it('done.json failed takes priority over process exit 0', async () => {
    const signal = {
      status: 'failed',
      timestamp: '2026-04-04T12:00:00',
      module_id: 'MOD-001',
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(signal));

    const handle = makeHandle();
    const proc = { exitCode: 0 };

    const status = await checkCompletion(handle, proc);
    expect(status.status).toBe('failed');
    expect(status.exit_code).toBe(1);
  });

  it('no done.json falls back to PID-based detection', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const handle = makeHandle();
    // no proc → running
    const status = await checkCompletion(handle);
    expect(status.status).toBe('running');
  });
});
