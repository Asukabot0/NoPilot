import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildJsonReport,
  buildMarkdownReport,
} from '../src/benchmark/reporter.js';
import { validateBenchmarkSchema } from '../src/benchmark/schema-loader.js';

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function writeRunFixture(
  rootDir: string,
  runId: string,
  overrides: Partial<{
    case_id: string;
    case_version: string;
    platform_id: string;
    model_id: string;
    workflow_version: string;
    repo_fixture_hash: string;
    trace_extractor_version: string;
    run_profile: string;
    status: 'pass' | 'fail' | 'needs_review';
    auto_verdict: 'pass' | 'fail' | 'process_fail' | 'needs_review';
    total_score: number;
    failure_tags: string[];
    primary_failure_tag: string | null;
    human_review_required: boolean;
  }> = {},
): void {
  const runDir = join(rootDir, runId);
  mkdirSync(runDir, { recursive: true });

  writeJson(join(runDir, 'metadata.json'), {
    run_id: runId,
    case_id: overrides.case_id ?? runId,
    case_version: overrides.case_version ?? '2026-04-09',
      platform_id: overrides.platform_id ?? 'codex-cli',
      model_id: overrides.model_id ?? 'gpt-5.4',
    workflow_version: overrides.workflow_version ?? 'wf-1',
    repo_fixture_hash: overrides.repo_fixture_hash ?? `fixture-${runId}`,
    trace_extractor_version: overrides.trace_extractor_version ?? 'trace-v1',
    run_profile: overrides.run_profile ?? 'phase1-local-cli-v1',
  });

  writeJson(join(runDir, 'verdict.json'), {
    status: overrides.status ?? 'pass',
    auto_verdict: overrides.auto_verdict ?? 'pass',
    run_id: runId,
    total_score: overrides.total_score ?? 80,
    score_breakdown: {
      process_score: 40,
      outcome_score: 30,
      efficiency_score: 10,
      counted_efficiency_score: 10,
      total_score: overrides.total_score ?? 80,
      efficiency_excluded: false,
      process_score_capped: false,
      process_fail: false,
    },
    failure_tags: overrides.failure_tags ?? [],
    failure_tag_names: [],
    primary_failure_tag: overrides.primary_failure_tag ?? null,
    human_review_required: overrides.human_review_required ?? false,
    final_verdict: null,
    review_reason: [],
    required_events_met: [],
    trace_insufficient_reasons: [],
  });
}

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('benchmark reporter', () => {
  it('builds machine-readable and Markdown reports with leaderboard, failure breakdown, and regression diff sections', () => {
    const currentRoot = makeTempDir('benchmark-current-');
    const baselineRoot = makeTempDir('benchmark-baseline-');
    cleanupPaths.push(currentRoot, baselineRoot);

    writeRunFixture(currentRoot, 'RUN-101', {
      case_id: 'DISCOVER-001',
      total_score: 91,
      status: 'pass',
      auto_verdict: 'pass',
    });
    writeRunFixture(currentRoot, 'RUN-102', {
      case_id: 'DISCOVER-002',
      total_score: 72,
      status: 'needs_review',
      auto_verdict: 'needs_review',
      failure_tags: ['F10'],
      primary_failure_tag: 'F10',
      human_review_required: true,
    });
    writeRunFixture(currentRoot, 'RUN-103', {
      case_id: 'BUILD-001',
      total_score: 44,
      status: 'fail',
      auto_verdict: 'process_fail',
      failure_tags: ['F2', 'F10'],
      primary_failure_tag: 'F2',
    });

    writeRunFixture(baselineRoot, 'BASE-101', {
      case_id: 'DISCOVER-001',
      total_score: 80,
      status: 'pass',
      auto_verdict: 'pass',
    });
    writeRunFixture(baselineRoot, 'BASE-102', {
      case_id: 'DISCOVER-002',
      total_score: 78,
      status: 'pass',
      auto_verdict: 'pass',
    });
    writeRunFixture(baselineRoot, 'BASE-103', {
      case_id: 'BUILD-001',
      total_score: 58,
      status: 'fail',
      auto_verdict: 'fail',
      failure_tags: ['F2'],
      primary_failure_tag: 'F2',
    });

    const report = buildJsonReport({
      runs_root: currentRoot,
      baseline_root: baselineRoot,
    });
    const markdown = buildMarkdownReport(report);
    const validation = validateBenchmarkSchema('benchmark-report', report);

    expect(validation).toMatchObject({ valid: true, errors: [] });
    expect(report.generated_at).toEqual(expect.any(String));
    expect(report.runs).toHaveLength(3);
    expect(report.leaderboard).toEqual([
      expect.objectContaining({
        rank: 1,
        run_id: 'RUN-101',
        case_id: 'DISCOVER-001',
        platform_id: 'codex-cli',
        model_id: 'gpt-5.4',
        workflow_version: 'wf-1',
        total_score: 91,
        status: 'pass',
      }),
      expect.objectContaining({
        rank: 2,
        run_id: 'RUN-102',
        case_id: 'DISCOVER-002',
        platform_id: 'codex-cli',
        model_id: 'gpt-5.4',
        workflow_version: 'wf-1',
        total_score: 72,
        status: 'needs_review',
      }),
      expect.objectContaining({
        rank: 3,
        run_id: 'RUN-103',
        case_id: 'BUILD-001',
        platform_id: 'codex-cli',
        model_id: 'gpt-5.4',
        workflow_version: 'wf-1',
        total_score: 44,
        status: 'fail',
      }),
    ]);
    expect(report.failure_breakdown).toEqual({
      total_runs: 3,
      status_counts: {
        pass: 1,
        fail: 1,
        needs_review: 1,
      },
      tagged_failures: [
        { tag: 'F10', count: 2 },
        { tag: 'F2', count: 1 },
      ],
      untagged_runs: 1,
    });
    expect(report.regression_diff).toMatchObject({
      summary: {
        matched_cases: 3,
        regressions: 2,
        improvements: 1,
        unchanged: 0,
        added_cases: 0,
        removed_cases: 0,
      },
      entries: [
        {
          case_id: 'BUILD-001',
          comparison_key: 'BUILD-001::codex-cli::gpt-5.4',
          classification: 'regressed',
          score_delta: -14,
          status_change: 'fail -> fail',
          new_failures: ['F10'],
          fixed_failures: [],
        },
        {
          case_id: 'DISCOVER-001',
          comparison_key: 'DISCOVER-001::codex-cli::gpt-5.4',
          classification: 'improved',
          score_delta: 11,
          status_change: 'pass -> pass',
          new_failures: [],
          fixed_failures: [],
        },
        {
          case_id: 'DISCOVER-002',
          comparison_key: 'DISCOVER-002::codex-cli::gpt-5.4',
          classification: 'regressed',
          score_delta: -6,
          status_change: 'pass -> needs_review',
          new_failures: ['F10'],
          fixed_failures: [],
        },
      ],
    });

    expect(markdown).toContain('# Benchmark Report');
    expect(markdown).toContain('## Leaderboard');
    expect(markdown).toContain('| 1 | DISCOVER-001 | RUN-101 | codex-cli | gpt-5.4 | wf-1 | pass | 91 |');
    expect(markdown).toContain('## Failure Breakdown');
    expect(markdown).toContain('| F10 | 2 |');
    expect(markdown).toContain('## Regression Diff');
    expect(markdown).toContain('| BUILD-001 | BASE-103 | RUN-103 | -14 | regressed | fail -> fail | F10 | - |');
  });

  it('keeps distinct regression entries for the same case across different run dimensions and detects failure-tag churn', () => {
    const currentRoot = makeTempDir('benchmark-current-');
    const baselineRoot = makeTempDir('benchmark-baseline-');
    cleanupPaths.push(currentRoot, baselineRoot);

    writeRunFixture(currentRoot, 'RUN-A', {
      case_id: 'DISCOVER-003',
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4',
      workflow_version: 'wf-a',
      total_score: 70,
      failure_tags: ['F10'],
      primary_failure_tag: 'F10',
      status: 'needs_review',
      auto_verdict: 'needs_review',
      human_review_required: true,
    });
    writeRunFixture(currentRoot, 'RUN-B', {
      case_id: 'DISCOVER-003',
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4-mini',
      workflow_version: 'wf-a',
      total_score: 70,
      failure_tags: ['F2'],
      primary_failure_tag: 'F2',
      status: 'fail',
      auto_verdict: 'fail',
    });

    writeRunFixture(baselineRoot, 'BASE-A', {
      case_id: 'DISCOVER-003',
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4',
      workflow_version: 'wf-a',
      total_score: 70,
      failure_tags: [],
      primary_failure_tag: null,
      status: 'needs_review',
      auto_verdict: 'needs_review',
      human_review_required: true,
    });
    writeRunFixture(baselineRoot, 'BASE-B', {
      case_id: 'DISCOVER-003',
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4-mini',
      workflow_version: 'wf-a',
      total_score: 70,
      failure_tags: ['F10'],
      primary_failure_tag: 'F10',
      status: 'fail',
      auto_verdict: 'fail',
    });

    const report = buildJsonReport({
      runs_root: currentRoot,
      baseline_root: baselineRoot,
    });

    expect(report.regression_diff.entries).toHaveLength(2);
    expect(report.regression_diff.entries).toEqual([
      expect.objectContaining({
        comparison_key: 'DISCOVER-003::codex-cli::gpt-5.4',
        classification: 'regressed',
        new_failures: ['F10'],
        fixed_failures: [],
      }),
      expect.objectContaining({
        comparison_key: 'DISCOVER-003::codex-cli::gpt-5.4-mini',
        classification: 'regressed',
        new_failures: ['F2'],
        fixed_failures: ['F10'],
      }),
    ]);
  });

  it('matches runs across workflow versions instead of downgrading them to added and removed entries', () => {
    const currentRoot = makeTempDir('benchmark-current-');
    const baselineRoot = makeTempDir('benchmark-baseline-');
    cleanupPaths.push(currentRoot, baselineRoot);

    writeRunFixture(currentRoot, 'RUN-301', {
      case_id: 'DISCOVER-005',
      workflow_version: 'wf-new',
      total_score: 62,
      status: 'needs_review',
      auto_verdict: 'needs_review',
      failure_tags: ['F10'],
      primary_failure_tag: 'F10',
      human_review_required: true,
    });
    writeRunFixture(baselineRoot, 'BASE-301', {
      case_id: 'DISCOVER-005',
      workflow_version: 'wf-old',
      total_score: 78,
      status: 'pass',
      auto_verdict: 'pass',
    });

    const report = buildJsonReport({
      runs_root: currentRoot,
      baseline_root: baselineRoot,
    });

    expect(report.regression_diff.entries).toEqual([
      expect.objectContaining({
        comparison_key: 'DISCOVER-005::codex-cli::gpt-5.4',
        classification: 'regressed',
        baseline_run_id: 'BASE-301',
        current_run_id: 'RUN-301',
      }),
    ]);
  });

  it('keeps regression diff empty when no baseline root is provided', () => {
    const currentRoot = makeTempDir('benchmark-current-');
    cleanupPaths.push(currentRoot);

    writeRunFixture(currentRoot, 'RUN-201', {
      case_id: 'DISCOVER-004',
      total_score: 88,
      status: 'pass',
      auto_verdict: 'pass',
    });

    const report = buildJsonReport({
      runs_root: currentRoot,
    });

    expect(report.baseline_root).toBeNull();
    expect(report.regression_diff).toEqual({
      summary: {
        matched_cases: 0,
        regressions: 0,
        improvements: 0,
        unchanged: 0,
        added_cases: 0,
        removed_cases: 0,
      },
      entries: [],
    });
    expect(buildMarkdownReport(report)).toContain('Added Cases: 0, Removed Cases: 0');
  });
});
