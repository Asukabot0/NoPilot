/**
 * MOD-005: test_runner
 *
 * Validate tests.json and execute tests in Worker worktrees.
 * Never trusts Worker self-reported results; always executes independently.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestRunnerConfig, TestResult, TestsJsonValidationResult } from './types.js';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Data model field specs
// ---------------------------------------------------------------------------

const EXAMPLE_CASE_REQUIRED = new Set([
  'id',
  'suite_type',
  'module_ref',
  'requirement_refs',
  'description',
  'category',
  'ears_ref',
  'derivation',
  'input',
  'expected_output',
  'setup',
]);

const PROPERTY_CASE_REQUIRED = new Set([
  'id',
  'module_ref',
  'invariant_ref',
  'property',
  'requirement_refs',
]);

const TOP_LEVEL_REQUIRED = new Set([
  'example_cases',
  'property_cases',
  'coverage_summary',
  'coverage_guards',
]);

// ---------------------------------------------------------------------------
// validate_tests_json
// ---------------------------------------------------------------------------

/**
 * Validate a tests.json payload for schema conformance and coverage guards.
 */
export function validateTestsJson(tests: Record<string, unknown>): TestsJsonValidationResult {
  const errors: string[] = [];
  const violations: string[] = [];

  // --- top-level required fields ---
  for (const field of TOP_LEVEL_REQUIRED) {
    if (!(field in tests)) {
      errors.push(`missing required top-level field: '${field}'`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, coverage_guard_violations: violations };
  }

  // --- example_cases items ---
  const exampleCases = tests['example_cases'];
  if (!Array.isArray(exampleCases)) {
    errors.push("'example_cases' must be a list");
  } else {
    for (let idx = 0; idx < exampleCases.length; idx++) {
      const item = exampleCases[idx];
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`example_cases[${idx}] must be a dict`);
        continue;
      }
      for (const field of EXAMPLE_CASE_REQUIRED) {
        if (!(field in (item as Record<string, unknown>))) {
          errors.push(`example_cases[${idx}] missing required field: '${field}'`);
        }
      }
    }
  }

  // --- property_cases items ---
  const propertyCases = tests['property_cases'];
  if (!Array.isArray(propertyCases)) {
    errors.push("'property_cases' must be a list");
  } else {
    for (let idx = 0; idx < propertyCases.length; idx++) {
      const item = propertyCases[idx];
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`property_cases[${idx}] must be a dict`);
        continue;
      }
      for (const field of PROPERTY_CASE_REQUIRED) {
        if (!(field in (item as Record<string, unknown>))) {
          errors.push(`property_cases[${idx}] missing required field: '${field}'`);
        }
      }
    }
  }

  // --- coverage_summary structure ---
  const coverageSummary = tests['coverage_summary'];
  if (typeof coverageSummary !== 'object' || coverageSummary === null || Array.isArray(coverageSummary)) {
    errors.push("'coverage_summary' must be a dict");
  }

  // --- coverage_guards checks ---
  const coverageGuards = tests['coverage_guards'];
  if (typeof coverageGuards !== 'object' || coverageGuards === null || Array.isArray(coverageGuards)) {
    errors.push("'coverage_guards' must be a dict");
  } else if (typeof coverageSummary === 'object' && coverageSummary !== null && !Array.isArray(coverageSummary)) {
    const guards = coverageGuards as Record<string, unknown>;
    const summary = coverageSummary as Record<string, unknown>;

    if (guards['invariants_uncovered_must_be_empty'] === true) {
      const uncovered = summary['invariants_uncovered'];
      if (Array.isArray(uncovered) && uncovered.length > 0) {
        violations.push(
          `coverage_guard violation: invariants_uncovered must be empty but found: ${JSON.stringify(uncovered)}`,
        );
      }
    }
    if (guards['requirements_uncovered_must_be_empty'] === true) {
      const uncovered = summary['requirements_uncovered'];
      if (Array.isArray(uncovered) && uncovered.length > 0) {
        violations.push(
          `coverage_guard violation: requirements_uncovered must be empty but found: ${JSON.stringify(uncovered)}`,
        );
      }
    }
  }

  const valid = errors.length === 0;
  return { valid, errors, coverage_guard_violations: violations };
}

// ---------------------------------------------------------------------------
// detect_test_runner
// ---------------------------------------------------------------------------

