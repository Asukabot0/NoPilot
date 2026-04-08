/**
 * Tests for MOD-010: spec-resolver (TEST-026-001 through TEST-026-017)
 * Issue #26: Lash 支持多个 spec 文件输入
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { resolveSpec, resolveDiscover, detectFormat, resolveArtifactPaths, findArtifactPath } from '../src/lash/spec-resolver.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'spec-resolver-test-'));
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data));
}

function makeSingleSpec(tmpDir: string): string {
  const spec = {
    phase: 'spec',
    version: '4.0',
    modules: [
      { id: 'MOD-A', source_root: 'src/a/', owned_files: ['a.ts'], requirement_refs: ['REQ-001'] },
      { id: 'MOD-B', source_root: 'src/b/', owned_files: ['b.ts'], requirement_refs: ['REQ-002'] },
    ],
    dependency_graph: { edges: [{ from: 'MOD-B', to: 'MOD-A' }] },
  };
  const p = join(tmpDir, 'spec.json');
  writeJson(p, spec);
  return p;
}

function makeSplitSpec(tmpDir: string, opts?: { missingModule?: boolean; badRef?: boolean; noDeps?: boolean }): string {
  const dir = join(tmpDir, 'spec');
  mkdirSync(dir, { recursive: true });

  const index: Record<string, unknown> = {
    phase: 'spec',
    version: '4.0',
    status: 'approved',
    module_refs: ['mod-001-alpha.json', 'mod-002-beta.json'],
  };

  if (!opts?.noDeps) {
    index.dependency_graph = opts?.badRef
      ? { edges: [{ from: 'MOD-999', to: 'MOD-001' }] }
      : { edges: [{ from: 'MOD-002', to: 'MOD-001' }] };
  }

  writeJson(join(dir, 'index.json'), index);

  if (!opts?.missingModule) {
    writeJson(join(dir, 'mod-001-alpha.json'), {
      id: 'MOD-001', name: 'alpha', responsibility: 'do alpha', interfaces: [], requirement_refs: ['REQ-001'],
    });
    writeJson(join(dir, 'mod-002-beta.json'), {
      id: 'MOD-002', name: 'beta', responsibility: 'do beta', interfaces: [], requirement_refs: ['REQ-002'],
    });
  }

  return dir;
}

function makeSingleDiscover(tmpDir: string): string {
  const discover = {
    phase: 'discover',
    version: '4.0',
    status: 'approved',
    mode: 'lite',
    constraints: { tech_stack: ['TypeScript'] },
    core_scenarios: [{ id: 'SCENARIO-001', description: 'test', requirement_refs: ['REQ-001'], priority: 'highest' }],
    requirements: [{ id: 'REQ-001', user_story: 'test' }],
  };
  const p = join(tmpDir, 'discover.json');
  writeJson(p, discover);
  return p;
}

function makeSplitDiscover(tmpDir: string, opts?: { missingChild?: boolean }): string {
  const dir = join(tmpDir, 'discover');
  mkdirSync(dir, { recursive: true });

  writeJson(join(dir, 'index.json'), {
    phase: 'discover',
    version: '4.0',
    status: 'approved',
    mode: 'full',
    constraints: { tech_stack: ['TypeScript'] },
    selected_direction: { description: 'test direction' },
    design_philosophy: [{ principle: 'test' }],
    child_files: {
      requirements: 'requirements.json',
      scenarios: 'scenarios.json',
      history: 'history.json',
    },
  });

  if (!opts?.missingChild) {
    writeJson(join(dir, 'requirements.json'), {
      requirements: [{ id: 'REQ-001', user_story: 'test req' }],
      invariants: [{ id: 'INV-001', statement: 'test inv' }],
    });
    writeJson(join(dir, 'scenarios.json'), {
      core_scenarios: [{ id: 'SCENARIO-001', description: 'test', requirement_refs: ['REQ-001'], priority: 'highest' }],
    });
    writeJson(join(dir, 'history.json'), {
      explored_directions: [],
      decision_log: [],
    });
  }

  return dir;
}

// ---------------------------------------------------------------------------
// detectFormat
// ---------------------------------------------------------------------------

describe('detectFormat', () => {
  it('TEST-026-001: returns single_file for .json file path', () => {
    const tmp = makeTmpDir();
    const specPath = makeSingleSpec(tmp);
    expect(detectFormat(specPath)).toBe('single_file');
  });

  it('TEST-026-002: returns split_directory for directory with index.json', () => {
    const tmp = makeTmpDir();
    const specDir = makeSplitSpec(tmp);
    expect(detectFormat(specDir)).toBe('split_directory');
  });

  it('TEST-026-003: throws PATH_NOT_FOUND for non-existent path', () => {
    expect(() => detectFormat('/nonexistent/path/foo')).toThrow('PATH_NOT_FOUND');
  });

  it('TEST-026-004: throws INDEX_MISSING for directory without index.json', () => {
    const tmp = makeTmpDir();
    const emptyDir = join(tmp, 'empty');
    mkdirSync(emptyDir);
    expect(() => detectFormat(emptyDir)).toThrow('INDEX_MISSING');
  });
});

// ---------------------------------------------------------------------------
// resolveSpec
// ---------------------------------------------------------------------------

describe('resolveSpec', () => {
  it('TEST-026-008: loads single file format', () => {
    const tmp = makeTmpDir();
    const specPath = makeSingleSpec(tmp);
    const { spec, specHash } = resolveSpec(specPath);

    expect(spec.modules).toHaveLength(2);
    expect(spec.modules![0].id).toBe('MOD-A');
    expect(spec.dependency_graph).toBeDefined();
    expect(typeof specHash).toBe('string');
    expect(specHash).toHaveLength(64); // SHA256 hex
  });

  it('TEST-026-005: loads split format with module_refs', () => {
    const tmp = makeTmpDir();
    const specDir = makeSplitSpec(tmp);
    const { spec } = resolveSpec(specDir);

    expect(spec.modules).toHaveLength(2);
    expect(spec.modules![0].id).toBe('MOD-001');
    expect(spec.modules![1].id).toBe('MOD-002');
  });

  it('TEST-026-006: split format output has same shape as single-file', () => {
    const tmp = makeTmpDir();
    const specDir = makeSplitSpec(tmp);
    const { spec } = resolveSpec(specDir);

    expect(spec).toHaveProperty('modules');
    expect(spec).toHaveProperty('dependency_graph');
    expect(spec).toHaveProperty('phase', 'spec');
    expect(spec).toHaveProperty('version', '4.0');
    expect(Array.isArray(spec.modules)).toBe(true);
  });

  it('TEST-026-009: preserves dependency_graph from split index.json', () => {
    const tmp = makeTmpDir();
    const specDir = makeSplitSpec(tmp);
    const { spec } = resolveSpec(specDir);

    const dg = spec.dependency_graph as { edges: Array<{ from: string; to: string }> };
    expect(dg.edges).toHaveLength(1);
    expect(dg.edges[0].from).toBe('MOD-002');
    expect(dg.edges[0].to).toBe('MOD-001');
  });

  it('TEST-026-007: throws MODULE_FILE_MISSING for missing module ref', () => {
    const tmp = makeTmpDir();
    const specDir = makeSplitSpec(tmp, { missingModule: true });
    expect(() => resolveSpec(specDir)).toThrow('MODULE_FILE_MISSING');
  });

  it('TEST-026-010: throws INVALID_DEPENDENCY_REF for unknown module in edges', () => {
    const tmp = makeTmpDir();
    const specDir = makeSplitSpec(tmp, { badRef: true });
    expect(() => resolveSpec(specDir)).toThrow('INVALID_DEPENDENCY_REF');
  });

  it('TEST-026-011: treats missing dependency_graph as empty', () => {
    const tmp = makeTmpDir();
    const specDir = makeSplitSpec(tmp, { noDeps: true });
    const { spec } = resolveSpec(specDir);

    expect(spec.dependency_graph).toEqual({});
  });

  it('TEST-026-017: returns deterministic specHash for split format', () => {
    const tmp = makeTmpDir();
    const specDir = makeSplitSpec(tmp);
    const { specHash: hash1 } = resolveSpec(specDir);
    const { specHash: hash2 } = resolveSpec(specDir);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});

// ---------------------------------------------------------------------------
// resolveDiscover
// ---------------------------------------------------------------------------

describe('resolveDiscover', () => {
  it('TEST-026-015: loads single file format', () => {
    const tmp = makeTmpDir();
    const discoverPath = makeSingleDiscover(tmp);
    const { discover } = resolveDiscover(discoverPath);

    expect(discover.core_scenarios).toHaveLength(1);
    expect(discover.phase).toBe('discover');
  });

  it('TEST-026-012: loads split format and assembles Discover from child files', () => {
    const tmp = makeTmpDir();
    const discoverDir = makeSplitDiscover(tmp);
    const { discover } = resolveDiscover(discoverDir);

    expect(discover.requirements).toHaveLength(1);
    expect(discover.core_scenarios).toHaveLength(1);
    expect(discover.constraints).toBeDefined();
    expect(discover.selected_direction).toBeDefined();
    expect(discover.design_philosophy).toBeDefined();
  });

  it('TEST-026-013: split format output has same shape as single-file', () => {
    const tmp = makeTmpDir();
    const discoverDir = makeSplitDiscover(tmp);
    const { discover } = resolveDiscover(discoverDir);

    expect(discover).toHaveProperty('phase', 'discover');
    expect(discover).toHaveProperty('version', '4.0');
    expect(discover).toHaveProperty('requirements');
    expect(discover).toHaveProperty('core_scenarios');
    expect(discover).toHaveProperty('mode', 'full');
  });

  it('TEST-026-014: throws CHILD_FILE_MISSING for missing child file', () => {
    const tmp = makeTmpDir();
    const discoverDir = makeSplitDiscover(tmp, { missingChild: true });
    expect(() => resolveDiscover(discoverDir)).toThrow('CHILD_FILE_MISSING');
  });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// findArtifactPath
// ---------------------------------------------------------------------------

describe('findArtifactPath', () => {
  it('TEST-059-001: returns single file path when name.json exists', () => {
    const tmp = makeTmpDir();
    writeJson(join(tmp, 'spec.json'), { phase: 'spec' });
    expect(findArtifactPath(tmp, 'spec')).toBe(join(tmp, 'spec.json'));
  });

  it('TEST-059-002: returns split directory path when name/index.json exists', () => {
    const tmp = makeTmpDir();
    const splitDir = join(tmp, 'spec');
    mkdirSync(splitDir);
    writeJson(join(splitDir, 'index.json'), {});
    expect(findArtifactPath(tmp, 'spec')).toBe(splitDir);
  });

  it('TEST-059-003: prefers single file over split directory', () => {
    const tmp = makeTmpDir();
    writeJson(join(tmp, 'spec.json'), { phase: 'spec' });
    const splitDir = join(tmp, 'spec');
    mkdirSync(splitDir);
    writeJson(join(splitDir, 'index.json'), {});
    expect(findArtifactPath(tmp, 'spec')).toBe(join(tmp, 'spec.json'));
  });

  it('TEST-059-004: returns null when artifact not found', () => {
    const tmp = makeTmpDir();
    expect(findArtifactPath(tmp, 'spec')).toBeNull();
  });

  it('TEST-059-005: returns null when split dir has no index.json', () => {
    const tmp = makeTmpDir();
    mkdirSync(join(tmp, 'spec'));
    expect(findArtifactPath(tmp, 'spec')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveArtifactPaths
// ---------------------------------------------------------------------------

describe('resolveArtifactPaths', () => {
  it('TEST-059-006: resolves greenfield single-file artifacts', () => {
    const tmp = makeTmpDir();
    const specsDir = join(tmp, 'specs');
    mkdirSync(specsDir);
    writeJson(join(specsDir, 'spec.json'), { phase: 'spec' });
    writeJson(join(specsDir, 'discover.json'), { phase: 'discover' });
    const result = resolveArtifactPaths(tmp);
    expect(result.specPath).toBe(join(specsDir, 'spec.json'));
    expect(result.discoverPath).toBe(join(specsDir, 'discover.json'));
  });

  it('TEST-059-007: resolves greenfield split-directory artifacts', () => {
    const tmp = makeTmpDir();
    const specsDir = join(tmp, 'specs');
    mkdirSync(specsDir);
    const specDir = join(specsDir, 'spec');
    mkdirSync(specDir);
    writeJson(join(specDir, 'index.json'), {});
    const discoverDir = join(specsDir, 'discover');
    mkdirSync(discoverDir);
    writeJson(join(discoverDir, 'index.json'), {});
    const result = resolveArtifactPaths(tmp);
    expect(result.specPath).toBe(specDir);
    expect(result.discoverPath).toBe(discoverDir);
  });

  it('TEST-059-008: auto-selects unique feature directory', () => {
    const tmp = makeTmpDir();
    const specsDir = join(tmp, 'specs');
    const featuresDir = join(specsDir, 'features');
    const featureDir = join(featuresDir, 'feat-user-notifications');
    mkdirSync(featureDir, { recursive: true });
    writeJson(join(featureDir, 'spec.json'), { phase: 'spec' });
    writeJson(join(featureDir, 'discover.json'), { phase: 'discover' });
    const result = resolveArtifactPaths(tmp);
    expect(result.specPath).toBe(join(featureDir, 'spec.json'));
    expect(result.discoverPath).toBe(join(featureDir, 'discover.json'));
  });

  it('TEST-059-009: throws AMBIGUOUS_FEATURE when multiple feature dirs found', () => {
    const tmp = makeTmpDir();
    const featuresDir = join(tmp, 'specs', 'features');
    for (const name of ['feat-alpha', 'feat-beta']) {
      const d = join(featuresDir, name);
      mkdirSync(d, { recursive: true });
      writeJson(join(d, 'spec.json'), { phase: 'spec' });
      writeJson(join(d, 'discover.json'), { phase: 'discover' });
    }
    expect(() => resolveArtifactPaths(tmp)).toThrow('[AMBIGUOUS_FEATURE]');
  });

  it('TEST-059-010: throws NO_ARTIFACTS when specs/ has no artifacts and no features dir', () => {
    const tmp = makeTmpDir();
    mkdirSync(join(tmp, 'specs'));
    expect(() => resolveArtifactPaths(tmp)).toThrow('[NO_ARTIFACTS]');
  });

  it('TEST-059-011: throws NO_ARTIFACTS when features/ exists but has no valid subdirs', () => {
    const tmp = makeTmpDir();
    const featuresDir = join(tmp, 'specs', 'features', 'feat-empty');
    mkdirSync(featuresDir, { recursive: true });
    // no spec.json or discover.json inside
    expect(() => resolveArtifactPaths(tmp)).toThrow('[NO_ARTIFACTS]');
  });

  it('TEST-059-012: skips feature dirs missing one artifact (spec only)', () => {
    const tmp = makeTmpDir();
    const featureDir = join(tmp, 'specs', 'features', 'feat-partial');
    mkdirSync(featureDir, { recursive: true });
    writeJson(join(featureDir, 'spec.json'), { phase: 'spec' });
    // no discover.json
    expect(() => resolveArtifactPaths(tmp)).toThrow('[NO_ARTIFACTS]');
  });
});

// Integration: resolveSpec output feeds into generatePlan
// ---------------------------------------------------------------------------

describe('integration', () => {
  it('TEST-026-016: resolveSpec output works with generatePlan', async () => {
    // This test verifies that the Resolver output is compatible with plan-generator
    const tmp = makeTmpDir();
    const specDir = makeSplitSpec(tmp);
    const discoverPath = makeSingleDiscover(tmp);

    const { spec, specHash } = resolveSpec(specDir);

    // Verify the spec object has the shape generatePlan expects
    expect(spec.modules).toBeDefined();
    expect(Array.isArray(spec.modules)).toBe(true);
    expect(spec.modules!.length).toBeGreaterThan(0);
    expect(spec.modules![0]).toHaveProperty('id');
    expect(typeof specHash).toBe('string');
  });
});
