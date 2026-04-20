/**
 * Tests for MOD-002: constraint/tools
 * Covers TEST-003 to TEST-010, TEST-016, TEST-018, TEST-021
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handleWriteFile,
  handleValidateImport,
  handleReadConstraints,
} from '../../src/constraint/tools.js';
import { buildReport, writeReport } from '../../src/constraint/reporter.js';
import type { SessionState, ConstraintRuleSet } from '../../src/constraint/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'tools-test-'));
}

function makeRuleSet(overrides?: Partial<ConstraintRuleSet>): ConstraintRuleSet {
  return {
    moduleId: 'MOD-001',
    ownedFiles: ['src/constraint/**'],
    allowedDependencies: [{ moduleId: 'MOD-002', ownedFiles: ['src/lash/**'] }],
    allModules: [
      { id: 'MOD-001', ownedFiles: ['src/constraint/**'] },
      { id: 'MOD-002', ownedFiles: ['src/lash/**'] },
      { id: 'MOD-003', ownedFiles: ['src/other/**'] },
    ],
    dependencyEdges: [
      { from: 'MOD-001', to: 'MOD-002' },
    ],
    rules: [
      { id: 'file-ownership-MOD-001', type: 'file_ownership', moduleId: 'MOD-001', description: 'file ownership' },
      { id: 'import-direction-MOD-001-MOD-002', type: 'import_direction', moduleId: 'MOD-001', description: 'import direction' },
      { id: 'circular-dep-MOD-001', type: 'circular_dep', moduleId: 'MOD-001', description: 'circular dep' },
    ],
    ...overrides,
  };
}

function makeSessionState(workDir: string, overrides?: Partial<ConstraintRuleSet>): SessionState {
  return {
    ruleSet: makeRuleSet(overrides),
    violations: [],
    mcpCallCount: 0,
    violationsBlockedCount: 0,
  };
}

// ---------------------------------------------------------------------------
// TEST-003: nopilot_write_file succeeds for owned path
// ---------------------------------------------------------------------------

describe('handleWriteFile', () => {
  it('TEST-003: succeeds for path in owned_files', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);

    const result = handleWriteFile(state, workDir, {
      file_path: 'src/constraint/rule-engine.ts',
      content: 'export {}',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Written:');
    expect(existsSync(join(workDir, 'src/constraint/rule-engine.ts'))).toBe(true);
    expect(state.mcpCallCount).toBe(1);
  });

  it('TEST-004: blocks write to non-owned path, no bytes written', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);
    const targetPath = join(workDir, 'src/lash/other-module.ts');

    const result = handleWriteFile(state, workDir, {
      file_path: 'src/lash/other-module.ts',
      content: 'export {}',
    });

    expect(result.isError).toBe(true);
    expect(existsSync(targetPath)).toBe(false);
    expect(state.violations).toHaveLength(1);
    expect(state.violationsBlockedCount).toBe(1);
  });

  it('TEST-005: all non-owned paths blocked equally — dep files, transitive, unrelated', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);

    // Direct dep file
    const r1 = handleWriteFile(state, workDir, { file_path: 'src/lash/file.ts', content: '' });
    // Transitive dep file (MOD-003 not in edges from MOD-001)
    const r2 = handleWriteFile(state, workDir, { file_path: 'src/other/file.ts', content: '' });
    // Completely unrelated file
    const r3 = handleWriteFile(state, workDir, { file_path: 'src/random/file.ts', content: '' });

    expect(r1.isError).toBe(true);
    expect(r2.isError).toBe(true);
    expect(r3.isError).toBe(true);
  });

  it('TEST-016: blocked write produces zero bytes — file does not exist after violation', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);
    const targetPath = join(workDir, 'src/lash/should-not-exist.ts');

    // Ensure it doesn't exist before
    expect(existsSync(targetPath)).toBe(false);

    handleWriteFile(state, workDir, { file_path: 'src/lash/should-not-exist.ts', content: 'data' });

    // Must still not exist after violation
    expect(existsSync(targetPath)).toBe(false);
  });

  it('TEST-018: ConstraintViolation contains all required fields', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);

    const result = handleWriteFile(state, workDir, {
      file_path: 'src/lash/blocked.ts',
      content: 'x',
    });

    expect(result.isError).toBe(true);
    const violation = JSON.parse(result.content[0].text);
    expect(violation).toHaveProperty('ruleId');
    expect(violation).toHaveProperty('ruleType');
    expect(violation).toHaveProperty('violatingPath');
    expect(violation).toHaveProperty('owningModuleId');
    expect(violation).toHaveProperty('suggestedFix');
    expect(violation.ruleId).toBeTruthy();
    expect(violation.suggestedFix).toBeTruthy();
  });

  it('increments mcpCallCount on each call (allowed or blocked)', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);

    handleWriteFile(state, workDir, { file_path: 'src/constraint/a.ts', content: '' });
    handleWriteFile(state, workDir, { file_path: 'src/lash/b.ts', content: '' });

    expect(state.mcpCallCount).toBe(2);
  });

  it('TEST-035: normalizes path with backslashes before checking', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);

    // backslash path — should still match src/constraint/**
    const result = handleWriteFile(state, workDir, {
      file_path: 'src\\constraint\\rule-engine.ts',
      content: 'export {}',
    });
    expect(result.isError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TEST-006 to TEST-008: nopilot_validate_import
// ---------------------------------------------------------------------------

describe('handleValidateImport', () => {
  it('TEST-006: allows import along valid dependency edge (MOD-001 -> MOD-002)', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);

    const result = handleValidateImport(state, {
      source_path: 'src/constraint/server.ts',
      import_target_path: 'src/lash/spec-resolver.ts',
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.allowed).toBe(true);
    expect(parsed.violation).toBeNull();
  });

  it('TEST-007: denies import with no dependency edge (MOD-002 -> MOD-001)', () => {
    const workDir = makeTmpDir();
    // Build state as MOD-002 (which has no edge to MOD-001)
    const state: SessionState = {
      ruleSet: makeRuleSet({
        moduleId: 'MOD-002',
        ownedFiles: ['src/lash/**'],
        allowedDependencies: [],
        dependencyEdges: [{ from: 'MOD-001', to: 'MOD-002' }],
        rules: [
          { id: 'file-ownership-MOD-002', type: 'file_ownership', moduleId: 'MOD-002', description: '' },
        ],
      }),
      violations: [],
      mcpCallCount: 0,
      violationsBlockedCount: 0,
    };

    const result = handleValidateImport(state, {
      source_path: 'src/lash/spec-resolver.ts',
      import_target_path: 'src/constraint/rule-engine.ts',
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.allowed).toBe(false);
    expect(parsed.violation.ruleType).toBe('import_direction');
  });

  it('TEST-008: returns error for unresolvable source path', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);

    const result = handleValidateImport(state, {
      source_path: 'src/unknown/file.ts',
      import_target_path: 'src/constraint/rule-engine.ts',
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe('UNRESOLVABLE_PATH');
  });

  it('increments mcpCallCount', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);
    handleValidateImport(state, {
      source_path: 'src/constraint/server.ts',
      import_target_path: 'src/lash/spec-resolver.ts',
    });
    expect(state.mcpCallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TEST-009, TEST-010: nopilot_read_constraints
// ---------------------------------------------------------------------------

describe('handleReadConstraints', () => {
  it('TEST-009: returns full ConstraintRuleSet summary', () => {
    const state = makeSessionState(makeTmpDir());

    const result = handleReadConstraints(state);

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.moduleId).toBe('MOD-001');
    expect(Array.isArray(parsed.ownedFiles)).toBe(true);
    expect(Array.isArray(parsed.allowedDependencies)).toBe(true);
    expect(typeof parsed.ruleCount).toBe('number');
    expect(parsed.ruleCount).toBeGreaterThan(0);
  });

  it('TEST-010: returns error when no module context (null state)', () => {
    const result = handleReadConstraints(null);

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe('NO_MODULE_CONTEXT');
  });
});

// ---------------------------------------------------------------------------
// TEST-021: constraint-report.json written with correct counters
// ---------------------------------------------------------------------------

describe('buildReport + writeReport', () => {
  it('TEST-021: report contains correct counters after 3 MCP calls (2 allowed, 1 blocked)', () => {
    const workDir = makeTmpDir();
    const state = makeSessionState(workDir);

    // 2 allowed writes
    handleWriteFile(state, workDir, { file_path: 'src/constraint/a.ts', content: '' });
    handleWriteFile(state, workDir, { file_path: 'src/constraint/b.ts', content: '' });
    // 1 blocked write
    handleWriteFile(state, workDir, { file_path: 'src/lash/blocked.ts', content: '' });

    const report = buildReport(state);
    expect(report.moduleId).toBe('MOD-001');
    expect(report.counters.mcpCalls).toBe(3);
    expect(report.counters.violationsBlocked).toBe(1);
    expect(report.violations).toHaveLength(1);
    expect(report.timestamp).toBeTruthy();

    // Write the report and verify the file exists
    const reportPath = writeReport(workDir, report);
    expect(existsSync(reportPath)).toBe(true);
  });

  it('report timestamp is ISO 8601', () => {
    const state = makeSessionState(makeTmpDir());
    const report = buildReport(state);
    expect(() => new Date(report.timestamp)).not.toThrow();
    expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
  });
});
