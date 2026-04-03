/**
 * MOD-006: failure_classifier
 *
 * Analyze test failure output (stderr, stdout, stack traces) and classify into
 * L0-L3 levels. Determine routing action based on classification, retry counts,
 * and approach resets. Handle multi-level failures using highest level.
 *
 * Level definitions:
 *   L0 - Environment errors (missing deps, port conflicts, filesystem issues)
 *   L1 - Implementation errors in owned files (assertions, type errors)
 *   L2 - Contract/spec violations (wrong return types, missing fields)
 *   L3 - Fundamental errors (circular imports, architectural incompatibilities)
 */

import type {
  FailureLevel,
  ClassificationReason,
  ClassificationResult,
  FailureAction,
} from './types.js';

// ---------------------------------------------------------------------------
// Level ordering (higher index = higher severity)
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };

function higher(a: string, b: string): string {
  return (LEVEL_ORDER[a] ?? 0) >= (LEVEL_ORDER[b] ?? 0) ? a : b;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

// Each entry: [level, pattern_name, compiled_regex]
type PatternEntry = [string, string, RegExp];

const PATTERNS: PatternEntry[] = [
  // L3: Fundamental
  [
    'L3',
    'circular_import',
    /circular import|ImportError.*circular|most likely due to a circular import/i,
  ],
  [
    'L3',
    'architectural_incompatibility',
    /architectural incompatibility/i,
  ],
  [
    'L3',
    'spec_contradiction',
    /spec contradiction/i,
  ],
  // L2: Contract violations
  [
    'L2',
    'wrong_return_type',
    /wrong return type/i,
  ],
  [
    'L2',
    'missing_field',
    /missing field/i,
  ],
  [
    'L2',
    'contradicts_spec',
    /contradicts spec/i,
  ],
  [
    'L2',
    'interface_mismatch',
    /interface mismatch/i,
  ],
  // L0: Environment
  [
    'L0',
    'module_not_found',
    /ModuleNotFoundError|MODULE_NOT_FOUND/i,
  ],
  [
    'L0',
    'eaddrinuse',
    /EADDRINUSE/i,
  ],
  [
    'L0',
    'enoent',
    /ENOENT|FileNotFoundError/i,
  ],
  [
    'L0',
    'connection_refused',
    /connection refused/i,
  ],
  [
    'L0',
    'api_timeout',
    /API timeout|TimeoutError/i,
  ],
  [
    'L0',
    'missing_binary',
    /missing binary|command not found/i,
  ],
  [
    'L0',
    'oom_killed',
    /Killed|Out of memory|OOM/i,
  ],
  // L1: Implementation errors
  [
    'L1',
    'assertion_error',
    /AssertionError|assertion failure/i,
  ],
  [
    'L1',
    'type_error',
    /TypeError/i,
  ],
  [
    'L1',
    'reference_error',
    /ReferenceError/i,
  ],
  [
    'L1',
    'syntax_error',
    /SyntaxError/i,
  ],
];


// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface FileRef {
  file: string;
  line: number;
  pos: number;
}

function extractFileRefs(text: string): FileRef[] {
  const refs: FileRef[] = [];
  const re = /File "([^"]+)", line (\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    refs.push({ file: m[1], line: parseInt(m[2], 10), pos: m.index });
  }
  return refs;
}

