import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBenchmarkCase } from '../src/benchmark/case-loader.js';
import {
  getPhase1RunProfile,
  validateRunContract,
} from '../src/benchmark/run-profile.js';

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

function computeExpectedFixtureHash(files: Record<string, string>): string {
  const hash = createHash('sha256');
  const names = Object.keys(files).sort();

  for (const name of names) {
    hash.update(name);
    hash.update('\n');
    hash.update(files[name]);
    hash.update('\n');
  }

  return hash.digest('hex');
}

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('loadBenchmarkCase', () => {
  it('rejects a case missing required files and required metadata fields with structured details', () => {
    const caseDir = makeTempDir('benchmark-case-');
    cleanupPaths.push(caseDir);

    mkdirSync(join(caseDir, 'fixture'), { recursive: true });
    writeJson(join(caseDir, 'case.json'), {
      id: 'CASE-001',
      case_version: '2026-04-09',
      fixture: 'fixture',
    });
    writeFileSync(join(caseDir, 'prompt.txt'), 'Do the task.\n', 'utf-8');

    try {
      loadBenchmarkCase(caseDir);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'case_missing_file',
        details: {
          missingFiles: ['oracle.json'],
        },
      });
    }
  });

  it('reports invalid case.json as case_schema_invalid instead of throwing SyntaxError', () => {
    const caseDir = makeTempDir('benchmark-case-');
    cleanupPaths.push(caseDir);

    mkdirSync(join(caseDir, 'fixture'), { recursive: true });
    writeFileSync(join(caseDir, 'case.json'), '{"id": "CASE-003",', 'utf-8');
    writeFileSync(join(caseDir, 'prompt.txt'), 'Broken case JSON.\n', 'utf-8');
    writeJson(join(caseDir, 'oracle.json'), {
      verdict: 'pass',
    });

    try {
      loadBenchmarkCase(caseDir);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'case_schema_invalid',
      });
    }
  });

  it('reports invalid oracle.json as oracle_schema_invalid instead of throwing SyntaxError', () => {
    const caseDir = makeTempDir('benchmark-case-');
    cleanupPaths.push(caseDir);

    mkdirSync(join(caseDir, 'fixture'), { recursive: true });
    writeJson(join(caseDir, 'case.json'), {
      id: 'CASE-004',
      case_version: '2026-04-09',
      run_profile: 'phase1-local-cli-v1',
      fixture: 'fixture',
      budget: {
        max_turns: 5,
        timeout_seconds: 120,
        max_cost_usd: 2,
      },
    });
    writeFileSync(join(caseDir, 'prompt.txt'), 'Broken oracle JSON.\n', 'utf-8');
    writeFileSync(join(caseDir, 'oracle.json'), '{"verdict":', 'utf-8');

    try {
      loadBenchmarkCase(caseDir);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'oracle_schema_invalid',
      });
    }
  });

  it('loads a valid case and preserves case version and fixture hash in run metadata seed fields', () => {
    const caseDir = makeTempDir('benchmark-case-');
    cleanupPaths.push(caseDir);

    const fixtureFiles = {
      'README.md': '# fixture\n',
      'src/index.ts': 'export const value = 1;\n',
    };

    mkdirSync(join(caseDir, 'fixture', 'src'), { recursive: true });
    writeJson(join(caseDir, 'case.json'), {
      id: 'CASE-002',
      case_version: '2026-04-09',
      run_profile: 'phase1-local-cli-v1',
      fixture: 'fixture',
      budget: {
        max_turns: 5,
        timeout_seconds: 120,
        max_cost_usd: 2,
      },
    });
    writeFileSync(join(caseDir, 'prompt.txt'), 'Implement the behavior.\n', 'utf-8');
    writeJson(join(caseDir, 'oracle.json'), {
      verdict: 'pass',
      checks: ['build', 'tests'],
    });
    writeFileSync(join(caseDir, 'fixture', 'README.md'), fixtureFiles['README.md'], 'utf-8');
    writeFileSync(join(caseDir, 'fixture', 'src', 'index.ts'), fixtureFiles['src/index.ts'], 'utf-8');

    const bundle = loadBenchmarkCase(caseDir);

    expect(bundle.case.id).toBe('CASE-002');
    expect(bundle.case.case_version).toBe('2026-04-09');
    expect(bundle.case.run_profile).toBe('phase1-local-cli-v1');
    expect(bundle.fixture_dir).toBe(join(caseDir, 'fixture'));
    expect(bundle.fixture_hash).toBe(computeExpectedFixtureHash(fixtureFiles));
    expect(bundle.run_metadata_seed).toEqual({
      case_id: 'CASE-002',
      case_version: '2026-04-09',
      repo_fixture_hash: computeExpectedFixtureHash(fixtureFiles),
    });
  });
});

