/**
 * Tests for MOD-004: task_packager (TEST-038 through TEST-045)
 * Translated from tests/test_task_packager.py
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generatePackage } from '../src/lash/task-packager.js';

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

interface SpecModule {
  id: string;
  name: string;
  responsibility: string;
  source_root: string;
  owned_files: string[];
  interfaces: unknown[];
  data_models: unknown[];
  state_machine: null;
  nfr_constraints: Record<string, unknown>;
  requirement_refs: string[];
  invariant_refs: string[];
}

function makeSpec(modules?: SpecModule[]): unknown {
  const defaultModules: SpecModule[] = modules ?? [
    {
      id: 'MOD-001',
      name: 'plan_generator',
      responsibility: 'Parse spec deps.',
      source_root: 'lash/',
      owned_files: ['lash/plan_generator.py', 'tests/test_plan_generator.py'],
      interfaces: [
        {
          type: 'internal',
          name: 'generate_plan',
          input_schema: {
            spec_path: 'string — path to spec.json',
            discover_path: 'string — path to discover.json',
          },
          output_schema: { execution_plan: 'ExecutionPlan' },
          errors: ['circular_dependency'],
          api_detail: {
            cli: 'python -m lash plan',
            stdout: 'JSON ExecutionPlan',
            exit_codes: { '0': 'success' },
          },
          requirement_refs: ['REQ-001'],
          acceptance_criteria_refs: ['REQ-001-AC-1'],
        },
      ],
      data_models: [],
      state_machine: null,
      nfr_constraints: {},
      requirement_refs: ['REQ-001'],
      invariant_refs: [],
    },
    {
      id: 'MOD-002',
      name: 'platform_launcher',
      responsibility: 'Spawn Workers.',
      source_root: 'lash/',
      owned_files: ['lash/platform_launcher.py', 'tests/test_platform_launcher.py'],
      interfaces: [
        {
          type: 'internal',
          name: 'spawn_worker',
          input_schema: {
            platform: 'string',
            task: 'string',
          },
          output_schema: { handle: 'WorkerHandle' },
          errors: ['spawn_failed'],
          api_detail: null,
          requirement_refs: ['REQ-002'],
          acceptance_criteria_refs: ['REQ-002-AC-1'],
        },
      ],
      data_models: [],
      state_machine: null,
      nfr_constraints: {},
      requirement_refs: ['REQ-002'],
      invariant_refs: [],
    },
  ];

  return {
    phase: 'spec',
    version: '3.0',
    status: 'approved',
    modules: defaultModules,
    dependency_graph: { edges: [] },
    technologies: [],
  };
}

function makeDiscover(): unknown {
  return {
    phase: 'discover',
    version: '3.0',
    status: 'approved',
    requirements: [
      {
        id: 'REQ-001',
        user_story: 'As a developer I want execution plans.',
        acceptance_criteria: [
          {
            id: 'REQ-001-AC-1',
            type: 'event_driven',
            ears: 'WHEN spec.json received THE SYSTEM SHALL generate execution-plan.json',
          },
        ],
        source: 'user_stated',
      },
    ],
    core_scenarios: [
      {
        id: 'SCENARIO-001',
        description: 'Parallel module build',
        requirement_refs: ['REQ-001'],
        priority: 'highest',
      },
    ],
  };
}

function makeTests(): unknown {
  return {
    phase: 'build',
    artifact: 'tests',
    version: '3.0',
    example_cases: [
      {
        id: 'TEST-001',
        suite_type: 'unit',
        module_ref: 'MOD-001',
        requirement_refs: ['REQ-001'],
        description: 'Generate execution plan from valid spec.json',
        category: 'normal',
        ears_ref: 'REQ-001-AC-1',
        derivation: 'direct_from_ears',
        input: 'spec.json with 4 modules',
        expected_output: 'ExecutionPlan JSON',
        setup: 'Create temp spec.json',
      },
      {
        id: 'TEST-002',
        suite_type: 'unit',
        module_ref: 'MOD-002',
        requirement_refs: ['REQ-002'],
        description: 'Spawn a worker on claude-code',
        category: 'normal',
        ears_ref: 'REQ-002-AC-1',
        derivation: 'direct_from_ears',
        input: 'platform=claude-code, task=hello',
        expected_output: 'WorkerHandle',
        setup: 'Mock subprocess',
      },
      {
        id: 'TEST-003',
        suite_type: 'unit',
        module_ref: 'MOD-001',
        requirement_refs: ['REQ-001'],
        description: 'Another MOD-001 test',
        category: 'boundary',
        ears_ref: 'REQ-001-AC-1',
        derivation: 'ai_supplemented',
        input: 'minimal spec',
        expected_output: 'single batch',
        setup: 'Minimal spec',
      },
    ],
    property_cases: [],
    coverage_summary: {},
    coverage_guards: {},
  };
}

function makeSpecWithoutOwnedFiles(): unknown {
  return {
    phase: 'spec',
    version: '3.0',
    status: 'approved',
    modules: [
      {
        id: 'MOD-001',
        name: 'plan_generator',
        responsibility: 'Parse spec deps.',
        source_root: 'lash/',
        interfaces: [],
        data_models: [],
        state_machine: null,
        nfr_constraints: {},
        requirement_refs: ['REQ-001'],
        invariant_refs: [],
      },
    ],
    dependency_graph: { edges: [] },
    technologies: [],
  };
}

// ---------------------------------------------------------------------------
// TEST-038: Generate all required files in .lash/
// ---------------------------------------------------------------------------

describe('TEST-038: generate all required files', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('TEST-038: all required files created', () => {
    const result = generatePackage(
      'MOD-001',
      tmp,
      makeSpec() as never,
      makeDiscover() as never,
      makeTests() as never,
      [],
      'claude-code',
    );

    const lashDir = path.join(tmp, '.lash');
    const required = [
      'task.md',
      'module-spec.json',
      'interfaces.json',
      'tests.json',
      'owned_files.txt',
      'read_only_files.txt',
      'worker-instructions.md',
    ];

    for (const fname of required) {
      expect(
        fs.existsSync(path.join(lashDir, fname)),
        `Missing file: ${fname}`,
      ).toBe(true);
    }

    expect(result).toHaveProperty('files_written');
    expect(result.files_written).toHaveLength(required.length);
  });
});

// ---------------------------------------------------------------------------
// TEST-039: Interface status implemented vs pending
// ---------------------------------------------------------------------------

describe('TEST-039: interface status implemented vs pending', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('TEST-039: completed module implemented, current pending', () => {
    generatePackage(
      'MOD-002',
      tmp,
      makeSpec() as never,
      makeDiscover() as never,
      makeTests() as never,
      ['MOD-001'],
      'claude-code',
    );

    const interfacesPath = path.join(tmp, '.lash', 'interfaces.json');
    const ifaces = JSON.parse(fs.readFileSync(interfacesPath, 'utf8')) as Array<{
      source_module_id: string;
      status: string;
    }>;

    const statuses: Record<string, string> = {};
    for (const entry of ifaces) {
      statuses[entry.source_module_id] = entry.status;
    }

    expect(statuses['MOD-001']).toBe('implemented');
    expect(statuses['MOD-002']).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// TEST-040: CC worker-instructions.md integration
// ---------------------------------------------------------------------------

describe('TEST-040: claude-code worker instructions', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('TEST-040: cc integration reference', () => {
    generatePackage(
      'MOD-001',
      tmp,
      makeSpec() as never,
      makeDiscover() as never,
      makeTests() as never,
      [],
      'claude-code',
    );

    const content = fs.readFileSync(
      path.join(tmp, '.lash', 'worker-instructions.md'),
      'utf8',
    );
    expect(content).toContain('--append-system-prompt-file');
  });
});

// ---------------------------------------------------------------------------
// TEST-041: Codex worker-instructions.md integration
// ---------------------------------------------------------------------------

describe('TEST-041: codex worker instructions', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('TEST-041: codex integration reference', () => {
    generatePackage(
      'MOD-001',
      tmp,
      makeSpec() as never,
      makeDiscover() as never,
      makeTests() as never,
      [],
      'codex',
    );

    const content = fs.readFileSync(
      path.join(tmp, '.lash', 'worker-instructions.md'),
      'utf8',
    );
    expect(content).toContain('system_prompt_file');
    expect(content).toContain('codex exec --full-auto -c system_prompt_file=.lash/worker-instructions.md <task>');
  });
});

// ---------------------------------------------------------------------------
// TEST-042: tests.json subset matches only module_ref
// ---------------------------------------------------------------------------

describe('TEST-042: tests.json subset', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('TEST-042: subset only current module', () => {
    generatePackage(
      'MOD-001',
      tmp,
      makeSpec() as never,
      makeDiscover() as never,
      makeTests() as never,
      [],
      'claude-code',
    );

    const subset = JSON.parse(
      fs.readFileSync(path.join(tmp, '.lash', 'tests.json'), 'utf8'),
    ) as { example_cases: Array<{ module_ref: string; id: string }> };

    for (const c of subset.example_cases) {
      expect(c.module_ref, `Unexpected module_ref in ${c.id}`).toBe('MOD-001');
    }

    // Should contain exactly 2 MOD-001 entries from makeTests()
    expect(subset.example_cases).toHaveLength(2);
  });

  it('TEST-042: verbatim copy — all fields preserved', () => {
    const fullTests = makeTests() as {
      example_cases: Array<{ module_ref: string }>;
    };

    generatePackage(
      'MOD-001',
      tmp,
      makeSpec() as never,
      makeDiscover() as never,
      fullTests as never,
      [],
      'claude-code',
    );

    const subset = JSON.parse(
      fs.readFileSync(path.join(tmp, '.lash', 'tests.json'), 'utf8'),
    ) as { example_cases: unknown[] };

    const mod1Originals = fullTests.example_cases.filter(
      (c) => c.module_ref === 'MOD-001',
    );
    expect(subset.example_cases).toEqual(mod1Originals);
  });
});

// ---------------------------------------------------------------------------
// TEST-043: interfaces.json correct schema
// ---------------------------------------------------------------------------

describe('TEST-043: interfaces.json schema', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('TEST-043: interface schema correct', () => {
    generatePackage(
      'MOD-001',
      tmp,
      makeSpec() as never,
      makeDiscover() as never,
      makeTests() as never,
      [],
      'claude-code',
    );

    const ifaces = JSON.parse(
      fs.readFileSync(path.join(tmp, '.lash', 'interfaces.json'), 'utf8'),
    ) as Array<{
      interface_id: string;
      name: string;
      source_module_id: string;
      status: string;
      methods: Array<{
        name: string;
        params: Array<{ name: string; type: string }>;
        return_type: string;
        description: string;
      }>;
    }>;

    expect(Array.isArray(ifaces)).toBe(true);
    expect(ifaces.length).toBeGreaterThan(0);

    const requiredTop = new Set(['interface_id', 'name', 'source_module_id', 'status', 'methods']);
    for (const entry of ifaces) {
      for (const key of requiredTop) {
        expect(entry).toHaveProperty(key);
      }
      expect(Array.isArray(entry.methods)).toBe(true);
      for (const method of entry.methods) {
        expect(method).toHaveProperty('name');
        expect(method).toHaveProperty('params');
        expect(method).toHaveProperty('return_type');
        expect(method).toHaveProperty('description');
        for (const param of method.params) {
          expect(param).toHaveProperty('name');
          expect(param).toHaveProperty('type');
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TEST-044: task.md contains TDD instruction
// ---------------------------------------------------------------------------

describe('TEST-044: task.md TDD instructions', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('TEST-044: task.md has TDD instruction', () => {
    generatePackage(
      'MOD-001',
      tmp,
      makeSpec() as never,
      makeDiscover() as never,
      makeTests() as never,
      [],
      'claude-code',
    );

    const content = fs.readFileSync(path.join(tmp, '.lash', 'task.md'), 'utf8');
    expect(content).toContain('TDD');
    expect(content.toLowerCase()).toContain('red');
    expect(content.toLowerCase()).toContain('green');
    expect(content.toLowerCase()).toContain('refactor');
  });
});

// ---------------------------------------------------------------------------
// TEST-045: No files created outside .lash/
// ---------------------------------------------------------------------------

describe('TEST-045: no files outside .lash/', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function collectFiles(root: string): string[] {
    const files: string[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('TEST-045: no files created outside .lash/', () => {
    const before = new Set(collectFiles(tmp));

    generatePackage(
      'MOD-001',
      tmp,
      makeSpec() as never,
      makeDiscover() as never,
      makeTests() as never,
      [],
      'claude-code',
    );

    const after = new Set(collectFiles(tmp));
    const lashDir = path.join(tmp, '.lash') + path.sep;

    for (const fpath of after) {
      if (!before.has(fpath)) {
        expect(fpath, `File created outside .lash/: ${fpath}`).toMatch(
          new RegExp('^' + lashDir.replace(/[/\\]/g, '[/\\\\]')),
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('Error cases', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('module_not_found error', () => {
    expect(() =>
      generatePackage(
        'MOD-999',
        tmp,
        makeSpec() as never,
        makeDiscover() as never,
        makeTests() as never,
        [],
        'claude-code',
      ),
    ).toThrow('module_not_found');
  });

  it('missing_tests error', () => {
    const emptyTests = {
      phase: 'build',
      artifact: 'tests',
      version: '3.0',
      example_cases: [],
      property_cases: [],
    };

    expect(() =>
      generatePackage(
        'MOD-001',
        tmp,
        makeSpec() as never,
        makeDiscover() as never,
        emptyTests as never,
        [],
        'claude-code',
      ),
    ).toThrow('missing_tests');
  });

  it('missing_tests error includes recovery guidance', () => {
    const emptyTests = {
      phase: 'build',
      artifact: 'tests',
      version: '3.0',
      example_cases: [],
      property_cases: [],
    };

    let thrown: Error | null = null;
    try {
      generatePackage(
        'MOD-001',
        tmp,
        makeSpec() as never,
        makeDiscover() as never,
        emptyTests as never,
        [],
        'claude-code',
      );
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.message).toContain('--tests <path>');
    expect(thrown?.message).toContain('test-gen');
  });

  it('missing_owned_files error when module omits ownership boundaries', () => {
    let thrown: Error | null = null;
    try {
      generatePackage(
        'MOD-001',
        tmp,
        makeSpecWithoutOwnedFiles() as never,
        makeDiscover() as never,
        makeTests() as never,
        [],
        'claude-code',
      );
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.message).toContain('missing_owned_files');
    expect(thrown?.message).toContain('MOD-001');
    expect(thrown?.message).toContain('owned_files');
  });

  it('missing_owned_files error when another module in spec omits ownership boundaries', () => {
    const specWithUnownedDependency = {
      phase: 'spec',
      version: '3.0',
      status: 'approved',
      modules: [
        {
          id: 'MOD-001',
          name: 'plan_generator',
          responsibility: 'Parse spec deps.',
          source_root: 'lash/',
          owned_files: ['lash/plan_generator.py'],
          depends_on: ['MOD-002'],
          interfaces: [],
          data_models: [],
          state_machine: null,
          nfr_constraints: {},
          requirement_refs: ['REQ-001'],
          invariant_refs: [],
        },
        {
          id: 'MOD-002',
          name: 'platform_launcher',
          responsibility: 'Spawn Workers.',
          source_root: 'lash/',
          interfaces: [],
          data_models: [],
          state_machine: null,
          nfr_constraints: {},
          requirement_refs: ['REQ-002'],
          invariant_refs: [],
        },
      ],
      dependency_graph: { edges: [{ from: 'MOD-001', to: 'MOD-002' }] },
      technologies: [],
    };

    let thrown: Error | null = null;
    try {
      generatePackage(
        'MOD-001',
        tmp,
        specWithUnownedDependency as never,
        makeDiscover() as never,
        makeTests() as never,
        [],
        'claude-code',
      );
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.message).toContain('missing_owned_files');
    expect(thrown?.message).toContain('MOD-002');
  });
});

// ---------------------------------------------------------------------------
// OpenCode platform
// ---------------------------------------------------------------------------

describe('opencode platform', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-pkg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('opencode instructions written', () => {
    generatePackage(
      'MOD-001',
      tmp,
      makeSpec() as never,
      makeDiscover() as never,
      makeTests() as never,
      [],
      'opencode',
    );

    const filePath = path.join(tmp, '.lash', 'worker-instructions.md');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('owned_files.txt');
  });
});
