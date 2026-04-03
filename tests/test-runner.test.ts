/**
 * Tests for MOD-005: test_runner (TEST-046 through TEST-055)
 * Translated from tests/test_test_runner.py
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateTestsJson, detectTestRunner, runTests } from '../src/lash/test-runner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidTestsDict(): Record<string, unknown> {
  return {
    example_cases: [
      {
        id: 'TEST-001',
        suite_type: 'unit',
        module_ref: 'mod_a',
        requirement_refs: ['REQ-001'],
        description: 'basic test',
        category: 'happy_path',
        ears_ref: 'EARS-001',
        derivation: 'direct',
        input: { x: 1 },
        expected_output: { y: 2 },
        setup: null,
      },
    ],
    property_cases: [
      {
        id: 'PROP-001',
        module_ref: 'mod_a',
        invariant_ref: 'INV-001',
        property: 'x > 0',
        requirement_refs: ['REQ-001'],
      },
    ],
    coverage_summary: {
      requirements_uncovered: [],
      invariants_uncovered: [],
    },
    coverage_guards: {
      invariants_uncovered_must_be_empty: true,
      requirements_uncovered_must_be_empty: true,
    },
  };
}

function makeWorktree(files: Record<string, string | Record<string, unknown>>): string {
  const tmp = mkdtempSync(join(tmpdir(), 'lash-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(tmp, rel);
    // dirname: everything before the last slash
    const lastSlash = full.lastIndexOf('/');
    const dir = lastSlash >= 0 ? full.substring(0, lastSlash) : '.';
    mkdirSync(dir, { recursive: true });
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    writeFileSync(full, text, 'utf-8');
  }
  return tmp;
}

// ---------------------------------------------------------------------------
// validateTestsJson — TEST-046 through TEST-054
// ---------------------------------------------------------------------------

describe('validateTestsJson', () => {
  // TEST-046: Valid tests.json passes validation
  it('TEST-046: valid tests.json passes', () => {
    const data = makeValidTestsDict();
    const result = validateTestsJson(data);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.coverage_guard_violations).toEqual([]);
  });

  // TEST-047: Missing top-level required fields
  it('TEST-047: missing all required fields', () => {
    const result = validateTestsJson({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('TEST-047: missing example_cases', () => {
    const data = makeValidTestsDict();
    delete data['example_cases'];
    const result = validateTestsJson(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('example_cases'))).toBe(true);
  });

  it('TEST-047: missing property_cases', () => {
    const data = makeValidTestsDict();
    delete data['property_cases'];
    const result = validateTestsJson(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('property_cases'))).toBe(true);
  });

  it('TEST-047: missing coverage_summary', () => {
    const data = makeValidTestsDict();
    delete data['coverage_summary'];
    const result = validateTestsJson(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('coverage_summary'))).toBe(true);
  });

  it('TEST-047: missing coverage_guards', () => {
    const data = makeValidTestsDict();
    delete data['coverage_guards'];
    const result = validateTestsJson(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('coverage_guards'))).toBe(true);
  });

  it('TEST-047: example_case missing id field', () => {
    const data = makeValidTestsDict();
    const cases = data['example_cases'] as Record<string, unknown>[];
    delete cases[0]['id'];
    const result = validateTestsJson(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('id'))).toBe(true);
  });

  it('TEST-047: property_case missing property field', () => {
    const data = makeValidTestsDict();
    const cases = data['property_cases'] as Record<string, unknown>[];
    delete cases[0]['property'];
    const result = validateTestsJson(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('property'))).toBe(true);
  });

  // TEST-053: Coverage guard violations
  it('TEST-053: uncovered requirements → violation', () => {
    const data = makeValidTestsDict();
    (data['coverage_summary'] as Record<string, unknown>)['requirements_uncovered'] = ['REQ-999'];
    (data['coverage_guards'] as Record<string, unknown>)['requirements_uncovered_must_be_empty'] = true;
    const result = validateTestsJson(data);
    expect(result.valid).toBe(true); // structurally valid
    expect(result.coverage_guard_violations.length).toBeGreaterThan(0);
    expect(result.coverage_guard_violations.some((v) => v.includes('requirements_uncovered'))).toBe(true);
  });

  it('TEST-053: uncovered invariants → violation', () => {
    const data = makeValidTestsDict();
    (data['coverage_summary'] as Record<string, unknown>)['invariants_uncovered'] = ['INV-999'];
    (data['coverage_guards'] as Record<string, unknown>)['invariants_uncovered_must_be_empty'] = true;
    const result = validateTestsJson(data);
    expect(result.valid).toBe(true);
    expect(result.coverage_guard_violations.length).toBeGreaterThan(0);
    expect(result.coverage_guard_violations.some((v) => v.includes('invariants_uncovered'))).toBe(true);
  });

  // TEST-054: All covered → no violation
  it('TEST-054: all covered, no violation', () => {
    const data = makeValidTestsDict();
    const result = validateTestsJson(data);
    expect(result.valid).toBe(true);
    expect(result.coverage_guard_violations).toEqual([]);
  });

  it('TEST-054: guard false with uncovered → no violation', () => {
    const data = makeValidTestsDict();
    (data['coverage_summary'] as Record<string, unknown>)['requirements_uncovered'] = ['REQ-999'];
    (data['coverage_guards'] as Record<string, unknown>)['requirements_uncovered_must_be_empty'] = false;
    const result = validateTestsJson(data);
    expect(result.coverage_guard_violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectTestRunner — TEST-048 through TEST-050
// ---------------------------------------------------------------------------

describe('detectTestRunner', () => {
  // TEST-048: package.json with scripts.test
  it('TEST-048: detect jest from package.json', () => {
    const tmp = makeWorktree({ 'package.json': { scripts: { test: 'jest' } } });
    const result = detectTestRunner(tmp);
    expect(['jest', 'npm']).toContain(result.type);
    expect(result.command).toBe('npm test');
  });

  it('TEST-048: detect npm generic from package.json', () => {
    const tmp = makeWorktree({ 'package.json': { scripts: { test: 'mocha tests/' } } });
    const result = detectTestRunner(tmp);
    expect(result.command).toBe('npm test');
  });

  // TEST-049: Python project → pytest
  it('TEST-049: detect pytest from pyproject.toml', () => {
    const tmp = makeWorktree({ 'pyproject.toml': '[tool.pytest]\n' });
    const result = detectTestRunner(tmp);
    expect(result.type).toBe('pytest');
    expect(result.command).toBe('pytest');
  });

  it('TEST-049: detect pytest from setup.py', () => {
    const tmp = makeWorktree({ 'setup.py': 'from setuptools import setup\n' });
    const result = detectTestRunner(tmp);
    expect(result.type).toBe('pytest');
    expect(result.command).toBe('pytest');
  });

  it('TEST-049: detect pytest from conftest.py', () => {
    const tmp = makeWorktree({ 'conftest.py': '# conftest\n' });
    const result = detectTestRunner(tmp);
    expect(result.type).toBe('pytest');
    expect(result.command).toBe('pytest');
  });

  it('TEST-049: detect pytest from tests/*.py', () => {
    const tmp = makeWorktree({ 'tests/test_foo.py': '# test\n' });
    const result = detectTestRunner(tmp);
    expect(result.type).toBe('pytest');
    expect(result.command).toBe('pytest');
  });

  it('detect go test from go.mod', () => {
    const tmp = makeWorktree({ 'go.mod': 'module example.com/foo\ngo 1.21\n' });
    const result = detectTestRunner(tmp);
    expect(result.type).toBe('go_test');
    expect(result.command).toBe('go test ./...');
  });

  it('detect make test from Makefile', () => {
    const tmp = makeWorktree({ 'Makefile': 'all:\n\techo hi\n\ntest:\n\tpython -m pytest\n' });
    const result = detectTestRunner(tmp);
    expect(result.type).toBe('make_test');
    expect(result.command).toBe('make test');
  });

  // TEST-050: No runner detected → throws
  it('TEST-050: no runner raises with no_runner_detected', () => {
    const tmp = makeWorktree({ 'README.md': '# nothing\n' });
    expect(() => detectTestRunner(tmp)).toThrow('no_runner_detected');
  });

  it('runner config has args list', () => {
    const tmp = makeWorktree({ 'package.json': { scripts: { test: 'jest' } } });
    const result = detectTestRunner(tmp);
    expect(Array.isArray(result.args)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runTests — TEST-051 through TEST-055
// Uses real subprocess calls with shell commands instead of mocks,
// matching the Python tests' intent: exec runs and returncode determines passed.
// ---------------------------------------------------------------------------

describe('runTests', () => {
  // TEST-051: Tests pass → exit 0, passed=true
  it('TEST-051: tests pass → passed=true, exit_code=0', async () => {
    const runnerCfg = { command: 'echo "1 passed"', type: 'pytest' as const, args: [] };
    const result = await runTests('/tmp', runnerCfg);
    expect(result.passed).toBe(true);
    expect(result.exit_code).toBe(0);
  });

  // TEST-052: Tests fail → exit !=0, passed=false
  it('TEST-052: tests fail → passed=false, exit_code!=0', async () => {
    // `false` is a POSIX command that exits with code 1
    const runnerCfg = { command: 'sh -c "echo 1 failed && exit 1"', type: 'pytest' as const, args: [] };
    const result = await runTests('/tmp', runnerCfg);
    expect(result.passed).toBe(false);
    expect(result.exit_code).toBe(1);
  });

  // TEST-055: Duration captured in seconds
  it('TEST-055: duration captured as float >= 0', async () => {
    const runnerCfg = { command: 'echo ok', type: 'pytest' as const, args: [] };
    const result = await runTests('/tmp', runnerCfg);
    expect('duration_seconds' in result).toBe(true);
    expect(typeof result.duration_seconds).toBe('number');
    expect(result.duration_seconds).toBeGreaterThanOrEqual(0.0);
  });

  it('result has all required fields', async () => {
    const runnerCfg = { command: 'echo "5 passed, 0 failed"', type: 'pytest' as const, args: [] };
    const result = await runTests('/tmp', runnerCfg);
    for (const key of ['passed', 'exit_code', 'stdout', 'stderr', 'duration_seconds', 'summary'] as const) {
      expect(key in result).toBe(true);
    }
  });

  it('stdout and stderr are strings', async () => {
    const runnerCfg = { command: 'echo ok', type: 'go_test' as const, args: [] };
    const result = await runTests('/tmp', runnerCfg);
    expect(typeof result.stdout).toBe('string');
    expect(typeof result.stderr).toBe('string');
  });

  it('auto-detect runner when runnerConfig is null', async () => {
    // Create a worktree with conftest.py so detect_test_runner picks pytest,
    // then use a script that will be treated as the test runner.
    // We override runner_config so the auto-detect flow is tested structurally:
    // pass null and let detectTestRunner find pytest, but the actual exec will
    // call pytest on a temp dir that has no tests → exit 0 (no tests = success)
    // or exit 5 (no tests collected). Either way we get a TestResult back.
    const tmp = makeWorktree({ 'conftest.py': '' });
    // We pass null to exercise the auto-detect branch; pytest may or may not be installed.
    // The test only checks that a result object is returned (not that it passes).
    try {
      const result = await runTests(tmp, null);
      expect(result).not.toBeNull();
      expect('passed' in result).toBe(true);
    } catch {
      // If pytest isn't installed, detectTestRunner still worked but exec failed —
      // runTests catches exec errors internally and still returns a result, so
      // this catch block should never be reached.
      throw new Error('runTests should never throw; it catches exec errors internally');
    }
  });

  it('subprocess is called with the correct cwd (result comes from worktree)', async () => {
    // Write a shell script that prints the cwd to stdout
    const tmp = makeWorktree({});
    const runnerCfg = { command: 'sh -c "pwd"', type: 'make_test' as const, args: [] };
    const result = await runTests(tmp, runnerCfg);
    // stdout should contain the tmp directory path
    expect(result.stdout.trim()).toBe(tmp);
  });

  it('summary extracted from output containing passed/failed', async () => {
    const runnerCfg = {
      command: 'sh -c "echo collecting ... && echo 3 passed in 0.12s"',
      type: 'pytest' as const,
      args: [],
    };
    const result = await runTests('/tmp', runnerCfg);
    expect(result.summary).not.toBeNull();
    expect(result.summary).toContain('passed');
  });
});