describe('getPhase1RunProfile', () => {
  it('returns the frozen phase1-local-cli-v1 profile and rejects unsupported profiles', () => {
    const profile = getPhase1RunProfile('phase1-local-cli-v1');

    expect(profile.profile_id).toBe('phase1-local-cli-v1');
    expect(profile.required_artifacts).toEqual([
      'metadata.json',
      'transcript.jsonl',
      'artifacts',
      'event-log.json',
      'verdict.json',
    ]);
    expect(profile.required_metadata_fields).toEqual([
      'run_id',
      'case_id',
      'case_version',
      'platform_id',
      'model_id',
      'workflow_version',
      'repo_fixture_hash',
      'trace_extractor_version',
    ]);
    expect(profile.transcript_record_fields).toEqual([
      'timestamp',
      'role',
      'event_type',
      'content',
    ]);

    expect(() => getPhase1RunProfile('phase1-other-profile')).toThrow('unsupported_profile');
  });
});

describe('validateRunContract', () => {
  it('rejects a run directory whose metadata omits required phase1 fields', () => {
    const runDir = makeTempDir('benchmark-run-');
    cleanupPaths.push(runDir);

    mkdirSync(join(runDir, 'artifacts'), { recursive: true });
    writeJson(join(runDir, 'metadata.json'), {
      run_id: 'RUN-001',
      case_id: 'CASE-001',
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4',
      workflow_version: 'wf-1',
      repo_fixture_hash: 'abc123',
    });
    writeFileSync(
      join(runDir, 'transcript.jsonl'),
      `${JSON.stringify({
        timestamp: '2026-04-09T10:00:00.000Z',
        role: 'assistant',
        event_type: 'message',
        content: 'started',
      })}\n`,
      'utf-8',
    );
    writeJson(join(runDir, 'event-log.json'), []);
    writeJson(join(runDir, 'verdict.json'), {
      status: 'pending_review',
    });

    const result = validateRunContract(runDir, 'phase1-local-cli-v1');

    expect(result.valid).toBe(false);
    expect(result.missing_fields).toEqual([
      'case_version',
      'trace_extractor_version',
    ]);
    expect(result.errors).toContain('missing required metadata fields');
  });

  it('reports invalid metadata.json as run_schema_invalid instead of throwing SyntaxError', () => {
    const runDir = makeTempDir('benchmark-run-');
    cleanupPaths.push(runDir);

    mkdirSync(join(runDir, 'artifacts'), { recursive: true });
    writeFileSync(join(runDir, 'metadata.json'), '{"run_id":', 'utf-8');
    writeFileSync(
      join(runDir, 'transcript.jsonl'),
      `${JSON.stringify({
        timestamp: '2026-04-09T10:00:00.000Z',
        role: 'assistant',
        event_type: 'message',
        content: 'started',
      })}\n`,
      'utf-8',
    );
    writeJson(join(runDir, 'event-log.json'), []);
    writeJson(join(runDir, 'verdict.json'), {
      status: 'pending_review',
    });

    const result = validateRunContract(runDir, 'phase1-local-cli-v1');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('run_schema_invalid');
  });

  it('requires run_profile and flags profile_mismatch when metadata profile differs', () => {
    const runDir = makeTempDir('benchmark-run-');
    cleanupPaths.push(runDir);

    mkdirSync(join(runDir, 'artifacts'), { recursive: true });
    writeJson(join(runDir, 'metadata.json'), {
      run_id: 'RUN-003',
      case_id: 'CASE-003',
      case_version: '2026-04-09',
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4',
      workflow_version: 'wf-1',
      repo_fixture_hash: 'fixture-hash-123',
      trace_extractor_version: 'trace-v1',
      run_profile: 'phase1-other-profile',
    });
    writeFileSync(
      join(runDir, 'transcript.jsonl'),
      `${JSON.stringify({
        timestamp: '2026-04-09T10:00:00.000Z',
        role: 'assistant',
        event_type: 'message',
        content: 'started',
      })}\n`,
      'utf-8',
    );
    writeJson(join(runDir, 'event-log.json'), []);
    writeJson(join(runDir, 'verdict.json'), {
      status: 'pending_review',
    });

    const result = validateRunContract(runDir, 'phase1-local-cli-v1');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('profile_mismatch');
  });

  it('accepts a complete standard run directory', () => {
    const runDir = makeTempDir('benchmark-run-');
    cleanupPaths.push(runDir);

    mkdirSync(join(runDir, 'artifacts'), { recursive: true });
    writeJson(join(runDir, 'metadata.json'), {
      run_id: 'RUN-002',
      case_id: 'CASE-002',
      case_version: '2026-04-09',
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4',
      workflow_version: 'wf-1',
      repo_fixture_hash: 'fixture-hash-123',
      trace_extractor_version: 'trace-v1',
      run_profile: 'phase1-local-cli-v1',
    });
    writeFileSync(
      join(runDir, 'transcript.jsonl'),
      `${JSON.stringify({
        timestamp: '2026-04-09T10:00:00.000Z',
        role: 'assistant',
        event_type: 'message',
        content: 'started',
      })}\n`,
      'utf-8',
    );
    writeJson(join(runDir, 'event-log.json'), []);
    writeJson(join(runDir, 'verdict.json'), {
      status: 'pending_review',
    });

    const result = validateRunContract(runDir, 'phase1-local-cli-v1');

    expect(result.valid).toBe(true);
    expect(result.missing_fields).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.metadata).toMatchObject({
      case_id: 'CASE-002',
      case_version: '2026-04-09',
      repo_fixture_hash: 'fixture-hash-123',
      trace_extractor_version: 'trace-v1',
    });
  });
});
