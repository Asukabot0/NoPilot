/**
 * Tests for MOD-002: cleanup-specs CLI command and state update hook.
 * Covers TC-007, TC-008, TC-009.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIST_CLI = join(import.meta.dirname, '..', 'dist', 'lash', 'cli.js');

function runLashInDir(
  cwd: string,
  ...args: string[]
): { returncode: number; stdout: string; stderr: string } {
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
  return mkdtempSync(join(tmpdir(), 'lash-cleanup-test-'));
}

function makeSpecsDir(tmpDir: string): string {
  const specsDir = join(tmpDir, 'specs');
  mkdirSync(specsDir, { recursive: true });
  return specsDir;
}

// ---------------------------------------------------------------------------
// TC-007: lash cleanup-specs command cleans root artifacts
// ---------------------------------------------------------------------------

describe('TC-007: lash cleanup-specs root mode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes root-level JSON files from specs/ and preserves .gitkeep', () => {
    const specsDir = makeSpecsDir(tmpDir);
    writeFileSync(join(specsDir, 'spec.json'), '{"phase":"spec"}');
    writeFileSync(join(specsDir, 'discover.json'), '{"phase":"discover"}');
    writeFileSync(join(specsDir, '.gitkeep'), '');

    const result = runLashInDir(tmpDir, 'cleanup-specs');

    expect(result.returncode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.removedPaths.length).toBeGreaterThanOrEqual(2);
    expect(output.preservedPaths.length).toBeGreaterThanOrEqual(1);

    expect(existsSync(join(specsDir, 'spec.json'))).toBe(false);
    expect(existsSync(join(specsDir, 'discover.json'))).toBe(false);
    expect(existsSync(join(specsDir, '.gitkeep'))).toBe(true);
  });

  it('removes discover/, spec/, views/, mockups/ directories', () => {
    const specsDir = makeSpecsDir(tmpDir);
    for (const dir of ['discover', 'spec', 'views', 'mockups']) {
      const d = join(specsDir, dir);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'index.json'), '{}');
    }

    const result = runLashInDir(tmpDir, 'cleanup-specs');

    expect(result.returncode).toBe(0);
    for (const dir of ['discover', 'spec', 'views', 'mockups']) {
      expect(existsSync(join(specsDir, dir))).toBe(false);
    }
  });

  it('is idempotent on empty specs/', () => {
    const specsDir = makeSpecsDir(tmpDir);
    writeFileSync(join(specsDir, '.gitkeep'), '');

    const result = runLashInDir(tmpDir, 'cleanup-specs');

    expect(result.returncode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.removedPaths).toEqual([]);
    expect(existsSync(join(specsDir, '.gitkeep'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-008: lash cleanup-specs --feature cleans feature directory
// ---------------------------------------------------------------------------

describe('TC-008: lash cleanup-specs --feature mode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes specs/features/{name}/ directory', () => {
    const specsDir = makeSpecsDir(tmpDir);
    const featureDir = join(specsDir, 'features', 'my-feature');
    mkdirSync(join(featureDir, 'spec'), { recursive: true });
    writeFileSync(join(featureDir, 'spec', 'index.json'), '{}');

    const result = runLashInDir(tmpDir, 'cleanup-specs', '--feature', 'my-feature');

    expect(result.returncode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.removedPaths).toContain(featureDir);
    expect(existsSync(featureDir)).toBe(false);
    expect(existsSync(join(specsDir, 'features'))).toBe(true);
  });

  it('does not affect other features', () => {
    const specsDir = makeSpecsDir(tmpDir);
    for (const name of ['feature-a', 'feature-b']) {
      const d = join(specsDir, 'features', name, 'spec');
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'index.json'), '{}');
    }

    const result = runLashInDir(tmpDir, 'cleanup-specs', '--feature', 'feature-a');

    expect(result.returncode).toBe(0);
    expect(existsSync(join(specsDir, 'features', 'feature-a'))).toBe(false);
    expect(existsSync(join(specsDir, 'features', 'feature-b'))).toBe(true);
  });

  it('is idempotent when feature does not exist', () => {
    makeSpecsDir(tmpDir);

    const result = runLashInDir(tmpDir, 'cleanup-specs', '--feature', 'nonexistent');

    expect(result.returncode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.removedPaths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-009: state update build_completed triggers cleanup
// ---------------------------------------------------------------------------

describe('TC-009: state update build_completed triggers cleanup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('updates state and auto-cleans spec artifacts', () => {
    const statePath = join(tmpDir, 'specs', 'build-state.json');
    const specsDir = makeSpecsDir(tmpDir);
    writeFileSync(join(specsDir, 'spec.json'), '{"phase":"spec"}');
    writeFileSync(join(specsDir, '.gitkeep'), '');

    // Create initial state
    const createResult = runLashInDir(
      tmpDir, 'state', 'create', '--spec-hash', 'abc123', '--state-path', statePath,
    );
    expect(createResult.returncode).toBe(0);

    const tracerResult = runLashInDir(
      tmpDir, 'state', 'update', 'tracer_completed', '--state-path', statePath, '--data', '{}',
    );
    expect(tracerResult.returncode).toBe(0);

    const criticResult = runLashInDir(
      tmpDir, 'state', 'update', 'build_critic_spawned', '--state-path', statePath, '--data', '{}',
    );
    expect(criticResult.returncode).toBe(0);

    const criticPassedResult = runLashInDir(
      tmpDir, 'state', 'update', 'build_critic_passed', '--state-path', statePath, '--data', '{}',
    );
    expect(criticPassedResult.returncode).toBe(0);

    const supervisorResult = runLashInDir(
      tmpDir, 'state', 'update', 'supervisor_spawned', '--state-path', statePath, '--data', '{}',
    );
    expect(supervisorResult.returncode).toBe(0);

    const supervisorPassedResult = runLashInDir(
      tmpDir, 'state', 'update', 'supervisor_passed', '--state-path', statePath, '--data', '{}',
    );
    expect(supervisorPassedResult.returncode).toBe(0);

    // Trigger build_completed
    const result = runLashInDir(
      tmpDir, 'state', 'update', 'build_completed', '--state-path', statePath,
    );

    expect(result.returncode).toBe(0);
    const stateOutput = JSON.parse(result.stdout);
    expect(stateOutput.status).toBe('completed');

    // spec.json should have been auto-cleaned
    expect(existsSync(join(specsDir, 'spec.json'))).toBe(false);
    // .gitkeep preserved
    expect(existsSync(join(specsDir, '.gitkeep'))).toBe(true);
  });

  it('does not trigger cleanup for other events', () => {
    const statePath = join(tmpDir, 'specs', 'build-state.json');
    const specsDir = makeSpecsDir(tmpDir);
    writeFileSync(join(specsDir, 'spec.json'), '{"phase":"spec"}');

    // Create initial state
    runLashInDir(tmpDir, 'state', 'create', '--spec-hash', 'abc123', '--state-path', statePath);

    // Trigger a non-completion event
    runLashInDir(
      tmpDir, 'state', 'update', 'build_paused',
      '--data', '{"reason":"l2"}',
      '--state-path', statePath,
    );

    // spec.json should still exist
    expect(existsSync(join(specsDir, 'spec.json'))).toBe(true);
  });

  it('accepts tracer_completed through CLI and advances current_phase', () => {
    const statePath = join(tmpDir, 'specs', 'build-state.json');
    makeSpecsDir(tmpDir);

    const createResult = runLashInDir(
      tmpDir, 'state', 'create', '--spec-hash', 'abc123', '--state-path', statePath,
    );
    expect(createResult.returncode).toBe(0);

    const result = runLashInDir(
      tmpDir, 'state', 'update', 'tracer_completed', '--state-path', statePath, '--data', '{}',
    );

    expect(result.returncode).toBe(0);
    const stateOutput = JSON.parse(result.stdout);
    expect(stateOutput.current_phase).toBe('batch_execution');
    expect(stateOutput.tracer.status).toBe('completed');
  });

  it('rejects build_completed until critic and supervisor pass events exist', () => {
    const statePath = join(tmpDir, 'specs', 'build-state.json');
    const specsDir = makeSpecsDir(tmpDir);
    writeFileSync(join(specsDir, 'spec.json'), '{"phase":"spec"}');

    expect(runLashInDir(
      tmpDir, 'state', 'create', '--spec-hash', 'abc123', '--state-path', statePath,
    ).returncode).toBe(0);
    expect(runLashInDir(
      tmpDir, 'state', 'update', 'tracer_completed', '--state-path', statePath, '--data', '{}',
    ).returncode).toBe(0);
    expect(runLashInDir(
      tmpDir, 'state', 'update', 'build_critic_spawned', '--state-path', statePath, '--data', '{}',
    ).returncode).toBe(0);
    expect(runLashInDir(
      tmpDir, 'state', 'update', 'build_critic_passed', '--state-path', statePath, '--data', '{}',
    ).returncode).toBe(0);
    expect(runLashInDir(
      tmpDir, 'state', 'update', 'supervisor_spawned', '--state-path', statePath, '--data', '{}',
    ).returncode).toBe(0);

    const result = runLashInDir(
      tmpDir, 'state', 'update', 'build_completed', '--state-path', statePath,
    );

    expect(result.returncode).toBe(1);
    expect(result.stderr).toContain('supervisor_passed');
    expect(existsSync(join(specsDir, 'spec.json'))).toBe(true);
  });
});