/**
 * Auto-detect the project test runner from the worktree configuration.
 *
 * Detection order:
 *   1. package.json with scripts.test → jest or npm
 *   2. pyproject.toml / setup.py / conftest.py / tests/*.py → pytest
 *   3. go.mod → go test
 *   4. Makefile with 'test' target → make test
 *   5. None found → throw Error('no_runner_detected')
 */
export function detectTestRunner(worktreePath: string): TestRunnerConfig {
  // 1. package.json
  const pkgPath = join(worktreePath, 'package.json');
  if (existsSync(pkgPath) && statSync(pkgPath).isFile()) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      const scripts = pkg['scripts'];
      if (typeof scripts === 'object' && scripts !== null && 'test' in (scripts as Record<string, unknown>)) {
        const testScript = (scripts as Record<string, unknown>)['test'];
        const runnerType = typeof testScript === 'string' && testScript.toLowerCase().includes('jest')
          ? 'jest'
          : 'npm';
        return { command: 'npm test', type: runnerType, args: [] };
      }
    } catch {
      // ignore JSON parse / read errors
    }
  }

  // 2. Python project indicators
  const pythonIndicators = ['pyproject.toml', 'setup.py', 'conftest.py'];
  for (const indicator of pythonIndicators) {
    const indicatorPath = join(worktreePath, indicator);
    if (existsSync(indicatorPath) && statSync(indicatorPath).isFile()) {
      return { command: 'pytest', type: 'pytest', args: [] };
    }
  }

  // tests/ directory with .py files
  const testsDir = join(worktreePath, 'tests');
  if (existsSync(testsDir) && statSync(testsDir).isDirectory()) {
    const entries = readdirSync(testsDir);
    for (const name of entries) {
      if (name.endsWith('.py')) {
        return { command: 'pytest', type: 'pytest', args: [] };
      }
    }
  }

  // 3. go.mod
  const goModPath = join(worktreePath, 'go.mod');
  if (existsSync(goModPath) && statSync(goModPath).isFile()) {
    return { command: 'go test ./...', type: 'go_test', args: [] };
  }

  // 4. Makefile with test target
  const makefilePath = join(worktreePath, 'Makefile');
  if (existsSync(makefilePath) && statSync(makefilePath).isFile()) {
    try {
      const content = readFileSync(makefilePath, 'utf-8');
      if (/^test\s*:/m.test(content)) {
        return { command: 'make test', type: 'make_test', args: [] };
      }
    } catch {
      // ignore read errors
    }
  }

  throw new Error('no_runner_detected');
}

// ---------------------------------------------------------------------------
// run_tests
// ---------------------------------------------------------------------------

/**
 * Execute tests in the given worktree and return structured results.
 *
 * @param worktreePath - Absolute path to the Worker worktree.
 * @param runnerConfig - TestRunnerConfig; if null/undefined, auto-detected.
 * @param testFilter - Optional filter string passed to the test runner.
 */
export async function runTests(
  worktreePath: string,
  runnerConfig?: TestRunnerConfig | null,
  testFilter?: string | null,
): Promise<TestResult> {
  const config = runnerConfig ?? detectTestRunner(worktreePath);

  const cmdParts = config.command.split(' ');
  if (config.args.length > 0) {
    cmdParts.push(...config.args);
  }
  if (testFilter) {
    cmdParts.push(testFilter);
  }

  const fullCommand = cmdParts.join(' ');
  const start = performance.now();

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    const result = await execAsync(fullCommand, { cwd: worktreePath });
    stdout = result.stdout;
    stderr = result.stderr;
    exitCode = 0;
  } catch (e: unknown) {
    // exec rejects when exit code != 0
    const execError = e as { stdout?: string; stderr?: string; code?: number };
    stdout = execError.stdout ?? '';
    stderr = execError.stderr ?? '';
    exitCode = typeof execError.code === 'number' ? execError.code : 1;
  }

  const durationSeconds = (performance.now() - start) / 1000;
  const passed = exitCode === 0;
  const summary = extractSummary(stdout, stderr);

  return {
    passed,
    exit_code: exitCode,
    stdout,
    stderr,
    duration_seconds: durationSeconds,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractSummary(stdout: string, stderr: string): string | null {
  const combined = stdout + '\n' + stderr;
  const pattern = /.*(?:passed|failed).*/gi;
  let lastMatch: string | null = null;
  for (const line of combined.split('\n')) {
    pattern.lastIndex = 0;
    if (pattern.test(line)) {
      lastMatch = line.trim();
    }
  }
  return lastMatch;
}
