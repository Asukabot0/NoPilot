import { normalizeFailureTags, type FailureTag } from './failure-taxonomy.js';

export interface OracleCheckInput {
  core_process_violations?: string[];
  failure_tags?: string[];
  outcome_checks_passed?: boolean;
  required_events_met?: string[];
  trace_warnings?: string[];
  ambiguity_reasons?: string[];
}

export interface OracleCheckResult {
  outcome_passed: boolean;
  required_events_met: string[];
  failure_tags: FailureTag[];
  review_reason: string[];
  trace_insufficient_reasons: string[];
}

function normalizeStringList(values: readonly string[] | undefined): string[] {
  const normalized = new Set<string>();

  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      normalized.add(trimmed);
    }
  }

  return [...normalized];
}

function extractTraceInsufficiencyReasons(traceWarnings: readonly string[] | undefined): string[] {
  const reasons: string[] = [];

  for (const warning of traceWarnings ?? []) {
    const trimmed = warning.trim();
    if (!trimmed.startsWith('trace_insufficient')) {
      continue;
    }

    const [, reason = 'trace_insufficient'] = trimmed.split(/:\s*/, 2);
    reasons.push(reason.trim());
  }

  return normalizeStringList(reasons);
}

export function checkOracle(input: OracleCheckInput): OracleCheckResult {
  const traceInsufficientReasons = extractTraceInsufficiencyReasons(input.trace_warnings);
  const reviewReason = normalizeStringList([
    ...(traceInsufficientReasons.length > 0 ? ['semantic_ambiguity'] : []),
    ...normalizeStringList(input.ambiguity_reasons),
  ]);
  const failureTags = normalizeFailureTags([
    ...normalizeStringList(input.core_process_violations),
    ...normalizeStringList(input.failure_tags),
    ...(traceInsufficientReasons.length > 0 ? ['F10'] : []),
  ]);

  return {
    outcome_passed: input.outcome_checks_passed !== false,
    required_events_met: normalizeStringList(input.required_events_met),
    failure_tags: failureTags,
    review_reason: reviewReason,
    trace_insufficient_reasons: traceInsufficientReasons,
  };
}
