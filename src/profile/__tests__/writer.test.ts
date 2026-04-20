/**
 * Tests for MOD-002: profile-writer
 * Covers: writeProfileFromArtifacts, extractL0, extractL1, extractL2, extractL3, mergeDomainModel
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { writeProfileFromArtifacts } from '../writer.js';
import { extractL0, extractL1, extractL2, extractL3, mergeDomainModel } from '../extractors.js';
import { readLayer } from '../storage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function setup(files: Record<string, string> = {}): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nopilot-writer-test-'));
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(tmpDir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return tmpDir;
}

function makeDiscover(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phase: 'discover',
    constraints: {
      tech_stack: ['TypeScript', 'React'],
      non_negotiable: ['REST only'],
    },
    design_philosophy: [
      { principle: 'humans decide, machines execute', justification: 'safety', source_artifact: 'discover.json' },
    ],
    domain_model: {
      entities: [{ name: 'User', description: 'A user of the system' }],
      relationships: [],
    },
    ...overrides,
  };
}

function makeSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phase: 'spec',
    modules: [
      {
        id: 'MOD-001',
        name: 'user-service',
        responsibility: 'Handles user authentication',
        dependency_directions: [],
        communication_patterns: ['REST'],
        design_patterns: ['Repository'],
      },
    ],
    dependency_graph: { edges: [{ from: 'MOD-001', to: 'MOD-002', type: 'calls' }] },
    ...overrides,
  };
}

function makeBuildReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phase: 'build',
    test_summary: { total: 42, passed: 42, failed: 0, framework: 'vitest' },
    ...overrides,
  };
}

function makeDecisions(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    decisions: [
      {
        decision: 'Use REST over GraphQL',
        rationale: 'Simpler for our team',
        alternatives: ['GraphQL', 'gRPC'],
        source_artifact: 'decisions.json',
      },
    ],
    ...overrides,
  };
}

function makeSplitDiscoverFiles(baseDir: string, overrides: Record<string, unknown> = {}): void {
  const discover = makeDiscover(overrides);
  const discoverDir = path.join(baseDir, 'discover');
  fs.mkdirSync(discoverDir, { recursive: true });
  fs.writeFileSync(path.join(discoverDir, 'index.json'), JSON.stringify({
    phase: 'discover',
    version: '4.0',
    status: 'approved',
    mode: 'full',
    constraints: discover.constraints,
    selected_direction: { description: 'test direction' },
    design_philosophy: discover.design_philosophy,
    domain_model: discover.domain_model,
    child_files: {
      requirements: 'requirements.json',
      scenarios: 'scenarios.json',
    },
    ui_taste: discover.ui_taste,
  }), 'utf-8');
  fs.writeFileSync(path.join(discoverDir, 'requirements.json'), JSON.stringify({
    requirements: discover.requirements ?? [],
  }), 'utf-8');
  fs.writeFileSync(path.join(discoverDir, 'scenarios.json'), JSON.stringify({
    core_scenarios: discover.core_scenarios ?? [],
  }), 'utf-8');
}

function makeSplitSpecFiles(baseDir: string, overrides: Record<string, unknown> = {}): void {
  const spec = makeSpec(overrides);
  const specDir = path.join(baseDir, 'spec');
  fs.mkdirSync(specDir, { recursive: true });
  const modules = (spec.modules as Record<string, unknown>[]) ?? [];
  const moduleRefs = modules.map((_, idx) => `mod-${String(idx + 1).padStart(3, '0')}.json`);
  const moduleIds = new Set(modules.map((mod) => String(mod.id ?? '')));
  const dependencyGraph = (spec.dependency_graph as { edges?: Array<Record<string, unknown>> }) ?? {};
  const edges = (dependencyGraph.edges ?? []).filter((edge) => {
    const from = String(edge.from ?? '');
    const to = String(edge.to ?? '');
    return moduleIds.has(from) && moduleIds.has(to);
  });
  fs.writeFileSync(path.join(specDir, 'index.json'), JSON.stringify({
    phase: 'spec',
    version: '4.0',
    status: 'approved',
    module_refs: moduleRefs,
    dependency_graph: { edges },
  }), 'utf-8');
  modules.forEach((mod, idx) => {
    fs.writeFileSync(path.join(specDir, `mod-${String(idx + 1).padStart(3, '0')}.json`), JSON.stringify(mod), 'utf-8');
  });
}

function makeSplitBuildFiles(baseDir: string, overrides: Record<string, unknown> = {}): void {
  const build = makeBuildReport(overrides);
  const buildDir = path.join(baseDir, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'index.json'), JSON.stringify({
    phase: 'build',
    version: '4.0',
    execution_plan: { module_order: ['MOD-001'], tracer_bullet_path: 'SCENARIO-001', rationale: 'test' },
    tracer_bullet_result: { status: 'passed' },
    test_summary: build.test_summary,
    acceptance_result: { scenarios_verified: ['SCENARIO-001'], status: 'all_passed', source: 'critic_agent' },
    contract_amendments: [],
    auto_decisions: [],
    unresolved_issues: [],
    modules: ['mod-001.json'],
  }), 'utf-8');
  fs.writeFileSync(path.join(buildDir, 'mod-001.json'), JSON.stringify({
    module_results: [{ module_ref: 'MOD-001', status: 'completed', retry_history: [], auto_decisions: [] }],
  }), 'utf-8');
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// TEST-023: extractL0
// ---------------------------------------------------------------------------

describe('extractL0', () => {
  it('TEST-023: extracts tech stack from discover artifact', () => {
    const discover = makeDiscover();
    const result = extractL0(discover, null);
    expect(result.languages).toContain('TypeScript');
    expect(result.frameworks).toContain('React');
  });

  it('returns empty arrays for missing tech_stack', () => {
    const result = extractL0({ constraints: {} }, null);
    expect(result.languages).toEqual([]);
    expect(result.frameworks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TEST-024: extractL2
// ---------------------------------------------------------------------------

describe('extractL2', () => {
  it('TEST-024: extracts design philosophy and decision rationale', () => {
    const discover = makeDiscover();
    const decisions = makeDecisions();
    const result = extractL2(discover, decisions, null);

    expect(result.design_philosophy).toHaveLength(1);
    expect(result.design_philosophy[0].principle).toBe('humans decide, machines execute');
    expect(result.design_philosophy[0].justification).toBe('safety');
    expect(result.design_philosophy[0].source_artifact).toBe('discover.json');

    expect(result.architecture_decisions).toHaveLength(1);
    expect(result.architecture_decisions[0].decision).toBe('Use REST over GraphQL');
    expect(result.architecture_decisions[0].rationale).toBe('Simpler for our team');
    expect(result.architecture_decisions[0].alternatives).toEqual(['GraphQL', 'gRPC']);
  });

  it('handles missing decisions artifact', () => {
    const discover = makeDiscover();
    const result = extractL2(discover, null, null);
    expect(result.design_philosophy).toHaveLength(1);
    expect(result.architecture_decisions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractL3
// ---------------------------------------------------------------------------

describe('extractL3', () => {
  it('extracts feature history and UI taste metadata when present', () => {
    const discover = makeDiscover({
      ui_taste: {
        designDNA: { colorPalette: { brand: '#123456' } },
        tokensPath: 'specs/mockups/tokens.json',
        mockupsDir: 'specs/mockups/',
        stitchProjectId: 'proj-123',
        tier: 2,
        selectedPages: [{ name: 'home', mockupFile: 'home.html', darkMockupFile: null }],
      },
    });

    const result = extractL3(discover, makeBuildReport(), 'feat-xxx');
    expect(result.recent_features).toEqual(['feat-xxx']);
    expect(result.ui_taste).toEqual({
      designDNA: { colorPalette: { brand: '#123456' } },
      tokensPath: 'specs/mockups/tokens.json',
      mockupsDir: 'specs/mockups/',
      stitchProjectId: 'proj-123',
      tier: 2,
      selectedPages: [{ name: 'home', mockupFile: 'home.html', darkMockupFile: null }],
    });
  });
});

// ---------------------------------------------------------------------------
// TEST-025 / TEST-026: mergeDomainModel
// ---------------------------------------------------------------------------

describe('mergeDomainModel', () => {
  it('TEST-025: adds new entities without removing existing ones', () => {
    const existing = { entities: [{ name: 'User', description: 'A user' }], relationships: [] };
    const incoming = { entities: [{ name: 'Task', description: 'A task' }], relationships: [] };
    const result = mergeDomainModel(existing, incoming);

    expect(result.merged.entities).toHaveLength(2);
    expect(result.added).toEqual(['Task']);
    expect(result.conflicts).toEqual([]);
  });

  it('TEST-026: detects entity name collision and skips incoming', () => {
    const existing = { entities: [{ name: 'User', description: 'original' }], relationships: [] };
    const incoming = { entities: [{ name: 'User', description: 'different' }], relationships: [] };
    const result = mergeDomainModel(existing, incoming);

    expect(result.merged.entities).toHaveLength(1);
    expect((result.merged.entities[0] as Record<string, unknown>).description).toBe('original');
    expect(result.added).toEqual([]);
    expect(result.conflicts).toEqual(['User']);
  });

  it('handles empty existing domain model', () => {
    const existing = { entities: [], relationships: [] };
    const incoming = { entities: [{ name: 'Task', description: 'A task' }], relationships: [] };
    const result = mergeDomainModel(existing, incoming);
    expect(result.added).toEqual(['Task']);
    expect(result.conflicts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TEST-018: writeProfileFromArtifacts — greenfield, L0/L1/L3 only
// ---------------------------------------------------------------------------

describe('writeProfileFromArtifacts', () => {
  it('TEST-018: extracts and writes L0/L1/L3 from greenfield artifacts (l2_enabled defaults true but we use false)', async () => {
    const root = setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
      'specs/discover.json': JSON.stringify(makeDiscover()),
      'specs/spec.json': JSON.stringify(makeSpec()),
      'specs/build_report.json': JSON.stringify(makeBuildReport()),
      'specs/decisions.json': JSON.stringify(makeDecisions()),
    });

    const result = await writeProfileFromArtifacts(root, path.join(root, 'specs'), 'greenfield');

    expect(result.layersWritten).toContain('l0');
    expect(result.layersWritten).toContain('l1');
    expect(result.layersWritten).toContain('l3');
    expect(result.layersWritten).not.toContain('l2');
    expect(result.mergeReport.entitiesAdded).toBeGreaterThanOrEqual(0);
    expect(result.mergeReport.entitiesUpdated).toBe(0);
    expect(result.mergeReport.conflictsSkipped).toBe(0);
  });

  it('TEST-019: includes L2 when l2_enabled is true', async () => {
    const root = setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: true }),
      'specs/discover.json': JSON.stringify(makeDiscover()),
      'specs/spec.json': JSON.stringify(makeSpec()),
      'specs/decisions.json': JSON.stringify(makeDecisions()),
    });

    const result = await writeProfileFromArtifacts(root, path.join(root, 'specs'), 'greenfield');

    expect(result.layersWritten).toContain('l0');
    expect(result.layersWritten).toContain('l1');
    expect(result.layersWritten).toContain('l2');
    expect(result.layersWritten).toContain('l3');
  });

  it('TEST-020: skips L2 when l2_enabled is false', async () => {
    const root = setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
      'specs/discover.json': JSON.stringify(makeDiscover()),
      'specs/spec.json': JSON.stringify(makeSpec()),
    });

    const result = await writeProfileFromArtifacts(root, path.join(root, 'specs'), 'greenfield');

    expect(result.layersWritten).not.toContain('l2');
    const l2Path = path.join(root, '.nopilot', 'profile', 'l2-decisions.json');
    expect(fs.existsSync(l2Path)).toBe(false);
  });

  it('TEST-021: merges incrementally with existing profile (entities added)', async () => {
    const root = setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
    });

    // First write: 1 entity
    const discover1 = makeDiscover({
      domain_model: {
        entities: [
          { name: 'User', description: 'user' },
          { name: 'Post', description: 'post' },
          { name: 'Comment', description: 'comment' },
        ],
        relationships: [],
      },
    });
    fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'specs', 'discover.json'), JSON.stringify(discover1));
    fs.writeFileSync(path.join(root, 'specs', 'spec.json'), JSON.stringify(makeSpec()));

    await writeProfileFromArtifacts(root, path.join(root, 'specs'), 'greenfield');

    // Second write: 2 new entities
    const discover2 = makeDiscover({
      domain_model: {
        entities: [
          { name: 'Tag', description: 'tag' },
          { name: 'Category', description: 'category' },
        ],
        relationships: [],
      },
    });
    fs.writeFileSync(path.join(root, 'specs', 'discover.json'), JSON.stringify(discover2));

    const result2 = await writeProfileFromArtifacts(root, path.join(root, 'specs'), 'greenfield');
    expect(result2.mergeReport.entitiesAdded).toBe(2);

    const l3 = readLayer(root, 'l3');
    const domainModel = (l3.data as Record<string, unknown>).domain_model as { entities: object[] };
    expect(domainModel.entities).toHaveLength(5);
  });

  it('TEST-022: feature mode reads from feature-scoped dir', async () => {
    const root = setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
      'specs/features/feat-xxx/discover.json': JSON.stringify(makeDiscover({
        domain_model: {
          entities: [{ name: 'FeatureEntity', description: 'from feature' }],
          relationships: [],
        },
        ui_taste: {
          designDNA: { colorPalette: { brand: '#123456' } },
          tokensPath: 'specs/mockups/tokens.json',
          mockupsDir: 'specs/mockups/',
          stitchProjectId: null,
          tier: 1,
          selectedPages: [{ name: 'home', mockupFile: 'home.html', darkMockupFile: null }],
        },
      })),
      'specs/features/feat-xxx/spec.json': JSON.stringify(makeSpec()),
    });

    const result = await writeProfileFromArtifacts(
      root,
      path.join(root, 'specs', 'features', 'feat-xxx'),
      'feature'
    );

    expect(result.layersWritten).toContain('l0');
    expect(result.layersWritten).toContain('l3');

    const l3 = readLayer(root, 'l3');
    const data = l3.data as Record<string, unknown>;
    expect(data.recent_features).toEqual(['feat-xxx']);
    expect((data.ui_taste as { designDNA: Record<string, unknown> }).designDNA).toEqual({
      colorPalette: { brand: '#123456' },
    });
  });

  it('merges feature history with existing profile state', async () => {
    const root = setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
      '.nopilot/profile/l3-status.json': JSON.stringify({
        updated_at: new Date().toISOString(),
        test_coverage: { total_tests: 5, framework: 'vitest' },
        domain_model: {
          entities: [{ name: 'ExistingEntity', description: 'already there' }],
          relationships: [],
        },
        tech_debt: [],
        change_hotspots: [],
        recent_features: ['feat-existing'],
        ui_taste: {
          designDNA: { colorPalette: { brand: '#111111' } },
          tokensPath: 'specs/mockups/tokens.json',
          mockupsDir: 'specs/mockups/',
          stitchProjectId: null,
          tier: 1,
          selectedPages: [{ name: 'home', mockupFile: 'home.html', darkMockupFile: null }],
        },
      }),
      'specs/features/feat-new/discover.json': JSON.stringify(makeDiscover({
        domain_model: {
          entities: [{ name: 'FeatureEntity', description: 'from feature' }],
          relationships: [],
        },
      })),
      'specs/features/feat-new/spec.json': JSON.stringify(makeSpec()),
    });

    await writeProfileFromArtifacts(
      root,
      path.join(root, 'specs', 'features', 'feat-new'),
      'feature'
    );

    const l3 = readLayer(root, 'l3');
    const data = l3.data as Record<string, unknown>;
    expect(data.recent_features).toEqual(['feat-existing', 'feat-new']);
    expect((data.ui_taste as { designDNA: Record<string, unknown> }).designDNA).toEqual({
      colorPalette: { brand: '#111111' },
    });
  });

  it('TEST-027: handles missing optional artifacts gracefully', async () => {
    const root = setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
      'specs/discover.json': JSON.stringify(makeDiscover()),
    });

    const result = await writeProfileFromArtifacts(root, path.join(root, 'specs'), 'greenfield');
    // At minimum L0 and L3 from discover.json
    expect(result.layersWritten).toContain('l0');
    expect(result.layersWritten).toContain('l3');
  });

  it('supports split discover/spec/build artifacts in greenfield mode', async () => {
    const root = setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
    });
    const specsDir = path.join(root, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    makeSplitDiscoverFiles(specsDir, {
      requirements: [{ id: 'REQ-001', acceptance_criteria: [] }],
      core_scenarios: [{ id: 'SCENARIO-001', description: 'test', requirement_refs: ['REQ-001'], priority: 'highest' }],
    });
    makeSplitSpecFiles(specsDir);
    makeSplitBuildFiles(specsDir, {
      test_summary: { total: 7, passed: 7, failed: 0, framework: 'vitest' },
    });

    const result = await writeProfileFromArtifacts(root, specsDir, 'greenfield');

    expect(result.layersWritten).toContain('l0');
    expect(result.layersWritten).toContain('l1');
    expect(result.layersWritten).toContain('l3');

    const l3 = readLayer(root, 'l3');
    const data = l3.data as Record<string, unknown>;
    expect((data.test_coverage as { total_tests: number }).total_tests).toBe(7);
    expect((data.test_coverage as { framework: string }).framework).toBe('vitest');
  });

  it('TEST-069: throws ARTIFACT_NOT_FOUND when discover.json missing', async () => {
    const root = setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
    });
    fs.mkdirSync(path.join(root, 'empty-dir'), { recursive: true });

    await expect(
      writeProfileFromArtifacts(root, path.join(root, 'empty-dir'), 'greenfield')
    ).rejects.toThrow('ARTIFACT_NOT_FOUND');
  });

  it('TEST-070: throws EXTRACTION_FAILED when artifact JSON is malformed', async () => {
    const root = setup({
      'specs/discover.json': '{invalid json',
    });

    await expect(
      writeProfileFromArtifacts(root, path.join(root, 'specs'), 'greenfield')
    ).rejects.toThrow('EXTRACTION_FAILED');
  });

  it('TEST-071: throws WRITE_ERROR when profile directory is read-only', async () => {
    const root = setup({
      'specs/discover.json': JSON.stringify(makeDiscover()),
      'specs/spec.json': JSON.stringify(makeSpec()),
    });

    // Create read-only profile directory
    const profileDir = path.join(root, '.nopilot', 'profile');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.chmodSync(profileDir, 0o444);

    try {
      await expect(
        writeProfileFromArtifacts(root, path.join(root, 'specs'), 'greenfield')
      ).rejects.toThrow('WRITE_ERROR');
    } finally {
      fs.chmodSync(profileDir, 0o755);
    }
  });

  it('PROP-003: does not modify any files under specs/', async () => {
    const root = setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
      'specs/discover.json': JSON.stringify(makeDiscover()),
      'specs/spec.json': JSON.stringify(makeSpec()),
    });

    const specsBefore = fs.readdirSync(path.join(root, 'specs')).sort();
    await writeProfileFromArtifacts(root, path.join(root, 'specs'), 'greenfield');
    const specsAfter = fs.readdirSync(path.join(root, 'specs')).sort();

    expect(specsAfter).toEqual(specsBefore);
  });
});
