import { isCoreProcessFailureTag, normalizeFailureTags } from './failure-taxonomy.js';

export interface ScoreRunInput {
  process_score: number;
  outcome_score: number;
  efficiency_score: number;
  failure_tags?: string[];
}

export interface ScoreRunResult {
  process_score: number;
  outcome_score: number;
  efficiency_score: number;
  counted_efficiency_score: number;
  total_score: number;
  efficiency_excluded: boolean;
  process_score_capped: boolean;
  process_fail: boolean;
}

const CORE_PROCESS_SCORE_CAP = 20;
const PROCESS_FAIL_THRESHOLD = 25;
const MAX_PROCESS_SCORE = 50;
const MAX_OUTCOME_SCORE = 30;
const MAX_EFFICIENCY_SCORE = 20;

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function assertScoreWithinRange(name: string, value: number, max: number): void {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`score_gate_violation: ${name} must be between 0 and ${max}`);
  }
}

export function scoreRun(input: ScoreRunInput): ScoreRunResult {
  assertScoreWithinRange('process_score', input.process_score, MAX_PROCESS_SCORE);
  assertScoreWithinRange('outcome_score', input.outcome_score, MAX_OUTCOME_SCORE);
  assertScoreWithinRange('efficiency_score', input.efficiency_score, MAX_EFFICIENCY_SCORE);

  const failureTags = normalizeFailureTags(input.failure_tags ?? []);
  const hasCoreProcessViolation = failureTags.some((tag) => isCoreProcessFailureTag(tag));
  const uncappedProcessScore = normalizeScore(input.process_score);
  const outcomeScore = normalizeScore(input.outcome_score);
  const efficiencyScore = normalizeScore(input.efficiency_score);
  const processScore = hasCoreProcessViolation
    ? Math.min(uncappedProcessScore, CORE_PROCESS_SCORE_CAP)
    : uncappedProcessScore;
  const processFail = processScore < PROCESS_FAIL_THRESHOLD;
  const countedEfficiencyScore = hasCoreProcessViolation || processFail ? 0 : efficiencyScore;

  return {
    process_score: processScore,
    outcome_score: outcomeScore,
    efficiency_score: efficiencyScore,
    counted_efficiency_score: countedEfficiencyScore,
    total_score: processScore + outcomeScore + countedEfficiencyScore,
    efficiency_excluded: countedEfficiencyScore !== efficiencyScore,
    process_score_capped: processScore !== uncappedProcessScore,
    process_fail: processFail,
  };
}
