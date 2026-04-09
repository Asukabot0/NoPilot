import type { VerdictStatus } from './verdict-writer.js';

export interface RegressionComparableRun {
  run_id: string;
  case_id: string;
  platform_id: string;
  model_id: string;
  workflow_version: string;
  status: VerdictStatus;
  total_score: number;
  failure_tags: string[];
}

export type RegressionClassification = 'improved' | 'regressed' | 'unchanged' | 'added' | 'removed';

export interface RegressionDiffEntry {
  case_id: string;
   comparison_key: string;
  classification: RegressionClassification;
  baseline_run_id: string | null;
  current_run_id: string | null;
  baseline_score: number | null;
  current_score: number | null;
  score_delta: number | null;
  status_change: string;
  new_failures: string[];
  fixed_failures: string[];
}

export interface RegressionDiffSummary {
  matched_cases: number;
  regressions: number;
  improvements: number;
  unchanged: number;
  added_cases: number;
  removed_cases: number;
}

export interface BenchmarkRegressionDiff {
  summary: RegressionDiffSummary;
  entries: RegressionDiffEntry[];
}

const STATUS_RANK: Record<VerdictStatus, number> = {
  fail: 0,
  needs_review: 1,
  pass: 2,
};

function compareStatuses(current: VerdictStatus, baseline: VerdictStatus): number {
  return STATUS_RANK[current] - STATUS_RANK[baseline];
}

function buildComparisonKey(run: RegressionComparableRun): string {
  return [run.case_id, run.platform_id, run.model_id].join('::');
}

function sortRunsForMatching(runs: readonly RegressionComparableRun[]): RegressionComparableRun[] {
  return [...runs].sort((left, right) => {
    const workflowCompare = left.workflow_version.localeCompare(right.workflow_version);
    if (workflowCompare !== 0) {
      return workflowCompare;
    }

    return left.run_id.localeCompare(right.run_id);
  });
}

function takeByWorkflowVersion(
  runs: RegressionComparableRun[],
  workflowVersion: string,
): RegressionComparableRun | undefined {
  const index = runs.findIndex((run) => run.workflow_version === workflowVersion);
  if (index === -1) {
    return undefined;
  }

  return runs.splice(index, 1)[0];
}

function diffFailureTags(current: readonly string[], baseline: readonly string[]): { new_failures: string[]; fixed_failures: string[] } {
  const currentSet = new Set(current);
  const baselineSet = new Set(baseline);

  return {
    new_failures: [...currentSet].filter((tag) => !baselineSet.has(tag)).sort(),
    fixed_failures: [...baselineSet].filter((tag) => !currentSet.has(tag)).sort(),
  };
}

function classifyMatchedRun(
  currentRun: RegressionComparableRun,
  baselineRun: RegressionComparableRun,
): RegressionClassification {
  const failureDiff = diffFailureTags(currentRun.failure_tags, baselineRun.failure_tags);
  const statusDelta = compareStatuses(currentRun.status, baselineRun.status);
  if (statusDelta > 0) {
    return 'improved';
  }

  if (statusDelta < 0) {
    return 'regressed';
  }

  if (currentRun.total_score > baselineRun.total_score) {
    return 'improved';
  }

  if (currentRun.total_score < baselineRun.total_score) {
    return 'regressed';
  }

  if (failureDiff.new_failures.length > 0) {
    return 'regressed';
  }

  if (failureDiff.fixed_failures.length > 0) {
    return 'improved';
  }

  return 'unchanged';
}

export function buildRegressionDiff(
  currentRuns: readonly RegressionComparableRun[],
  baselineRuns: readonly RegressionComparableRun[],
): BenchmarkRegressionDiff {
  const currentByKey = new Map<string, RegressionComparableRun[]>();
  const baselineByKey = new Map<string, RegressionComparableRun[]>();

  for (const run of currentRuns) {
    const key = buildComparisonKey(run);
    const bucket = currentByKey.get(key) ?? [];
    bucket.push(run);
    currentByKey.set(key, bucket);
  }

  for (const run of baselineRuns) {
    const key = buildComparisonKey(run);
    const bucket = baselineByKey.get(key) ?? [];
    bucket.push(run);
    baselineByKey.set(key, bucket);
  }

  const comparisonKeys = new Set<string>([
    ...currentByKey.keys(),
    ...baselineByKey.keys(),
  ]);
  const entries: RegressionDiffEntry[] = [];

  for (const comparisonKey of [...comparisonKeys].sort()) {
    const currentRunsForKey = sortRunsForMatching(currentByKey.get(comparisonKey) ?? []);
    const baselineRunsForKey = sortRunsForMatching(baselineByKey.get(comparisonKey) ?? []);

    while (currentRunsForKey.length > 0 || baselineRunsForKey.length > 0) {
      const currentRun = currentRunsForKey.shift();
      const baselineRun = currentRun
        ? takeByWorkflowVersion(baselineRunsForKey, currentRun.workflow_version)
          ?? (baselineRunsForKey.length === 1 ? baselineRunsForKey.shift() : undefined)
        : baselineRunsForKey.shift();
      const caseId = currentRun?.case_id ?? baselineRun?.case_id ?? 'unknown';

      if (currentRun && baselineRun) {
        const failureDiff = diffFailureTags(currentRun.failure_tags, baselineRun.failure_tags);
        entries.push({
          case_id: caseId,
          comparison_key: comparisonKey,
          classification: classifyMatchedRun(currentRun, baselineRun),
          baseline_run_id: baselineRun.run_id,
          current_run_id: currentRun.run_id,
          baseline_score: baselineRun.total_score,
          current_score: currentRun.total_score,
          score_delta: currentRun.total_score - baselineRun.total_score,
          status_change: `${baselineRun.status} -> ${currentRun.status}`,
          new_failures: failureDiff.new_failures,
          fixed_failures: failureDiff.fixed_failures,
        });
        continue;
      }

      if (currentRun) {
        entries.push({
          case_id: caseId,
          comparison_key: comparisonKey,
          classification: 'added',
          baseline_run_id: null,
          current_run_id: currentRun.run_id,
          baseline_score: null,
          current_score: currentRun.total_score,
          score_delta: null,
          status_change: `missing -> ${currentRun.status}`,
          new_failures: [...currentRun.failure_tags].sort(),
          fixed_failures: [],
        });
        continue;
      }

      if (baselineRun) {
        entries.push({
          case_id: caseId,
          comparison_key: comparisonKey,
          classification: 'removed',
          baseline_run_id: baselineRun.run_id,
          current_run_id: null,
          baseline_score: baselineRun.total_score,
          current_score: null,
          score_delta: null,
          status_change: `${baselineRun.status} -> missing`,
          new_failures: [],
          fixed_failures: [...baselineRun.failure_tags].sort(),
        });
      }
    }
  }

  return {
    summary: {
      matched_cases: entries.filter((entry) => (
        entry.classification === 'improved'
        || entry.classification === 'regressed'
        || entry.classification === 'unchanged'
      )).length,
      regressions: entries.filter((entry) => entry.classification === 'regressed').length,
      improvements: entries.filter((entry) => entry.classification === 'improved').length,
      unchanged: entries.filter((entry) => entry.classification === 'unchanged').length,
      added_cases: entries.filter((entry) => entry.classification === 'added').length,
      removed_cases: entries.filter((entry) => entry.classification === 'removed').length,
    },
    entries,
  };
}
