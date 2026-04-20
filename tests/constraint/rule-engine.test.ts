/**
 * Tests for MOD-001: constraint/rule-engine
 * Covers TEST-011 to TEST-015, TEST-019, TEST-020, TEST-022, TEST-023
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractRules,
  checkFileOwnership,
  validateImport,
  detectCycle,
  checkProfileConflicts,
} from '../../src/constraint/rule-engine.js';
import type { ConstraintRuleSet } from '../../src/constraint/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'rule-engine-test-'));
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

/** Create a 3-module fixture spec with 2 edges: MOD-A->MOD-B, MOD-B->MOD-C */
function makeFixtureSpec(dir: string): string {
  const spec = {
    phase: 'spec',
    version: '4.0',
    modules: [
      {
        id: 'MOD-A',
        name: 'alpha',
        owned_files: ['src/a/index.ts', 'src/a/helper.ts'],
        source_root: 'src/a/',
      },
      {
        id: 'MOD-B',
        name: 'beta',
        owned_files: ['src/b/index.ts'],
        source_root: 'src/b/',
      },
      {
        id: 'MOD-C',
        name: 'gamma',
        owned_files: ['src/c/index.ts'],
        source_root: 'src/c/',
      },
    ],
    dependency_graph: {
      edges: [
        { from: 'MOD-A', to: 'MOD-B' },
        { from: 'MOD-B', to: 'MOD-C' },
      ],
    },
  };
  const p = join(dir, 'spec.json');
  writeJson(p, spec);
  return p;
}

