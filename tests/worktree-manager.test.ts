/**
 * Tests for MOD-003: worktree_manager (TEST-031 through TEST-037)
 * Translated from tests/test_worktree_manager.py
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Mock node:child_process at the exec level so _runGit is intercepted.
// vi.hoisted() ensures mockExec is declared before vi.mock hoisting.
// ---------------------------------------------------------------------------

const { mockExec } = vi.hoisted(() => ({ mockExec: vi.fn() }));

vi.mock('node:child_process', () => ({
  exec: mockExec,
}));

// Mock node:util promisify to return an async wrapper around the mocked exec.
vi.mock('node:util', () => ({
  promisify: (fn: unknown) =>
    (...args: unknown[]) =>
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const cb = (err: Error | null, result: { stdout: string; stderr: string }) => {
          if (err) reject(err);
          else resolve(result);
        };
        (fn as (...a: unknown[]) => void)(...args, cb);
      }),
}));

import {
  createWorktree,
  mergeToMain,
  cleanupWorktree,
  preserveWorktree,
  createConflictResolutionWorktree,
  checkUnexpectedFiles,
} from '../src/lash/worktree-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = '/fake/project';

/**
 * Queue a successful exec result (returncode 0).
 */
function queueOk(stdout = '', stderr = '') {
  mockExec.mockImplementationOnce(
    (_cmd: string, _opts: unknown, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout, stderr });
    },
  );
}

/**
 * Queue a failed exec result (non-zero exit code).
 * node child_process exec throws an Error with stdout/stderr attached when exit != 0.
 */
function queueFail(stdout = '', stderr = '', code = 1) {
  mockExec.mockImplementationOnce(
    (_cmd: string, _opts: unknown, cb: (err: Error & { stdout?: string; stderr?: string; code?: number }, result?: unknown) => void) => {
      const err = Object.assign(new Error(stderr || 'git error'), { stdout, stderr, code });
      cb(err);
    },
  );
}

beforeEach(() => {
  mockExec.mockReset();
});

// ---------------------------------------------------------------------------
// TEST-031: create_worktree → correct path and branch name
// ---------------------------------------------------------------------------

describe('createWorktree (TEST-031)', () => {
  it('returns correct worktree_path and branch_name', async () => {
    queueOk('abc1234\n');  // rev-parse HEAD
    queueOk();             // worktree add

    const result = await createWorktree('MOD-003', PROJECT_ROOT);

    const expectedPath = join(PROJECT_ROOT, '.lash', 'worktrees', 'MOD-003');
    expect(result.worktree_path).toBe(expectedPath);
    expect(result.branch_name).toBe('lash/MOD-003');

    // Verify worktree add command was called with correct args
    const worktreeCmd: string = mockExec.mock.calls[1][0];
    expect(worktreeCmd).toContain('worktree');
    expect(worktreeCmd).toContain('add');
    expect(worktreeCmd).toContain('lash/MOD-003');
    expect(worktreeCmd).toContain(JSON.stringify(expectedPath));
  });

  it('throws worktree_exists when worktree already exists', async () => {
    queueOk('abc1234\n');               // rev-parse HEAD
    queueFail('', 'already exists', 128);  // worktree add fails

    await expect(createWorktree('MOD-003', PROJECT_ROOT)).rejects.toThrow('worktree_exists');
  });

  it('throws git_error on HEAD resolution failure', async () => {
    queueFail('', 'fatal: not a git repo', 128);

    await expect(createWorktree('MOD-003', PROJECT_ROOT)).rejects.toThrow('git_error');
  });
});

// ---------------------------------------------------------------------------
// TEST-032: merge_to_main → success with commit hash
// ---------------------------------------------------------------------------

describe('mergeToMain success (TEST-032)', () => {
  it('clean merge returns MergeResult with commit hash', async () => {
    const worktreePath = join(PROJECT_ROOT, '.lash', 'worktrees', 'MOD-003');
    queueOk(`${worktreePath} abc1234 [lash/MOD-003]\n`);  // worktree list
    queueOk();                                             // checkout main
    queueOk();                                             // merge --no-ff
    queueOk('deadbeef\n');                                 // rev-parse HEAD

    const result = await mergeToMain('MOD-003', PROJECT_ROOT);

    expect(result.success).toBe(true);
    expect(result.branch_name).toBe('lash/MOD-003');
    expect(result.conflict_files).toBeNull();
    expect(result.merge_commit).toBe('deadbeef');
  });

  it('throws no_worktree when worktree not found', async () => {
    queueOk('');  // worktree list → empty

    await expect(mergeToMain('MOD-003', PROJECT_ROOT)).rejects.toThrow('no_worktree');
  });
});

// ---------------------------------------------------------------------------
// TEST-033: merge conflict → abort, conflict_files listed
// ---------------------------------------------------------------------------

describe('mergeToMain conflict (TEST-033)', () => {
  it('conflict aborts and lists conflict files', async () => {
    const conflictOutput =
      'Auto-merging lash/foo.py\n' +
      'CONFLICT (content): Merge conflict in lash/foo.py\n' +
      'Auto-merging tests/test_foo.py\n' +
      'CONFLICT (content): Merge conflict in tests/test_foo.py\n';

    const worktreePath = join(PROJECT_ROOT, '.lash', 'worktrees', 'MOD-003');
    queueOk(`${worktreePath} abc1234 [lash/MOD-003]\n`);  // worktree list
    queueOk();                                             // checkout main
    queueFail(conflictOutput, '', 1);                      // merge --no-ff conflict
    queueOk();                                             // merge --abort

    const result = await mergeToMain('MOD-003', PROJECT_ROOT);

    expect(result.success).toBe(false);
    expect(result.branch_name).toBe('lash/MOD-003');
    expect(result.merge_commit).toBeNull();
    expect(result.conflict_files).not.toBeNull();
    expect(result.conflict_files).toContain('lash/foo.py');
    expect(result.conflict_files).toContain('tests/test_foo.py');

    // Verify merge --abort was called
    const abortCmd: string = mockExec.mock.calls[3][0];
    expect(abortCmd).toContain('merge');
    expect(abortCmd).toContain('--abort');
  });
});

