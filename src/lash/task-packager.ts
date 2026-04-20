/**
 * MOD-004: task_packager — Generate a complete .lash/ task package for a Worker worktree.
 * TypeScript translation of lash/task_packager.py.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { InterfaceEntry, InterfaceMethod, ModuleSpec, PackageResult } from './types.js';

// ---------------------------------------------------------------------------
// Internal shapes (mirrors spec.json / discover.json / tests.json)
// ---------------------------------------------------------------------------

interface SpecInterface {
  type?: string;
  name: string;
  input_schema?: Record<string, string>;
  output_schema?: Record<string, string>;
  errors?: string[];
  api_detail?: unknown;
  requirement_refs?: string[];
  acceptance_criteria_refs?: string[];
}

interface SpecModule {
  id: string;
  name?: string;
  description?: string;
  responsibility?: string;
  source_root?: string;
  owned_files?: string[];
  interfaces?: SpecInterface[];
  data_models?: unknown[];
  state_machine?: unknown;
  nfr_constraints?: unknown;
  requirement_refs?: string[];
  invariant_refs?: string[];
  [key: string]: unknown;
}

interface DependencyEdge {
  from?: string;
  to?: string;
}

interface Spec {
  modules?: SpecModule[];
  dependency_graph?: {
    edges?: DependencyEdge[];
  };
  [key: string]: unknown;
}

interface AcceptanceCriteria {
  id: string;
  type?: string;
  ears: string;
}

interface Requirement {
  id: string;
  acceptance_criteria?: AcceptanceCriteria[];
  [key: string]: unknown;
}

interface Discover {
  requirements?: Requirement[];
  [key: string]: unknown;
}

interface TestCase {
  module_ref?: string;
  [key: string]: unknown;
}

interface Tests {
  example_cases?: TestCase[];
  property_cases?: TestCase[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate all .lash/ package files for the given module in the given worktree.
 *
 * @param moduleId - The MOD-xxx identifier for the module to generate a package for.
 * @param worktreePath - Absolute path to the Worker's worktree directory.
 * @param spec - Parsed spec.json content.
 * @param discover - Parsed discover.json content.
 * @param tests - Parsed tests.json content.
 * @param completedModules - Module IDs already merged to main (their interfaces are 'implemented').
 * @param platform - Target platform: 'claude-code' | 'codex' | 'opencode'.
 *
 * @throws Error with message starting 'module_not_found' if moduleId absent from spec.
 * @throws Error with message starting 'missing_tests' if no test cases reference this moduleId.
 */