/** Build a minimal ConstraintRuleSet manually for unit tests that don't need extractRules */
function buildRuleSet(overrides?: Partial<ConstraintRuleSet>): ConstraintRuleSet {
  return {
    moduleId: 'MOD-A',
    ownedFiles: ['src/a/index.ts', 'src/a/helper.ts'],
    allowedDependencies: [{ moduleId: 'MOD-B', ownedFiles: ['src/b/index.ts'] }],
    allModules: [
      { id: 'MOD-A', ownedFiles: ['src/a/index.ts', 'src/a/helper.ts'] },
      { id: 'MOD-B', ownedFiles: ['src/b/index.ts'] },
      { id: 'MOD-C', ownedFiles: ['src/c/index.ts'] },
    ],
    dependencyEdges: [
      { from: 'MOD-A', to: 'MOD-B' },
      { from: 'MOD-B', to: 'MOD-C' },
    ],
    rules: [
      { id: 'file-ownership-MOD-A', type: 'file_ownership', moduleId: 'MOD-A', description: 'file ownership' },
      { id: 'import-direction-MOD-A-MOD-B', type: 'import_direction', moduleId: 'MOD-A', description: 'import direction' },
      { id: 'circular-dep-MOD-A', type: 'circular_dep', moduleId: 'MOD-A', description: 'circular dep' },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TEST-011: extractRules produces ConstraintRuleSet from spec
// ---------------------------------------------------------------------------

describe('extractRules', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  it('TEST-011: produces ConstraintRuleSet with owned_files, allowedDependencies, and rules', () => {
    const specPath = makeFixtureSpec(tmpDir);
    const ruleSet = extractRules(specPath, 'MOD-A');

    expect(ruleSet.moduleId).toBe('MOD-A');
    expect(ruleSet.ownedFiles).toContain('src/a/index.ts');
    expect(ruleSet.ownedFiles).toContain('src/a/helper.ts');
    expect(ruleSet.allowedDependencies).toHaveLength(1);
    expect(ruleSet.allowedDependencies[0].moduleId).toBe('MOD-B');
    expect(ruleSet.rules.length).toBeGreaterThan(0);
    expect(ruleSet.rules.some((r) => r.type === 'file_ownership')).toBe(true);
  });

  it('TEST-012: extractRules works with only spec.json (no other config files)', () => {
    const cleanDir = makeTmpDir();
    const specPath = makeFixtureSpec(cleanDir);
    // No .nopilot/ or any other config — should work fine
    const ruleSet = extractRules(specPath, 'MOD-B');
    expect(ruleSet.moduleId).toBe('MOD-B');
    expect(ruleSet.ownedFiles).toEqual(['src/b/index.ts']);
  });

  it('TEST-013: extractRules throws descriptive error for malformed spec', () => {
    const badSpecPath = join(tmpDir, 'malformed.json');
    writeJson(badSpecPath, { phase: 'spec' }); // missing modules array

    expect(() => extractRules(badSpecPath, 'MOD-A')).toThrow(/SPEC_MALFORMED/);
  });

  it('throws SPEC_NOT_FOUND for missing spec path', () => {
    expect(() => extractRules('/nonexistent/spec.json', 'MOD-A')).toThrow(/SPEC_NOT_FOUND/);
  });

  it('throws MODULE_NOT_FOUND for unknown moduleId', () => {
    const specPath = makeFixtureSpec(tmpDir);
    expect(() => extractRules(specPath, 'MOD-UNKNOWN')).toThrow(/MODULE_NOT_FOUND/);
  });

  it('allModules contains all modules from spec', () => {
    const specPath = makeFixtureSpec(tmpDir);
    const ruleSet = extractRules(specPath, 'MOD-A');
    expect(ruleSet.allModules).toHaveLength(3);
    expect(ruleSet.allModules.map((m) => m.id)).toContain('MOD-A');
    expect(ruleSet.allModules.map((m) => m.id)).toContain('MOD-B');
    expect(ruleSet.allModules.map((m) => m.id)).toContain('MOD-C');
  });

  it('dependencyEdges contains all edges from spec', () => {
    const specPath = makeFixtureSpec(tmpDir);
    const ruleSet = extractRules(specPath, 'MOD-A');
    expect(ruleSet.dependencyEdges).toHaveLength(2);
    expect(ruleSet.dependencyEdges).toContainEqual({ from: 'MOD-A', to: 'MOD-B' });
    expect(ruleSet.dependencyEdges).toContainEqual({ from: 'MOD-B', to: 'MOD-C' });
  });
});

// ---------------------------------------------------------------------------
// checkFileOwnership
// ---------------------------------------------------------------------------

describe('checkFileOwnership', () => {
  it('TEST-019: returns allowed=true for path in ownedFiles', () => {
    const ruleSet = buildRuleSet();
    const result = checkFileOwnership(ruleSet, 'src/a/index.ts');
    expect(result.allowed).toBe(true);
    expect(result.violation).toBeNull();
  });

  it('TEST-019: returns correct owningModuleId when path belongs to another module', () => {
    const ruleSet = buildRuleSet();
    const result = checkFileOwnership(ruleSet, 'src/b/index.ts');
    expect(result.allowed).toBe(false);
    expect(result.violation).not.toBeNull();
    expect(result.violation!.owningModuleId).toBe('MOD-B');
    expect(result.violation!.ruleType).toBe('file_ownership');
  });

  it('returns owningModuleId=null when path not owned by any module', () => {
    const ruleSet = buildRuleSet();
    const result = checkFileOwnership(ruleSet, 'src/unknown/file.ts');
    expect(result.allowed).toBe(false);
    expect(result.violation!.owningModuleId).toBeNull();
  });

  it('violation includes non-empty suggestedFix', () => {
    const ruleSet = buildRuleSet();
    const result = checkFileOwnership(ruleSet, 'src/b/index.ts');
    expect(result.violation!.suggestedFix).toBeTruthy();
    expect(result.violation!.suggestedFix.length).toBeGreaterThan(0);
  });

  it('normalizes path with backslashes before checking', () => {
    const ruleSet = buildRuleSet();
    const result = checkFileOwnership(ruleSet, 'src\\a\\index.ts');
    expect(result.allowed).toBe(true);
  });

  it('handles glob-style /** owned_files pattern', () => {
    const ruleSet = buildRuleSet({
      ownedFiles: ['src/constraint/**'],
      allModules: [{ id: 'MOD-A', ownedFiles: ['src/constraint/**'] }],
    });
    const result = checkFileOwnership(ruleSet, 'src/constraint/rule-engine.ts');
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateImport
// ---------------------------------------------------------------------------

describe('validateImport', () => {
  it('TEST-020: allows import along valid dependency edge', () => {
    const ruleSet = buildRuleSet();
    // MOD-A -> MOD-B is allowed
    const result = validateImport(ruleSet, 'src/a/index.ts', 'src/b/index.ts');
    expect(result.allowed).toBe(true);
    expect(result.violation).toBeNull();
  });

  it('TEST-020: blocks import with no dependency edge', () => {
    const ruleSet = buildRuleSet();
    // MOD-B -> MOD-A is NOT in edges
    const result = validateImport(ruleSet, 'src/b/index.ts', 'src/a/index.ts');
    expect(result.allowed).toBe(false);
    expect(result.violation!.ruleType).toBe('import_direction');
  });

  it('TEST-020: violation suggestedFix mentions allowed dependencies', () => {
    const ruleSet = buildRuleSet();
    const result = validateImport(ruleSet, 'src/b/index.ts', 'src/a/index.ts');
    expect(result.violation!.suggestedFix).toContain('MOD-C');
  });

  it('throws UNRESOLVABLE_PATH for unknown source path', () => {
    const ruleSet = buildRuleSet();
    expect(() => validateImport(ruleSet, 'src/unknown/file.ts', 'src/b/index.ts')).toThrow(
      /UNRESOLVABLE_PATH/,
    );
  });

  it('throws UNRESOLVABLE_PATH for unknown target path', () => {
    const ruleSet = buildRuleSet();
    expect(() => validateImport(ruleSet, 'src/a/index.ts', 'src/unknown/file.ts')).toThrow(
      /UNRESOLVABLE_PATH/,
    );
  });

  it('allows intra-module imports (same module)', () => {
    const ruleSet = buildRuleSet();
    const result = validateImport(ruleSet, 'src/a/index.ts', 'src/a/helper.ts');
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEST-014, TEST-015: detectCycle
// ---------------------------------------------------------------------------

describe('detectCycle', () => {
  it('TEST-014: detects cycle when adding C->A to A->B->C graph', () => {
    const ruleSet = buildRuleSet();
    // Existing edges: A->B, B->C. Adding C->A would create cycle.
    const result = detectCycle(ruleSet, 'MOD-C', 'MOD-A');
    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath).not.toBeNull();
    expect(result.cyclePath!).toContain('MOD-A');
    expect(result.cyclePath!).toContain('MOD-C');
  });

  it('TEST-015: no cycle for acyclic import A->C (already reachable via A->B->C)', () => {
    const ruleSet = buildRuleSet();
    // Adding A->C is acyclic (C doesn't reach A)
    const result = detectCycle(ruleSet, 'MOD-A', 'MOD-C');
    expect(result.hasCycle).toBe(false);
    expect(result.cyclePath).toBeNull();
  });

  it('no cycle for completely disconnected modules', () => {
    const ruleSet = buildRuleSet({
      dependencyEdges: [],
    });
    const result = detectCycle(ruleSet, 'MOD-A', 'MOD-B');
    expect(result.hasCycle).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TEST-022, TEST-023: checkProfileConflicts
// ---------------------------------------------------------------------------

describe('checkProfileConflicts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  it('TEST-022: returns empty conflicts when profile file does not exist', () => {
    const ruleSet = buildRuleSet();
    const result = checkProfileConflicts(ruleSet, join(tmpDir, 'nonexistent.json'));
    expect(result.conflicts).toHaveLength(0);
    expect(result.skippedRuleIds).toHaveLength(0);
  });

  it('TEST-022: detects conflict when profile prohibits spec-allowed import direction', () => {
    const ruleSet = buildRuleSet();
    const profilePath = join(tmpDir, 'l2-decisions.json');
    writeJson(profilePath, {
      decisions: [
        {
          type: 'prohibit_dependency',
          description: 'import-direction-MOD-A-MOD-B is prohibited by architecture decision',
        },
      ],
    });

    const result = checkProfileConflicts(ruleSet, profilePath);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].ruleId).toBe('import-direction-MOD-A-MOD-B');
    expect(result.conflicts[0].resolution).toBe('pending');
    expect(result.skippedRuleIds).toContain('import-direction-MOD-A-MOD-B');
  });

  it('TEST-023: non-conflicting rules are active when one rule has a conflict', () => {
    const ruleSet = buildRuleSet();
    const profilePath = join(tmpDir, 'l2-decisions.json');
    // Only conflict with one import-direction rule
    writeJson(profilePath, {
      decisions: [
        {
          type: 'prohibit_dependency',
          description: 'import-direction-MOD-A-MOD-B is prohibited',
        },
      ],
    });

    const result = checkProfileConflicts(ruleSet, profilePath);
    // Only 1 skipped, the file_ownership and circular_dep rules are unaffected
    expect(result.skippedRuleIds).toHaveLength(1);
    expect(result.conflicts[0].resolution).toBe('pending');
  });
});