// ---------------------------------------------------------------------------
// TEST-034: Failed worker → preserve_worktree returns preserved path
// ---------------------------------------------------------------------------

describe('preserveWorktree (TEST-034)', () => {
  it('returns correct preserved_path', () => {
    const result = preserveWorktree('MOD-003', 'tests_failed', PROJECT_ROOT);

    const expectedPath = join(PROJECT_ROOT, '.lash', 'worktrees', 'MOD-003');
    expect(result.preserved_path).toBe(expectedPath);
  });

  it('stores module_id in preserved_path', () => {
    const result = preserveWorktree('MOD-007', 'merge_conflict', PROJECT_ROOT);

    expect(result).toHaveProperty('preserved_path');
    expect(result.preserved_path).toContain('MOD-007');
  });
});

// ---------------------------------------------------------------------------
// TEST-035: Cleanup removes worktree and branch
// ---------------------------------------------------------------------------

describe('cleanupWorktree (TEST-035)', () => {
  it('calls worktree remove and branch delete', async () => {
    queueOk();  // worktree remove
    queueOk();  // branch -D

    await cleanupWorktree('MOD-003', PROJECT_ROOT);

    expect(mockExec).toHaveBeenCalledTimes(2);

    const firstCmd: string = mockExec.mock.calls[0][0];
    expect(firstCmd).toContain('worktree');
    expect(firstCmd).toContain('remove');
    expect(firstCmd).toContain(JSON.stringify(join(PROJECT_ROOT, '.lash', 'worktrees', 'MOD-003')));

    const secondCmd: string = mockExec.mock.calls[1][0];
    expect(secondCmd).toContain('branch');
    expect(secondCmd).toContain('lash/MOD-003');
  });

  it('throws git_error on failure', async () => {
    queueFail('', 'not a worktree', 1);

    await expect(cleanupWorktree('MOD-003', PROJECT_ROOT)).rejects.toThrow('git_error');
  });

  it('preserved worktrees survive (preserve does not call cleanup)', () => {
    const result = preserveWorktree('MOD-007', 'tests_failed', PROJECT_ROOT);

    expect(result).toHaveProperty('preserved_path');
    expect(result.preserved_path.endsWith('MOD-007')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEST-036: check_unexpected_files detects out-of-scope modifications
// ---------------------------------------------------------------------------

describe('checkUnexpectedFiles (TEST-036)', () => {
  it('returns clean when all modified files are owned', async () => {
    queueOk('lash/worktree_manager.py\ntests/test_worktree_manager.py\n');

    const owned = ['lash/worktree_manager.py', 'tests/test_worktree_manager.py'];
    const result = await checkUnexpectedFiles('MOD-003', owned, PROJECT_ROOT);

    expect(result.clean).toBe(true);
    expect(result.unexpected_files).toEqual([]);
  });

  it('detects out-of-scope modifications', async () => {
    queueOk('lash/worktree_manager.py\nlash/plan_generator.py\n');

    const owned = ['lash/worktree_manager.py', 'tests/test_worktree_manager.py'];
    const result = await checkUnexpectedFiles('MOD-003', owned, PROJECT_ROOT);

    expect(result.clean).toBe(false);
    expect(result.unexpected_files).toContain('lash/plan_generator.py');
    expect(result.unexpected_files).not.toContain('lash/worktree_manager.py');
  });

  it('empty diff is clean', async () => {
    queueOk('');

    const result = await checkUnexpectedFiles('MOD-003', ['lash/foo.py'], PROJECT_ROOT);

    expect(result.clean).toBe(true);
    expect(result.unexpected_files).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TEST-037: Conflict resolution worktree created correctly
// ---------------------------------------------------------------------------

describe('createConflictResolutionWorktree (TEST-037)', () => {
  it('returns correct worktree_path with conflict-resolve suffix', async () => {
    queueOk('abc1234\n');  // rev-parse source branch
    queueOk();             // worktree add

    const result = await createConflictResolutionWorktree(
      'MOD-003',
      'lash/MOD-003',
      'main',
      PROJECT_ROOT,
    );

    const expectedPath = join(PROJECT_ROOT, '.lash', 'worktrees', 'MOD-003-conflict-resolve');
    expect(result.worktree_path).toBe(expectedPath);
    expect(result.branch_name).toContain('conflict-resolve');
  });

  it('branch name follows lash/<moduleId>-conflict-resolve convention', async () => {
    queueOk('deadbeef\n');  // rev-parse
    queueOk();              // worktree add

    const result = await createConflictResolutionWorktree(
      'MOD-007',
      'lash/MOD-007',
      'main',
      PROJECT_ROOT,
    );

    expect(result.branch_name).toBe('lash/MOD-007-conflict-resolve');
  });

  it('throws git_error on worktree add failure', async () => {
    queueOk('abc1234\n');                            // rev-parse
    queueFail('', 'fatal: already exists', 128);     // worktree add fails

    await expect(
      createConflictResolutionWorktree('MOD-003', 'lash/MOD-003', 'main', PROJECT_ROOT),
    ).rejects.toThrow('git_error');
  });
});
