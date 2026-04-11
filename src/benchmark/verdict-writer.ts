import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkOracle, type OracleCheckInput } from './oracle-checker.js';
import {
  collectUnknownFailureTags,
  getFailureTagNames,
  normalizeFailureTags,
  selectPrimaryFailureTag,
  type FailureTag,
} from './failure-taxonomy.js';
import { validateBenchmarkSchema } from './schema-loader.js';
import { scoreRun, type ScoreRunInput, type ScoreRunResult } from './scorer.js';

export type VerdictStatus = 'pass' | 'fail' | 'needs_review';
export type AutoVerdict = 'pass' | 'fail' | 'process_fail' | 'needs_review';

export interface ReviewEvidencePaths {
  transcript: string;
  event_log: string;
  artifacts: string;
}

export interface ReviewTicket {
  status: 'pending_review';
  run_dir: string;
  review_reason: string[];
  failure_tags: FailureTag[];
  preserved_evidence: ReviewEvidencePaths;
}

export interface ComposeVerdictInput {
  run_id: string;
  oracle_result: OracleCheckInput;
  run_metrics: ScoreRunInput;
  evidence_paths?: ReviewEvidencePaths;
}

export interface BenchmarkVerdictArtifact {
  status: VerdictStatus;
  auto_verdict: AutoVerdict;
  run_id: string;
  total_score: number;
  score_breakdown: ScoreRunResult;
  failure_tags: FailureTag[];
  failure_tag_names: string[];
  primary_failure_tag: FailureTag | null;
  human_review_required: boolean;
  final_verdict: VerdictStatus | null;
  review_reason: string[];
  required_events_met: string[];
  trace_insufficient_reasons: string[];
  review_ticket?: ReviewTicket;
}

function ensureFailureTags(
  failureTags: FailureTag[],
  outcomePassed: boolean,
  processFail: boolean,
): FailureTag[] {
  if ((processFail || !outcomePassed) && failureTags.length === 0) {
    return ['F11'];
  }

  return failureTags;
}

function ensureReviewEvidence(evidencePaths: ReviewEvidencePaths | undefined): ReviewEvidencePaths {
  if (!evidencePaths) {
    throw new Error('benchmark_review_evidence_missing: transcript, event_log, and artifacts are required');
  }

  if (!evidencePaths.transcript || !evidencePaths.event_log || !evidencePaths.artifacts) {
    throw new Error('benchmark_review_evidence_missing: transcript, event_log, and artifacts are required');
  }

  return {
    transcript: evidencePaths.transcript,
    event_log: evidencePaths.event_log,
    artifacts: evidencePaths.artifacts,
  };
}

function determineAutoVerdict(
  reviewReason: string[],
  score: ScoreRunResult,
  failureTags: FailureTag[],
  outcomePassed: boolean,
): AutoVerdict {
  if (reviewReason.length > 0) {
    return 'needs_review';
  }

  if (score.process_fail) {
    return 'process_fail';
  }

  if (failureTags.length > 0 || !outcomePassed) {
    return 'fail';
  }

  return 'pass';
}

function toVerdictStatus(autoVerdict: AutoVerdict): VerdictStatus {
  if (autoVerdict === 'pass') {
    return 'pass';
  }

  if (autoVerdict === 'needs_review') {
    return 'needs_review';
  }

  return 'fail';
}

export function composeVerdict(input: ComposeVerdictInput): BenchmarkVerdictArtifact {
  const rawFailureTags = [
    ...(input.oracle_result.core_process_violations ?? []),
    ...(input.oracle_result.failure_tags ?? []),
  ];
  const unknownFailureTags = collectUnknownFailureTags(rawFailureTags);
  if (unknownFailureTags.length > 0) {
    throw new Error(`unknown_failure_tag: ${unknownFailureTags.join(', ')}`);
  }

  const oracleCheck = checkOracle(input.oracle_result);
  const score = scoreRun({
    ...input.run_metrics,
    failure_tags: oracleCheck.failure_tags,
  });
  const reviewReason = [...oracleCheck.review_reason];
  const failureTags = ensureFailureTags(
    normalizeFailureTags([
      ...oracleCheck.failure_tags,
      ...(reviewReason.length > 0 ? ['F10'] : []),
    ]),
    oracleCheck.outcome_passed,
    score.process_fail,
  );
  const autoVerdict = determineAutoVerdict(
    reviewReason,
    score,
    failureTags,
    oracleCheck.outcome_passed,
  );
  const reviewTicket = reviewReason.length > 0
    ? {
        status: 'pending_review' as const,
        run_dir: input.run_id,
        review_reason: reviewReason,
        failure_tags: failureTags,
        preserved_evidence: ensureReviewEvidence(input.evidence_paths),
      }
    : undefined;

  return {
    status: toVerdictStatus(autoVerdict),
    auto_verdict: autoVerdict,
    run_id: input.run_id,
    total_score: score.total_score,
    score_breakdown: score,
    failure_tags: failureTags,
    failure_tag_names: getFailureTagNames(failureTags),
    primary_failure_tag: selectPrimaryFailureTag(failureTags),
    human_review_required: reviewReason.length > 0,
    final_verdict: null,
    review_reason: reviewReason,
    required_events_met: oracleCheck.required_events_met,
    trace_insufficient_reasons: oracleCheck.trace_insufficient_reasons,
    review_ticket: reviewTicket,
  };
}

export function writeVerdictArtifact(
  destinationPath: string,
  verdict: BenchmarkVerdictArtifact,
): BenchmarkVerdictArtifact {
  const validation = validateBenchmarkSchema('benchmark-verdict', verdict);
  if (!validation.valid) {
    throw new Error(`benchmark_verdict_invalid: ${validation.errors.join('; ')}`);
  }

  mkdirSync(path.dirname(destinationPath), { recursive: true });
  writeFileSync(destinationPath, `${JSON.stringify(verdict, null, 2)}\n`, 'utf-8');

  return verdict;
}