function findAssociatedFileLine(
  refs: FileRef[],
  matchPos: number,
): { file: string | null; line: number | null } {
  if (refs.length === 0) {
    return { file: null, line: null };
  }

  let bestFile: string | null = null;
  let bestLine: number | null = null;
  let bestDist = Infinity;

  for (const ref of refs) {
    const dist = Math.abs(ref.pos - matchPos);
    if (dist < bestDist) {
      bestDist = dist;
      bestFile = ref.file;
      bestLine = ref.line;
    }
  }

  return { file: bestFile, line: bestLine };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Test result shape expected by classify_failure. */
export interface TestResult {
  passed?: boolean;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  duration_seconds?: number;
  summary?: string;
}

/**
 * Analyze test failure output and classify into L0-L3.
 *
 * @param testResult - object with keys: passed, exit_code, stdout, stderr, duration_seconds, summary
 * @param ownedFiles - list of file paths this module owns
 * @returns ClassificationResult with level, reasons, and highest_level
 */
export function classifyFailure(
  testResult: TestResult,
  ownedFiles: string[],
): ClassificationResult {
  // If test passed, return a no-failure result
  if (testResult.passed) {
    return {
      level: 'PASS',
      reasons: [],
      highest_level: 'PASS',
    };
  }

  const combinedText = [
    testResult.stderr ?? '',
    testResult.stdout ?? '',
    testResult.summary ?? '',
  ].join('\n');

  const ownedSet = new Set(ownedFiles);
  const reasons: ClassificationReason[] = [];

  // Extract all file references from the combined text
  const fileRefs = extractFileRefs(combinedText);

  for (const [level, patternName, pattern] of PATTERNS) {
    // Reset lastIndex since we reuse the same regex object
    pattern.lastIndex = 0;
    const match = pattern.exec(combinedText);
    if (!match) {
      continue;
    }

    const evidence = match[0];
    const matchPos = match.index;

    const { file: fileRef, line: lineRef } = findAssociatedFileLine(fileRefs, matchPos);

    const inOwned: boolean | null = fileRef !== null ? ownedSet.has(fileRef) : null;

    reasons.push({
      level: level as FailureLevel,
      pattern_matched: patternName,
      evidence,
      file: fileRef,
      line: lineRef,
      in_owned_files: inOwned,
    });
  }

  // If nothing matched → default to L2 (unclassifiable)
  if (reasons.length === 0) {
    const trimmed = combinedText.trim();
    reasons.push({
      level: 'L2',
      pattern_matched: 'unclassifiable',
      evidence: trimmed ? combinedText.slice(0, 200) : '(no output)',
      file: null,
      line: null,
      in_owned_files: null,
    });
  }

  // Determine highest level
  let highest = reasons[0].level as string;
  for (const r of reasons.slice(1)) {
    highest = higher(highest, r.level as string);
  }

  return {
    level: highest as FailureLevel,
    reasons,
    highest_level: highest as FailureLevel,
  };
}

/**
 * Determine routing action based on classification and retry state.
 *
 * @param classification - result from classifyFailure()
 * @param retryCount - number of retries already attempted
 * @param approachResetCount - number of approach resets already done
 * @param maxRetries - threshold before escalating (default 3)
 * @param maxApproachResets - threshold before escalating (default 2)
 * @returns FailureAction with type, details, and exhausted flag
 */
export function determineAction(
  classification: ClassificationResult,
  retryCount: number,
  approachResetCount: number,
  maxRetries: number = 3,
  maxApproachResets: number = 2,
): FailureAction {
  // Exhaustion check takes priority over everything
  if (retryCount >= maxRetries || approachResetCount >= maxApproachResets) {
    return {
      type: 'escalate_l3',
      details: { reason: 'retry_or_reset_limit_exceeded' },
      exhausted: true,
    };
  }

  const level = classification.highest_level;

  if (level === 'L0') {
    return {
      type: 'env_retry',
      details: { retry_count: retryCount },
      exhausted: false,
    };
  }

  if (level === 'L1') {
    const failingTests = classification.reasons
      .filter((r) => r.level === 'L1')
      .map((r) => ({
        pattern: r.pattern_matched,
        evidence: r.evidence,
        file: r.file,
        line: r.line,
      }));
    return {
      type: 'feedback_to_worker',
      details: { failing_tests: failingTests },
      exhausted: false,
    };
  }

  if (level === 'L2') {
    return {
      type: 'pause_l2',
      details: {
        options: [
          'ACCEPT_DEGRADATION',
          'CUT_FEATURE',
          'MODIFY_SPEC',
          'RETRY_DIFFERENT_APPROACH',
          'BACKTRACK_DISCOVER',
        ],
      },
      exhausted: false,
    };
  }

  if (level === 'L3') {
    return {
      type: 'halt_l3',
      details: {
        options: [
          'BACKTRACK_SPEC',
          'BACKTRACK_DISCOVER',
        ],
      },
      exhausted: false,
    };
  }

  // Fallback (e.g., PASS or unknown level)
  return {
    type: 'feedback_to_worker',
    details: { failing_tests: [] },
    exhausted: false,
  };
}
