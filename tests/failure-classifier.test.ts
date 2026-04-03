/**
 * Tests for MOD-006: failure_classifier (TEST-056 through TEST-072)
 * Translated from tests/test_failure_classifier.py
 */
import { describe, it, expect } from 'vitest';
import { classifyFailure, determineAction, type TestResult } from '../src/lash/failure-classifier.js';

function makeResult(overrides: Partial<TestResult> = {}): TestResult {
  return {
    passed: false,
    exit_code: 1,
    stdout: '',
    stderr: '',
    duration_seconds: 1.0,
    summary: '',
    ...overrides,
  };
}

describe('classifyFailure', () => {
  // TEST-056: MODULE_NOT_FOUND → L0
  it('TEST-056: ModuleNotFoundError is L0', () => {
    const result = makeResult({ stderr: "ModuleNotFoundError: No module named 'requests'" });
    const classification = classifyFailure(result, ['lash/mymodule.py']);
    expect(classification.highest_level).toBe('L0');
    expect(classification.reasons.some((r) => r.level === 'L0')).toBe(true);
  });

  // TEST-057: EADDRINUSE → L0
  it('TEST-057: EADDRINUSE is L0', () => {
    const result = makeResult({ stderr: 'Error: listen EADDRINUSE: address already in use :::8080' });
    const classification = classifyFailure(result, []);
    expect(classification.highest_level).toBe('L0');
  });

  // TEST-058: AssertionError → L1
  it('TEST-058: AssertionError is L1', () => {
    const result = makeResult({
      stderr: 'AssertionError: assert 1 == 2\n  File "lash/mymodule.py", line 42, in test_something',
    });
    const classification = classifyFailure(result, ['lash/mymodule.py']);
    expect(classification.highest_level).toBe('L1');
  });

  // TEST-059: TypeError → L1
  it('TEST-059: TypeError is L1', () => {
    const result = makeResult({
      stderr: "TypeError: unsupported operand type(s) for +: 'int' and 'str'\n  File \"lash/mymodule.py\", line 10",
    });
    const classification = classifyFailure(result, ['lash/mymodule.py']);
    expect(classification.highest_level).toBe('L1');
  });

  // TEST-060: Wrong return type → L2
  it('TEST-060: wrong return type is L2', () => {
    const result = makeResult({ stderr: 'wrong return type: expected dict got str' });
    const classification = classifyFailure(result, []);
    expect(classification.highest_level).toBe('L2');
  });

  // TEST-061: Circular import → L3
  it('TEST-061: circular import is L3', () => {
    const result = makeResult({
      stderr:
        "ImportError: cannot import name 'foo' from partially initialized " +
        "module 'bar' (most likely due to a circular import)",
    });
    const classification = classifyFailure(result, []);
    expect(classification.highest_level).toBe('L3');
  });

  // TEST-062: Unclassifiable → L2
  it('TEST-062: unclassifiable defaults to L2', () => {
    const result = makeResult({ stderr: 'Some completely unknown error that matches nothing' });
    const classification = classifyFailure(result, []);
    expect(classification.highest_level).toBe('L2');
  });

  // TEST-070: L0 + L1 mix → highest = L1
  it('TEST-070: L0+L1 mix, highest is L1', () => {
    const result = makeResult({
      stderr:
        "ModuleNotFoundError: No module named 'yaml'\n" +
        'AssertionError: assert 1 == 2\n' +
        '  File "lash/mymodule.py", line 7',
    });
    const classification = classifyFailure(result, ['lash/mymodule.py']);
    expect(classification.highest_level).toBe('L1');
    const levels = new Set(classification.reasons.map((r) => r.level));
    expect(levels.has('L0')).toBe(true);
    expect(levels.has('L1')).toBe(true);
  });

  // TEST-071: L1 + L2 mix → highest = L2
  it('TEST-071: L1+L2 mix, highest is L2', () => {
    const result = makeResult({
      stderr:
        'AssertionError: assert value == expected\n' +
        '  File "lash/mymodule.py", line 20\n' +
        'wrong return type: expected dict got list',
    });
    const classification = classifyFailure(result, ['lash/mymodule.py']);
    expect(classification.highest_level).toBe('L2');
  });

  // TEST-072: Any L3 present → L3 wins
  it('TEST-072: any L3 present wins', () => {
    const result = makeResult({
      stderr:
        'AssertionError: assert 1 == 2\n' +
        'wrong return type: expected int\n' +
        'circular import detected in module chain',
    });
    const classification = classifyFailure(result, []);
    expect(classification.highest_level).toBe('L3');
  });

  // Additional: connection refused → L0
  it('connection refused is L0', () => {
    const result = makeResult({ stderr: 'connection refused to localhost:5432' });
    const classification = classifyFailure(result, []);
    expect(classification.highest_level).toBe('L0');
  });

  // Additional: ENOENT → L0
  it('ENOENT / FileNotFoundError is L0', () => {
    const result = makeResult({ stderr: 'FileNotFoundError: [Errno 2] No such file' });
    const classification = classifyFailure(result, []);
    expect(classification.highest_level).toBe('L0');
  });

  // Additional: spec contradiction → L3
  it('spec contradiction is L3', () => {
    const result = makeResult({ stderr: 'spec contradiction: field A conflicts with B' });
    const classification = classifyFailure(result, []);
    expect(classification.highest_level).toBe('L3');
  });

  // Additional: missing field → L2
  it('missing field is L2', () => {
    const result = makeResult({ stderr: "missing field 'id' in response" });
    const classification = classifyFailure(result, []);
    expect(classification.highest_level).toBe('L2');
  });

  // Additional: passed test → PASS
  it('passed test returns PASS', () => {
    const result = makeResult({ passed: true, exit_code: 0, stderr: '', stdout: 'All OK' });
    const classification = classifyFailure(result, []);
    expect(classification.highest_level).toBe('PASS');
    expect(classification.level).toBe('PASS');
    expect(classification.reasons).toHaveLength(0);
  });

  // Additional: ClassificationResult structure
  it('ClassificationResult has correct shape', () => {
    const result = makeResult({ stderr: "ModuleNotFoundError: No module named 'os'" });
    const classification = classifyFailure(result, []);
    expect(typeof classification.level).toBe('string');
    expect(Array.isArray(classification.reasons)).toBe(true);
    expect(typeof classification.highest_level).toBe('string');
    for (const reason of classification.reasons) {
      expect(typeof reason.level).toBe('string');
      expect(typeof reason.pattern_matched).toBe('string');
      expect(typeof reason.evidence).toBe('string');
    }
  });

  // Additional: optional fields on ClassificationReason
  it('ClassificationReason optional fields', () => {
    const result = makeResult({
      stderr: 'AssertionError\n  File "lash/foo.py", line 10, in test_x',
    });
    const classification = classifyFailure(result, ['lash/foo.py']);
    const l1Reasons = classification.reasons.filter((r) => r.level === 'L1');
    expect(l1Reasons.length).toBeGreaterThan(0);
    const reason = l1Reasons[0];
    if (reason.file !== null) {
      expect(typeof reason.file).toBe('string');
    }
    if (reason.line !== null) {
      expect(typeof reason.line).toBe('number');
    }
  });
});

