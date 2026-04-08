/**
 * Tests for src/lash/cli.ts — translated from tests/test_cli_subcommands.py.
 * Tests wire-up of CLI subcommands using subprocess JSON protocol.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIST_CLI = join(import.meta.dirname, '..', 'dist', 'lash', 'cli.js');

function runLash(...args: string[]): { returncode: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [DIST_CLI, ...args], {
    encoding: 'utf-8',
    timeout: 25_000,
  });
  return {
    returncode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function runLashInDir(cwd: string, ...args: string[]): { returncode: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [DIST_CLI, ...args], {
    encoding: 'utf-8',
    timeout: 25_000,
    cwd,
  });
  return {
    returncode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'lash-cli-test-'));
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data));
}

function makeMinimalSpec(tmpDir: string): string {
  const spec = {
    phase: 'spec',
    version: '4.0',
    modules: [
      {
        id: 'MOD-A',
        source_root: 'src/',
        owned_files: ['a.ts'],
        depends_on: [],
        requirement_refs: ['REQ-001'],
      },
    ],
    dependency_graph: { 'MOD-A': [] },
  };
  const path = join(tmpDir, 'spec.json');
  writeJson(path, spec);
  return path;
}

function makeMinimalDiscover(tmpDir: string): string {
  const discover = {
    phase: 'discover',
    version: '4.0',
    status: 'approved',
    requirements: [{ id: 'REQ-001' }],
    core_scenarios: [
      {
        id: 'SCENARIO-001',
        description: 'Default',
        requirement_refs: ['REQ-001'],
        priority: 'highest',
      },
    ],
  };
  const path = join(tmpDir, 'discover.json');
  writeJson(path, discover);
  return path;
}

function makeTestResultFile(tmpDir: string, stderr = 'AssertionError: expected 1 got 2'): string {
  const testResult = {
    passed: false,
    exit_code: 1,
    stdout: '',
    stderr,
    duration_seconds: 0.5,
    summary: '1 failed',
  };
  const path = join(tmpDir, 'test_output.json');
  writeJson(path, testResult);
  return path;
}

// ---------------------------------------------------------------------------
// 1. lash --help
// ---------------------------------------------------------------------------

describe('lash --help', () => {
  it('returns zero exit code', () => {
    const result = runLash('--help');
    expect(result.returncode).toBe(0);
  });

  it('mentions key subcommands', () => {
    const result = runLash('--help');
    const output = result.stdout + result.stderr;
    expect(output).toContain('plan');
    expect(output).toContain('preflight');
    expect(output).toContain('state');
  });
});

// ---------------------------------------------------------------------------
// 2. lash plan <spec> <discover> — valid JSON files
// ---------------------------------------------------------------------------

describe('lash plan', () => {
  it('returns JSON with batches and spec_hash for valid files', () => {
    const tmpDir = makeTmpDir();
    const specPath = makeMinimalSpec(tmpDir);
    const discoverPath = makeMinimalDiscover(tmpDir);

    const result = runLash('plan', specPath, discoverPath);
    expect(result.returncode).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('batches');
    expect(data).toHaveProperty('spec_hash');
  });

  it('batches array is not empty', () => {
    const tmpDir = makeTmpDir();
    const specPath = makeMinimalSpec(tmpDir);
    const discoverPath = makeMinimalDiscover(tmpDir);

    const result = runLash('plan', specPath, discoverPath);
    const data = JSON.parse(result.stdout);
    expect(data.batches.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 3. lash plan — missing files → non-zero exit
// ---------------------------------------------------------------------------

describe('lash plan missing files', () => {
  it('returns non-zero for missing spec/discover files', () => {
    const result = runLash('plan', '/nonexistent/spec.json', '/nonexistent/discover.json');
    expect(result.returncode).not.toBe(0);
  });

  it('returns non-zero when no args given and no artifacts found', () => {
    const tmp = makeTmpDir();
    const result = runLashInDir(tmp, 'plan');
    expect(result.returncode).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. lash preflight --platforms claude-code
// ---------------------------------------------------------------------------

describe('lash preflight', () => {
  it('returns JSON with platform key', { timeout: 30_000 }, () => {
    const result = runLash('preflight', '--platforms', 'claude-code');
    expect(result.returncode).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('claude-code');
  });

  it('platform entry has available key', { timeout: 30_000 }, () => {
    const result = runLash('preflight', '--platforms', 'claude-code');
    const data = JSON.parse(result.stdout);
    expect(data['claude-code']).toHaveProperty('available');
  });
});

// ---------------------------------------------------------------------------
// 5. lash state create --spec-hash abc123
// ---------------------------------------------------------------------------

describe('lash state create', () => {
  it('returns JSON with status=in_progress', () => {
    const tmpDir = makeTmpDir();
    const statePath = join(tmpDir, 'build-state.json');

    const result = runLash(
      'state', 'create',
      '--spec-hash', 'abc123',
      '--state-path', statePath,
    );
    expect(result.returncode).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data.status).toBe('in_progress');
  });

  it('contains spec_hash', () => {
    const tmpDir = makeTmpDir();
    const statePath = join(tmpDir, 'build-state.json');

    const result = runLash(
      'state', 'create',
      '--spec-hash', 'abc123',
      '--state-path', statePath,
    );
    const data = JSON.parse(result.stdout);
    expect(data.spec_hash).toBe('abc123');
  });

  it('writes state file to disk', () => {
    const tmpDir = makeTmpDir();
    const statePath = join(tmpDir, 'build-state.json');

    runLash(
      'state', 'create',
      '--spec-hash', 'deadbeef',
      '--state-path', statePath,
    );

    expect(existsSync(statePath)).toBe(true);
    const persisted = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(persisted.spec_hash).toBe('deadbeef');
  });
});

// ---------------------------------------------------------------------------
// 6. lash classify <file> → JSON with "level"
// ---------------------------------------------------------------------------

describe('lash classify', () => {
  it('returns JSON with level field', () => {
    const tmpDir = makeTmpDir();
    const outputFile = makeTestResultFile(tmpDir);

    const result = runLash('classify', outputFile, '--owned-files', 'src/a.ts');
    expect(result.returncode).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('level');
  });

  it('AssertionError yields L1', () => {
    const tmpDir = makeTmpDir();
    const outputFile = makeTestResultFile(tmpDir, 'AssertionError: values differ');

    const result = runLash('classify', outputFile, '--owned-files', 'src/a.ts');
    const data = JSON.parse(result.stdout);
    expect(data.level).toBe('L1');
  });

  it('contains reasons array', () => {
    const tmpDir = makeTmpDir();
    const outputFile = makeTestResultFile(tmpDir);

    const result = runLash('classify', outputFile);
    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('reasons');
    expect(Array.isArray(data.reasons)).toBe(true);
  });

  it('returns non-zero for missing file', () => {
    const result = runLash('classify', '/nonexistent/output.json');
    expect(result.returncode).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. lash worktree --help
// ---------------------------------------------------------------------------

describe('lash worktree --help', () => {
  it('returns zero exit code', () => {
    const result = runLash('worktree', '--help');
    expect(result.returncode).toBe(0);
  });

  it('mentions subcommands', () => {
    const result = runLash('worktree', '--help');
    const output = result.stdout + result.stderr;
    const mentionsSubcommand =
      output.includes('create') || output.includes('merge') || output.includes('cleanup');
    expect(mentionsSubcommand).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. lash state --help
// ---------------------------------------------------------------------------

describe('lash state --help', () => {
  it('returns zero exit code', () => {
    const result = runLash('state', '--help');
    expect(result.returncode).toBe(0);
  });

  it('mentions subcommands', () => {
    const result = runLash('state', '--help');
    const output = result.stdout + result.stderr;
    const mentionsSubcommand =
      output.includes('create') || output.includes('update') || output.includes('resume');
    expect(mentionsSubcommand).toBe(true);
  });
});
