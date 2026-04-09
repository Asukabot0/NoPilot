/**
 * Tests for MOD-001: plan_generator (TEST-001 through TEST-014)
 * Translated from tests/test_plan_generator.py
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { generatePlan } from '../src/lash/plan-generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data));
}

interface ScenarioEntry {
  id: string;
  description: string;
  requirement_refs: string[];
  priority: string;
}

function makeDiscover(coreScenarios?: ScenarioEntry[]): unknown {
  const scenarios = coreScenarios ?? [
    {
      id: 'SCENARIO-001',
      description: 'Default scenario',
      requirement_refs: ['REQ-001'],
      priority: 'highest',
    },
  ];
  return {
    phase: 'discover',
    version: '3.0',
    status: 'approved',
    requirements: [{ id: 'REQ-001' }, { id: 'REQ-002' }, { id: 'REQ-007' }],
    core_scenarios: scenarios,
  };
}

interface ModuleEntry {
  id: string;
  source_root: string;
  owned_files?: string[];
  depends_on: string[];
  requirement_refs: string[];
}

function makeSpec(modules: ModuleEntry[], dependencyGraph?: unknown): unknown {
  const graph =
    dependencyGraph ??
    Object.fromEntries(modules.map((m) => [m.id, m.depends_on ?? []]));
  return {
    phase: 'spec',
    version: '3.0',
    modules,
    dependency_graph: graph,
  };
}

function writeSplitSpec(rootDir: string, modules: ModuleEntry[]): string {
  const dir = join(rootDir, 'spec');
  mkdirSync(dir, { recursive: true });
  const dependencyGraph = { edges: modules.flatMap((mod) => mod.depends_on.map((dep) => ({ from: mod.id, to: dep }))) };

  writeJson(join(dir, 'index.json'), {
    phase: 'spec',
    version: '3.0',
    status: 'approved',
    module_refs: modules.map((mod, idx) => `mod-${String(idx + 1).padStart(3, '0')}.json`),
    dependency_graph: dependencyGraph,
  });

  modules.forEach((mod, idx) => {
    writeJson(join(dir, `mod-${String(idx + 1).padStart(3, '0')}.json`), {
      id: mod.id,
      source_root: mod.source_root,
      owned_files: mod.owned_files,
      depends_on: mod.depends_on,
      requirement_refs: mod.requirement_refs,
    });
  });

  return dir;
}

function writeSplitDiscover(rootDir: string, scenarios?: ScenarioEntry[]): string {
  const dir = join(rootDir, 'discover');
  mkdirSync(dir, { recursive: true });
  const discover = makeDiscover(scenarios) as Record<string, unknown>;

  writeJson(join(dir, 'index.json'), {
    phase: 'discover',
    version: discover.version,
    status: discover.status,
    mode: 'full',
    constraints: {},
    selected_direction: { description: 'test' },
    design_philosophy: [],
    child_files: {
      requirements: 'requirements.json',
      scenarios: 'scenarios.json',
    },
  });
  writeJson(join(dir, 'requirements.json'), {
    requirements: discover.requirements,
  });
  writeJson(join(dir, 'scenarios.json'), {
    core_scenarios: discover.core_scenarios,
  });

  return dir;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('plan-generator', () => {
  let tmp: string;
  let specPath: string;
  let discoverPath: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'plan-gen-test-'));
    specPath = join(tmp, 'spec.json');
    discoverPath = join(tmp, 'discover.json');
  });

  // TEST-001: 4 modules with deps → correct batches [A,B] then [C,D]
  it('TEST-001: four modules correct batches', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: [] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['b.py'], depends_on: [], requirement_refs: [] },
      { id: 'MOD-C', source_root: 'src/', owned_files: ['c.py'], depends_on: ['MOD-A'], requirement_refs: [] },
      { id: 'MOD-D', source_root: 'src/', owned_files: ['d.py'], depends_on: ['MOD-A', 'MOD-B'], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    const plan = generatePlan(specPath, discoverPath);

    expect(plan).toHaveProperty('batches');
    expect(plan).toHaveProperty('spec_hash');
    expect(plan.batches).toHaveLength(2);

    const batch0Ids = plan.batches[0].modules.map((m) => m.module_id).sort();
    const batch1Ids = plan.batches[1].modules.map((m) => m.module_id).sort();
    expect(batch0Ids).toEqual(['MOD-A', 'MOD-B']);
    expect(batch1Ids).toEqual(['MOD-C', 'MOD-D']);
  });

  // TEST-002: Single module → single batch
  it('TEST-002: single module single batch', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    const plan = generatePlan(specPath, discoverPath);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0].modules[0].module_id).toBe('MOD-A');
  });

  // TEST-003: Two independent non-overlapping modules → same batch
  it('TEST-003: two independent modules same batch', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: [] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['b.py'], depends_on: [], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    const plan = generatePlan(specPath, discoverPath);
    expect(plan.batches).toHaveLength(1);
    const ids = plan.batches[0].modules.map((m) => m.module_id).sort();
    expect(ids).toEqual(['MOD-A', 'MOD-B']);
  });

  // TEST-004: Transitive dep chain A→B→C → 3 batches
  it('TEST-004: transitive dep chain three batches', () => {
    // A depends on B, B depends on C → C first, then B, then A
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: ['MOD-B'], requirement_refs: [] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['b.py'], depends_on: ['MOD-C'], requirement_refs: [] },
      { id: 'MOD-C', source_root: 'src/', owned_files: ['c.py'], depends_on: [], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    const plan = generatePlan(specPath, discoverPath);
    expect(plan.batches).toHaveLength(3);
    expect(plan.batches[0].modules[0].module_id).toBe('MOD-C');
    expect(plan.batches[1].modules[0].module_id).toBe('MOD-B');
    expect(plan.batches[2].modules[0].module_id).toBe('MOD-A');
  });

  // TEST-005: Overlapping owned_files → different batches
  it('TEST-005: overlapping files different batches', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['shared.py', 'a.py'], depends_on: [], requirement_refs: [] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['shared.py', 'b.py'], depends_on: [], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    const plan = generatePlan(specPath, discoverPath);
    // Must be in different batches
    expect(plan.batches).toHaveLength(2);
    const ids0 = plan.batches[0].modules.map((m) => m.module_id);
    const ids1 = plan.batches[1].modules.map((m) => m.module_id);
    // A comes before B alphanumerically
    expect(ids0).toContain('MOD-A');
    expect(ids1).toContain('MOD-B');
  });

  // TEST-006: Direct cycle A↔B → circular_dependency error
  it('TEST-006: direct cycle error', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: ['MOD-B'], requirement_refs: [] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['b.py'], depends_on: ['MOD-A'], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    expect(() => generatePlan(specPath, discoverPath)).toThrow('circular_dependency');
  });

  // TEST-007: Indirect cycle A→B→C→A → error with path
  it('TEST-007: indirect cycle error', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: ['MOD-B'], requirement_refs: [] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['b.py'], depends_on: ['MOD-C'], requirement_refs: [] },
      { id: 'MOD-C', source_root: 'src/', owned_files: ['c.py'], depends_on: ['MOD-A'], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    expect(() => generatePlan(specPath, discoverPath)).toThrow('circular_dependency');
  });

  // TEST-008: Missing owned_files → infer from source_root + warning
  it('TEST-008: missing owned_files infer from source_root', () => {
    const modules = [
      { id: 'MOD-A', source_root: 'src/', depends_on: [], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules as unknown as ModuleEntry[]));
    writeJson(discoverPath, makeDiscover());

    const warnMessages: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.join(' '));
    };

    let plan;
    try {
      plan = generatePlan(specPath, discoverPath);
    } finally {
      console.warn = origWarn;
    }

    expect(warnMessages.some((msg) => msg.includes('MOD-A'))).toBe(true);

    // owned_files should be inferred as source_root + "**"
    const batchModule = plan!.batches[0].modules[0];
    expect(batchModule.owned_files).toEqual(['src/**']);
  });

  // TEST-009: Deterministic output (run twice, compare)
  it('TEST-009: deterministic output', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-C', source_root: 'src/', owned_files: ['c.py'], depends_on: [], requirement_refs: [] },
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: [] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['b.py'], depends_on: [], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    const plan1 = generatePlan(specPath, discoverPath);
    const plan2 = generatePlan(specPath, discoverPath);
    expect(JSON.stringify(plan1, Object.keys(plan1).sort())).toBe(
      JSON.stringify(plan2, Object.keys(plan2).sort()),
    );
  });

  // TEST-010: Tied modules sorted by ID alphanumeric
  it('TEST-010: tied modules sorted alphanumeric', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-003', source_root: 'src/', owned_files: ['c.py'], depends_on: [], requirement_refs: [] },
      { id: 'MOD-001', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: [] },
      { id: 'MOD-002', source_root: 'src/', owned_files: ['b.py'], depends_on: [], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    const plan = generatePlan(specPath, discoverPath);
    expect(plan.batches).toHaveLength(1);
    const ids = plan.batches[0].modules.map((m) => m.module_id);
    expect(ids).toEqual(['MOD-001', 'MOD-002', 'MOD-003']);
  });

  // TEST-011: Invalid dep ref → invalid_dependency_ref error
  it('TEST-011: invalid dep ref error', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: ['MOD-999'], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    expect(() => generatePlan(specPath, discoverPath)).toThrow('invalid_dependency_ref');
    expect(() => generatePlan(specPath, discoverPath)).toThrow('MOD-999');
  });

  // TEST-012: Tracer: multiple highest priority → fewest modules wins
  it('TEST-012: tracer fewest modules wins', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: ['REQ-001'] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['b.py'], depends_on: [], requirement_refs: ['REQ-001'] },
      { id: 'MOD-C', source_root: 'src/', owned_files: ['c.py'], depends_on: [], requirement_refs: ['REQ-002'] },
    ];
    const coreScenarios: ScenarioEntry[] = [
      { id: 'SCENARIO-A', description: 'A', requirement_refs: ['REQ-001', 'REQ-002'], priority: 'highest' },
      { id: 'SCENARIO-B', description: 'B', requirement_refs: ['REQ-002'], priority: 'highest' },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover(coreScenarios));

    const plan = generatePlan(specPath, discoverPath);
    // SCENARIO-B has fewer derived modules (only MOD-C), so it should win
    expect(plan.tracer!.scenario_id).toBe('SCENARIO-B');
  });

  // TEST-013: Tracer: alphanumeric tie-break when module count also ties
  it('TEST-013: tracer alphanumeric tiebreak', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: ['REQ-001'] },
    ];
    // Both scenarios: highest priority, same req refs → same derived module count
    const coreScenarios: ScenarioEntry[] = [
      { id: 'SCENARIO-B', description: 'B', requirement_refs: ['REQ-001'], priority: 'highest' },
      { id: 'SCENARIO-A', description: 'A', requirement_refs: ['REQ-001'], priority: 'highest' },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover(coreScenarios));

    const plan = generatePlan(specPath, discoverPath);
    // SCENARIO-A comes first alphanumerically
    expect(plan.tracer!.scenario_id).toBe('SCENARIO-A');
  });

  // TEST-014: Tracer module set via transitive closure
  it('TEST-014: tracer transitive closure', () => {
    // Scenario refs [REQ-001, REQ-007]
    // MOD-A has REQ-001 (seed), MOD-B has REQ-007 (seed) and depends on MOD-C
    // Tracer set = [MOD-A, MOD-B, MOD-C]
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: ['REQ-001'] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['b.py'], depends_on: ['MOD-C'], requirement_refs: ['REQ-007'] },
      { id: 'MOD-C', source_root: 'src/', owned_files: ['c.py'], depends_on: [], requirement_refs: [] },
    ];
    const coreScenarios: ScenarioEntry[] = [
      { id: 'SCENARIO-001', description: 'Main', requirement_refs: ['REQ-001', 'REQ-007'], priority: 'highest' },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover(coreScenarios));

    const plan = generatePlan(specPath, discoverPath);
    const tracer = plan.tracer!;
    expect(tracer.scenario_id).toBe('SCENARIO-001');
    const tracerIds = [...tracer.module_ids].sort();
    expect(tracerIds).toEqual(['MOD-A', 'MOD-B', 'MOD-C']);
  });

  it('TEST-015: explicit split index paths produce same plan as directory paths', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: ['REQ-001'] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['b.py'], depends_on: ['MOD-A'], requirement_refs: ['REQ-001'] },
    ];
    const specDir = writeSplitSpec(tmp, modules);
    const discoverDir = writeSplitDiscover(tmp);

    const planByDir = generatePlan(specDir, discoverDir);
    const planByIndex = generatePlan(join(specDir, 'index.json'), join(discoverDir, 'index.json'));

    expect(planByIndex).toEqual(planByDir);
  });

  // Additional: verify batch_id format BATCH-NNN
  it('batch_id format BATCH-NNN', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: [] },
      { id: 'MOD-B', source_root: 'src/', owned_files: ['b.py'], depends_on: ['MOD-A'], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    const plan = generatePlan(specPath, discoverPath);
    plan.batches.forEach((batch, i) => {
      const expected = `BATCH-${String(i + 1).padStart(3, '0')}`;
      expect(batch.batch_id).toBe(expected);
    });
  });

  // Additional: spec_hash is SHA-256 hex of spec.json content
  it('spec_hash is SHA-256 hex of spec.json content', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    const specBytes = readFileSync(specPath);
    const expectedHash = createHash('sha256').update(specBytes).digest('hex');

    const plan = generatePlan(specPath, discoverPath);
    expect(plan.spec_hash).toBe(expectedHash);
  });

  // Additional: BatchModule has required fields
  it('batch module has required fields', () => {
    const modules: ModuleEntry[] = [
      { id: 'MOD-A', source_root: 'src/', owned_files: ['a.py'], depends_on: [], requirement_refs: [] },
    ];
    writeJson(specPath, makeSpec(modules));
    writeJson(discoverPath, makeDiscover());

    const plan = generatePlan(specPath, discoverPath);
    const bm = plan.batches[0].modules[0];
    expect(bm).toHaveProperty('module_id');
    expect(bm).toHaveProperty('depends_on');
    expect(bm).toHaveProperty('owned_files');
    expect(bm).toHaveProperty('source_root');
  });
});