describe('determineAction', () => {
  // TEST-063: L0 with retries remaining → env_retry
  it('TEST-063: L0 env_retry when retries remain', () => {
    const result = makeResult({ stderr: "ModuleNotFoundError: No module named 'yaml'" });
    const classification = classifyFailure(result, []);
    const action = determineAction(classification, 0, 0);
    expect(action.type).toBe('env_retry');
    expect(action.exhausted).toBe(false);
  });

  // TEST-064: retry_count >= max_retries → escalate_l3
  it('TEST-064: L0 exhausted retries → escalate_l3', () => {
    const result = makeResult({ stderr: "ModuleNotFoundError: No module named 'yaml'" });
    const classification = classifyFailure(result, []);
    const action = determineAction(classification, 3, 0, 3);
    expect(action.type).toBe('escalate_l3');
    expect(action.exhausted).toBe(true);
  });

  // TEST-065: L1 → feedback_to_worker
  it('TEST-065: L1 feedback_to_worker', () => {
    const result = makeResult({
      stderr: 'AssertionError: assert False\n  File "lash/foo.py", line 5',
    });
    const classification = classifyFailure(result, ['lash/foo.py']);
    const action = determineAction(classification, 0, 0);
    expect(action.type).toBe('feedback_to_worker');
    expect(action.details).toHaveProperty('failing_tests');
  });

  // TEST-066: L2 → pause_l2 with exactly 5 options
  it('TEST-066: L2 pause_l2 with 5 options', () => {
    const result = makeResult({ stderr: 'wrong return type: expected list got None' });
    const classification = classifyFailure(result, []);
    const action = determineAction(classification, 0, 0);
    expect(action.type).toBe('pause_l2');
    const options = action.details['options'] as string[];
    expect(options).toHaveLength(5);
    const expected = new Set([
      'ACCEPT_DEGRADATION',
      'CUT_FEATURE',
      'MODIFY_SPEC',
      'RETRY_DIFFERENT_APPROACH',
      'BACKTRACK_DISCOVER',
    ]);
    expect(new Set(options)).toEqual(expected);
  });

  // TEST-067: L3 → halt_l3 with backtrack options
  it('TEST-067: L3 halt_l3 with backtrack options', () => {
    const result = makeResult({ stderr: 'circular import detected between modules foo and bar' });
    const classification = classifyFailure(result, []);
    const action = determineAction(classification, 0, 0);
    expect(action.type).toBe('halt_l3');
    const options = action.details['options'] as string[];
    expect(new Set(options)).toEqual(new Set(['BACKTRACK_SPEC', 'BACKTRACK_DISCOVER']));
  });

  // TEST-068: retry_count >= max_retries → escalate_l3 (exhausted=true)
  it('TEST-068: max retries exceeded → escalate_l3', () => {
    const result = makeResult({ stderr: 'AssertionError: expected True got False' });
    const classification = classifyFailure(result, []);
    const action = determineAction(classification, 3, 0, 3);
    expect(action.type).toBe('escalate_l3');
    expect(action.exhausted).toBe(true);
  });

  // TEST-069: approach_reset_count >= max_approach_resets → escalate_l3
  it('TEST-069: max approach resets exceeded → escalate_l3', () => {
    const result = makeResult({ stderr: 'AssertionError: expected True got False' });
    const classification = classifyFailure(result, []);
    const action = determineAction(classification, 0, 2, 3, 2);
    expect(action.type).toBe('escalate_l3');
    expect(action.exhausted).toBe(true);
  });

  // Additional: FailureAction structure
  it('FailureAction has correct shape', () => {
    const result = makeResult({ stderr: "ModuleNotFoundError: No module named 'x'" });
    const classification = classifyFailure(result, []);
    const action = determineAction(classification, 0, 0);
    expect(typeof action.type).toBe('string');
    expect(typeof action.details).toBe('object');
    expect(typeof action.exhausted).toBe('boolean');
  });
});
