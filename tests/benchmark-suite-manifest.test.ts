import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadSuiteManifest,
  resolveCaseSelector,
} from '../src/benchmark/suite-manifest.js';

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function writeSyntheticCase(benchmarkRoot: string, caseId: string): void {
  const caseDir = join(benchmarkRoot, 'cases', caseId);
  mkdirSync(join(caseDir, 'fixture'), { recursive: true });
  writeJson(join(caseDir, 'case.json'), {
    id: caseId,
    case_version: '2026-04-09',
    run_profile: 'phase1-local-cli-v1',
    fixture: 'fixture',
    budget: {
      max_turns: 6,
      timeout_seconds: 180,
      max_cost_usd: 3,
    },
  });
  writeFileSync(join(caseDir, 'prompt.txt'), `Run synthetic case ${caseId}.\n`, 'utf-8');
  writeJson(join(caseDir, 'oracle.json'), {
    verdict: 'pass',
    checks: ['build', 'tests'],
  });
  writeFileSync(join(caseDir, 'fixture', 'README.md'), `# ${caseId}\n`, 'utf-8');
}

function writePhase1Manifest(
  benchmarkRoot: string,
  overrides: Partial<{
    suite_id: string;
    case_ids: string[];
    profile_id: string;
    ranked_platform_ids: string[];
    ranked_platform_admission_rule: string;
    platform_admissions: Record<string, { profile_id: string; stable_full_trace: boolean }>;
  }> = {},
): void {
  mkdirSync(join(benchmarkRoot, 'suites'), { recursive: true });
  writeJson(join(benchmarkRoot, 'suites', 'phase1.json'), {
    suite_id: 'phase1',
    case_ids: [
      'DISCOVER-001',
      'DISCOVER-002',
      'DISCOVER-003',
      'DISCOVER-004',
      'DISCOVER-005',
      'SPEC-001',
      'SPEC-002',
      'BUILD-001',
      'BUILD-002',
      'BUILD-003',
    ],
    profile_id: 'phase1-local-cli-v1',
    ranked_platform_ids: ['codex-cli'],
    ranked_platform_admission_rule: 'Only platforms with stable complete trace evidence under phase1-local-cli-v1 may be ranked.',
    platform_admissions: {
      'codex-cli': {
        profile_id: 'phase1-local-cli-v1',
        stable_full_trace: true,
      },
    },
    ...overrides,
  });
}

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('loadSuiteManifest', () => {
  it('loads the official phase1 suite and preserves the fixed run profile', () => {
    const suite = loadSuiteManifest('phase1');

    expect(suite.suite_id).toBe('phase1');
    expect(suite.minimum_case_count).toBe(10);
    expect(suite.profile_id).toBe('phase1-local-cli-v1');
    expect(suite.case_ids.length).toBeGreaterThanOrEqual(10);
    expect(suite.ranked_platform_ids).toEqual(['codex-cli']);
    expect(suite.ranked_platform_admission_rule).toContain('stable complete trace evidence');
  });

  it('rejects the official suite when the manifest falls under the minimum case count', () => {
    const benchmarkRoot = makeTempDir('benchmark-root-');
    cleanupPaths.push(benchmarkRoot);

    writePhase1Manifest(benchmarkRoot, {
      case_ids: [
        'DISCOVER-001',
        'DISCOVER-002',
        'DISCOVER-003',
        'DISCOVER-004',
        'DISCOVER-005',
        'SPEC-001',
        'SPEC-002',
        'BUILD-001',
        'BUILD-002',
      ],
    });

    try {
      loadSuiteManifest('phase1', benchmarkRoot);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'suite_under_minimum',
      });
    }
  });

  it('rejects ranked platforms that are missing phase1 full-trace admission', () => {
    const benchmarkRoot = makeTempDir('benchmark-root-');
    cleanupPaths.push(benchmarkRoot);

    writePhase1Manifest(benchmarkRoot, {
      platform_admissions: {
        'codex-cli': {
          profile_id: 'phase1-local-cli-v1',
          stable_full_trace: false,
        },
      },
    });

    try {
      loadSuiteManifest('phase1', benchmarkRoot);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'ranked_platform_missing_admission',
      });
    }
  });
});

describe('resolveCaseSelector', () => {
  const repoBenchmarkRoot = join(process.cwd(), 'benchmark');

  it('resolves the phase1 suite selector into concrete case directories', () => {
    const caseDirs = resolveCaseSelector('phase1', repoBenchmarkRoot);

    expect(caseDirs.length).toBeGreaterThanOrEqual(10);
    expect(caseDirs.every((caseDir) => isAbsolute(caseDir))).toBe(true);
    expect(caseDirs[0]).toContain(join('benchmark', 'cases'));
  });

  it('resolves a single case id into its in-repo case directory', () => {
    const caseDirs = resolveCaseSelector('DISCOVER-001', repoBenchmarkRoot);

    expect(caseDirs).toEqual([join(repoBenchmarkRoot, 'cases', 'DISCOVER-001')]);
  });

  it('accepts an explicit case path inside the benchmark root', () => {
    const benchmarkRoot = makeTempDir('benchmark-root-');
    cleanupPaths.push(benchmarkRoot);

    writeSyntheticCase(benchmarkRoot, 'CASE-LOCAL-001');

    const caseDir = join(benchmarkRoot, 'cases', 'CASE-LOCAL-001');
    const caseDirs = resolveCaseSelector(caseDir, benchmarkRoot);

    expect(caseDirs).toEqual([caseDir]);
  });

  it('rejects explicit case paths outside the benchmark root', () => {
    const benchmarkRoot = makeTempDir('benchmark-root-');
    const externalCaseDir = makeTempDir('benchmark-external-');
    cleanupPaths.push(benchmarkRoot, externalCaseDir);

    try {
      resolveCaseSelector(externalCaseDir, benchmarkRoot);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'case_path_outside_suite_root',
      });
    }
  });

  it('rejects unknown selectors', () => {
    const benchmarkRoot = makeTempDir('benchmark-root-');
    cleanupPaths.push(benchmarkRoot);

    try {
      resolveCaseSelector('UNKNOWN-CASE', benchmarkRoot);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'case_selector_unknown',
      });
    }
  });
});