export function generatePackage(
  moduleId: string,
  worktreePath: string,
  spec: Spec,
  discover: Discover,
  tests: Tests,
  completedModules: string[],
  platform: string,
): PackageResult {
  // --- Locate the module in spec ---
  const validatedModules = validateOwnedFiles(spec);
  const module = findModule(validatedModules, moduleId);
  const owned = requireOwnedFiles(module);

  // --- Validate tests exist for this module ---
  const moduletests = filterTests(tests, moduleId);
  if (
    (moduletests.example_cases ?? []).length === 0 &&
    (moduletests.property_cases ?? []).length === 0
  ) {
    throw new Error(buildMissingTestsMessage(moduleId));
  }

  // --- Prepare .lash/ directory (only place we write) ---
  const lashDir = path.join(worktreePath, '.lash');
  fs.mkdirSync(lashDir, { recursive: true });

  const filesWritten: string[] = [];

  function write(filename: string, content: string): string {
    const filePath = path.join(lashDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    filesWritten.push(filePath);
    return filePath;
  }

  function writeJson(filename: string, data: unknown): string {
    return write(filename, JSON.stringify(data, null, 2) + '\n');
  }

  // 1. module-spec.json
  const moduleSpec = buildModuleSpec(module);
  writeJson('module-spec.json', moduleSpec);

  // 2. interfaces.json
  const interfaces = buildInterfaces(validatedModules, moduleId, completedModules);
  writeJson('interfaces.json', interfaces);

  // 3. tests.json (subset)
  writeJson('tests.json', moduletests);

  // 4. owned_files.txt
  write('owned_files.txt', owned.join('\n') + '\n');

  // 5. read_only_files.txt
  const readOnly = buildReadOnlyFiles(validatedModules, moduleId);
  write('read_only_files.txt', readOnly.join('\n') + '\n');

  // 6. task.md
  const taskMd = buildTaskMd(module, discover, interfaces, owned, readOnly);
  write('task.md', taskMd);

  // 7. worker-instructions.md (platform-specific)
  const workerInstructions = buildWorkerInstructions(platform);
  write('worker-instructions.md', workerInstructions);

  return { files_written: filesWritten };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateOwnedFiles(spec: Spec): Spec {
  const modules = (spec.modules ?? []).map((module) => {
    const ownedFiles = module.owned_files ?? [];
    if (ownedFiles.length === 0) {
      throw new Error(buildMissingOwnedFilesMessage(module.id));
    }
    return { ...module, owned_files: [...ownedFiles] };
  });

  return { ...spec, modules };
}

function findModule(spec: Spec, moduleId: string): SpecModule {
  for (const mod of spec.modules ?? []) {
    if (mod.id === moduleId) {
      return mod;
    }
  }
  throw new Error(`module_not_found: ${moduleId} not present in spec.json modules`);
}

function filterTests(tests: Tests, moduleId: string): Tests {
  const exampleCases = (tests.example_cases ?? []).filter(
    (c) => c.module_ref === moduleId,
  );
  const propertyCases = (tests.property_cases ?? []).filter(
    (c) => c.module_ref === moduleId,
  );
  return {
    ...tests,
    example_cases: exampleCases,
    property_cases: propertyCases,
  };
}

function requireOwnedFiles(module: SpecModule): string[] {
  const ownedFiles = module.owned_files ?? [];
  if (ownedFiles.length === 0) {
    throw new Error(buildMissingOwnedFilesMessage(module.id));
  }
  return [...ownedFiles];
}

function buildMissingTestsMessage(moduleId: string): string {
  return [
    `missing_tests: no test cases found for ${moduleId}`,
    'Provide a tests artifact via --tests <path> (for example specs/tests.json, specs/tests/, or specs/tests/index.json).',
    'If no tests artifact exists yet, generate it first with commands/build/test-gen.md or /build Step 2.',
  ].join(' ');
}

function buildMissingOwnedFilesMessage(moduleId: string): string {
  return [
    `missing_owned_files: module ${moduleId} has no owned_files declared in the spec artifact.`,
    'Add explicit owned_files entries during /spec generation before running lash package or /lash-build.',
  ].join(' ');
}

function buildModuleSpec(module: SpecModule): ModuleSpec {
  const keys: (keyof SpecModule)[] = [
    'id',
    'name',
    'description',
    'source_root',
    'requirement_refs',
    'owned_files',
    'interfaces',
    'data_models',
    'state_machine',
    'nfr_constraints',
    'invariant_refs',
  ];

  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === 'description') {
      result[key] = module.description ?? module.responsibility ?? '';
    } else if (key in module) {
      result[key] = module[key];
    }
  }
  // Always include module_id explicitly
  result['module_id'] = module.id;
  return result as unknown as ModuleSpec;
}

function buildInterfaces(
  spec: Spec,
  currentModuleId: string,
  completedModules: string[],
): InterfaceEntry[] {
  const entries: InterfaceEntry[] = [];
  const completedSet = new Set(completedModules);

  for (const mod of spec.modules ?? []) {
    const modId = mod.id;
    let status: 'implemented' | 'pending';
    if (modId === currentModuleId) {
      status = 'pending';
    } else if (completedSet.has(modId)) {
      status = 'implemented';
    } else {
      status = 'pending';
    }

    for (const iface of mod.interfaces ?? []) {
      const interfaceId = `${modId}-${iface.name}`;
      const methods = extractMethods(iface);
      const entry: InterfaceEntry = {
        interface_id: interfaceId,
        name: iface.name,
        source_module_id: modId,
        status,
        methods,
      };
      entries.push(entry);
    }
  }

  return entries;
}

function extractMethods(iface: SpecInterface): InterfaceMethod[] {
  const name = iface.name ?? 'unknown';
  const inputSchema = iface.input_schema ?? {};
  const outputSchema = iface.output_schema ?? {};
  const errors = iface.errors ?? [];

  // Build params from input_schema
  const params: Array<{ name: string; type: string }> = [];
  for (const [paramName, paramDesc] of Object.entries(inputSchema)) {
    const parts = String(paramDesc).split(' — ', 2);
    const paramType = parts[0].trim();
    params.push({ name: paramName, type: paramType });
  }

  // Infer return_type from output_schema
  let returnType: string;
  const values = Object.values(outputSchema);
  if (values.length > 0) {
    returnType = String(values[0]);
  } else {
    returnType = 'void';
  }

  const descriptionParts: string[] = [];
  if (iface.requirement_refs && iface.requirement_refs.length > 0) {
    descriptionParts.push('Implements: ' + iface.requirement_refs.join(', '));
  }
  if (errors.length > 0) {
    descriptionParts.push('Errors: ' + errors.join('; '));
  }
  const description = descriptionParts.length > 0 ? descriptionParts.join(' | ') : name;

  return [
    {
      name,
      params,
      return_type: returnType,
      description,
    },
  ];
}

