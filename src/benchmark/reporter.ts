import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { BenchmarkRunMetadata } from './types.js';
import { buildRegressionDiff, type BenchmarkRegressionDiff } from './regression-diff.js';
import type { BenchmarkVerdictArtifact, VerdictStatus } from './verdict-writer.js';

export interface BenchmarkReportInput {
  runs_root: string;
  baseline_root?: string;
}

export interface BenchmarkReportRun {
  run_id: string;
  case_id: string;
  platform_id: string;
  model_id: string;
  workflow_version: string;
  status: VerdictStatus;
  total_score: number;
  failure_tags: string[];
  primary_failure_tag: string | null;
  human_review_required: boolean;
}

export interface BenchmarkLeaderboardEntry extends BenchmarkReportRun {
  rank: number;
}

export interface BenchmarkFailureBreakdown {
  total_runs: number;
  status_counts: Record<VerdictStatus, number>;
  tagged_failures: Array<{
    tag: string;
    count: number;
  }>;
  untagged_runs: number;
}

export interface BenchmarkReport {
  generated_at: string;
  runs_root: string;
  baseline_root: string | null;
  runs: BenchmarkReportRun[];
  leaderboard: BenchmarkLeaderboardEntry[];
  failure_breakdown: BenchmarkFailureBreakdown;
  regression_diff: BenchmarkRegressionDiff;
  summary: {
    run_count: number;
    baseline_run_count: number;
  };
}

function buildEmptyRegressionDiff(): BenchmarkRegressionDiff {
  return {
    summary: {
      matched_cases: 0,
      regressions: 0,
      improvements: 0,
      unchanged: 0,
      added_cases: 0,
      removed_cases: 0,
    },
    entries: [],
  };
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function loadReportRuns(rootDir: string): BenchmarkReportRun[] {
  const entries = readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  return entries.map((entry) => {
    const runDir = path.join(rootDir, entry);
    const metadata = readJsonFile<BenchmarkRunMetadata>(path.join(runDir, 'metadata.json'));
    const verdict = readJsonFile<BenchmarkVerdictArtifact>(path.join(runDir, 'verdict.json'));

    return {
      run_id: metadata.run_id,
        case_id: metadata.case_id,
        platform_id: metadata.platform_id,
        model_id: metadata.model_id,
        workflow_version: metadata.workflow_version,
        status: verdict.status,
        total_score: verdict.total_score,
        failure_tags: verdict.failure_tags,
      primary_failure_tag: verdict.primary_failure_tag,
      human_review_required: verdict.human_review_required,
    };
  });
}

function buildLeaderboard(runs: readonly BenchmarkReportRun[]): BenchmarkLeaderboardEntry[] {
  return [...runs]
    .sort((left, right) => {
      if (right.total_score !== left.total_score) {
        return right.total_score - left.total_score;
      }

      const caseCompare = left.case_id.localeCompare(right.case_id);
      if (caseCompare !== 0) {
        return caseCompare;
      }

      return left.run_id.localeCompare(right.run_id);
    })
    .map((run, index) => ({
      rank: index + 1,
      ...run,
    }));
}

function buildFailureBreakdown(runs: readonly BenchmarkReportRun[]): BenchmarkFailureBreakdown {
  const statusCounts: Record<VerdictStatus, number> = {
    pass: 0,
    fail: 0,
    needs_review: 0,
  };
  const tagCounts = new Map<string, number>();

  for (const run of runs) {
    statusCounts[run.status] += 1;

    for (const tag of run.failure_tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const taggedFailures = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.tag.localeCompare(right.tag);
    });

  return {
    total_runs: runs.length,
    status_counts: statusCounts,
    tagged_failures: taggedFailures,
    untagged_runs: runs.filter((run) => run.failure_tags.length === 0).length,
  };
}

export function buildJsonReport(input: BenchmarkReportInput): BenchmarkReport {
  const runs = loadReportRuns(input.runs_root);
  const baselineRuns = input.baseline_root
    ? loadReportRuns(input.baseline_root)
    : [];

  return {
    generated_at: new Date().toISOString(),
    runs_root: input.runs_root,
    baseline_root: input.baseline_root ?? null,
    runs,
    leaderboard: buildLeaderboard(runs),
    failure_breakdown: buildFailureBreakdown(runs),
    regression_diff: input.baseline_root
      ? buildRegressionDiff(runs, baselineRuns)
      : buildEmptyRegressionDiff(),
    summary: {
      run_count: runs.length,
      baseline_run_count: baselineRuns.length,
    },
  };
}

export function buildMarkdownReport(report: BenchmarkReport): string {
  const leaderboardRows = report.leaderboard
    .map((entry) => `| ${entry.rank} | ${entry.case_id} | ${entry.run_id} | ${entry.platform_id} | ${entry.model_id} | ${entry.workflow_version} | ${entry.status} | ${entry.total_score} |`)
    .join('\n');
  const failureRows = report.failure_breakdown.tagged_failures.length > 0
    ? report.failure_breakdown.tagged_failures
      .map((entry) => `| ${entry.tag} | ${entry.count} |`)
      .join('\n')
    : '| none | 0 |';
  const regressionRows = report.regression_diff.entries.length > 0
    ? report.regression_diff.entries
      .map((entry) => (
        `| ${entry.case_id} | ${entry.baseline_run_id ?? '-'} | ${entry.current_run_id ?? '-'} | ${entry.score_delta ?? '-'} | ${entry.classification} | ${entry.status_change} |`
      ))
      .join('\n')
    : '| none | - | - | - | unchanged | n/a |';

  return [
    '# Benchmark Report',
    '',
    `Generated At: ${report.generated_at}`,
    `Current Runs Root: ${report.runs_root}`,
    `Baseline Root: ${report.baseline_root ?? 'none'}`,
    '',
    '## Leaderboard',
    '',
    '| Rank | Case | Run | Platform | Model | Workflow | Status | Score |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    leaderboardRows,
    '',
    '## Failure Breakdown',
    '',
    `Total Runs: ${report.failure_breakdown.total_runs}`,
    `Status Counts: pass=${report.failure_breakdown.status_counts.pass}, fail=${report.failure_breakdown.status_counts.fail}, needs_review=${report.failure_breakdown.status_counts.needs_review}`,
    `Untagged Runs: ${report.failure_breakdown.untagged_runs}`,
    '',
    '| Failure Tag | Count |',
    '| --- | --- |',
    failureRows,
    '',
    '## Regression Diff',
    '',
    `Matched Cases: ${report.regression_diff.summary.matched_cases}`,
    `Improvements: ${report.regression_diff.summary.improvements}, Regressions: ${report.regression_diff.summary.regressions}, Unchanged: ${report.regression_diff.summary.unchanged}`,
    `Added Cases: ${report.regression_diff.summary.added_cases}, Removed Cases: ${report.regression_diff.summary.removed_cases}`,
    '',
    '| Case | Baseline Run | Current Run | Score Delta | Classification | Status Change | New Failures | Fixed Failures |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    report.regression_diff.entries.length > 0
      ? report.regression_diff.entries
          .map((entry) => (
            `| ${entry.case_id} | ${entry.baseline_run_id ?? '-'} | ${entry.current_run_id ?? '-'} | ${entry.score_delta ?? '-'} | ${entry.classification} | ${entry.status_change} | ${entry.new_failures.join(', ') || '-'} | ${entry.fixed_failures.join(', ') || '-'} |`
          ))
          .join('\n')
      : '| none | - | - | - | unchanged | n/a | - | - |',
  ].join('\n');
}