function buildReadOnlyFiles(spec: Spec, currentModuleId: string): string[] {
  // Find dependencies of current module
  const depIds = new Set<string>();
  for (const edge of spec.dependency_graph?.edges ?? []) {
    if (edge.from === currentModuleId && edge.to !== undefined) {
      depIds.add(edge.to);
    }
  }

  const readOnly: string[] = [];
  for (const mod of spec.modules ?? []) {
    if (depIds.has(mod.id)) {
      readOnly.push(...(mod.owned_files ?? []));
    }
  }

  return [...new Set(readOnly)].sort();
}

function buildTaskMd(
  module: SpecModule,
  discover: Discover,
  interfaces: InterfaceEntry[],
  owned: string[],
  readOnly: string[],
): string {
  const moduleId = module.id;
  const name = module.name ?? moduleId;
  const description = module.responsibility ?? module.description ?? '';

  // Acceptance criteria relevant to this module's requirement_refs
  const reqRefs = new Set(module.requirement_refs ?? []);
  const acceptanceCriteriaLines: string[] = [];
  for (const req of discover.requirements ?? []) {
    if (reqRefs.has(req.id)) {
      for (const ac of req.acceptance_criteria ?? []) {
        acceptanceCriteriaLines.push(`- [${ac.id}] ${ac.ears}`);
      }
    }
  }

  const acSection =
    acceptanceCriteriaLines.length > 0
      ? acceptanceCriteriaLines.join('\n')
      : '_No acceptance criteria found._';

  // Interface summary
  const ifaceLines: string[] = [];
  for (const entry of interfaces) {
    const statusMarker = entry.status === 'implemented' ? 'IMPLEMENTED' : 'PENDING';
    ifaceLines.push(`- \`${entry.name}\` (${entry.source_module_id}) [${statusMarker}]`);
  }
  const ifaceSection = ifaceLines.length > 0 ? ifaceLines.join('\n') : '_No interfaces._';

  // Owned/read-only files
  const ownedSection =
    owned.length > 0 ? owned.map((f) => `- ${f}`).join('\n') : '_None_';
  const readonlySection =
    readOnly.length > 0 ? readOnly.map((f) => `- ${f}`).join('\n') : '_None_';

  return `# Task: ${moduleId} — ${name}

## Objective

${description}

## Acceptance Criteria

${acSection}

## File Ownership

### Files You Own (create/modify freely)

${ownedSection}

### Read-Only Files (do not modify)

${readonlySection}

## Interfaces

${ifaceSection}

## TDD Instructions

Follow the red→green→refactor cycle:

1. **Red** — From \`.lash/tests.json\`, write executable test code that fails (tests not yet implemented).
2. **Green** — Write the minimum implementation to make the tests pass.
3. **Refactor** — Clean up code while keeping all tests green.

ONLY create or modify files listed in \`owned_files.txt\`.
NEVER modify files listed in \`read_only_files.txt\`.
When done, ensure all tests pass.
`;
}

function buildWorkerInstructions(platform: string): string {
  const base = `# Worker Instructions

You are a Lash Worker agent. Follow these rules strictly:

1. Read .lash/task.md for your objective
2. Read .lash/tests.json for test specifications
3. Use TDD: write tests first (red), then implementation (green), then refactor
4. ONLY create or modify files listed in .lash/owned_files.txt
5. NEVER modify files listed in .lash/read_only_files.txt
6. When done, ensure all tests pass

`;

  let integration: string;
  if (platform === 'claude-code') {
    integration = `## Platform Integration (Claude Code)

Launch this Worker with:

    claude -p <task> --session-id <uuid> --permission-mode bypassPermissions --append-system-prompt-file .lash/worker-instructions.md
`;
  } else if (platform === 'codex') {
    integration = `## Platform Integration (Codex)

Launch this Worker with:

    codex exec --full-auto -c system_prompt_file=.lash/worker-instructions.md <task>
`;
  } else {
    // opencode — content is prepended to task prompt
    integration = `## Platform Integration (OpenCode)

This file's content is prepended to the task prompt.

Launch this Worker with:

    opencode run <task> --agent coder
`;
  }

  return base + integration;
}
