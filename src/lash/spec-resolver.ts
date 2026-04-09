/**
 * MOD-010: spec-resolver
 *
 * Unified loader for spec and discover artifacts. Auto-detects input format
 * (single JSON file vs split directory with index.json) and returns
 * type-compatible objects for downstream consumers.
 *
 * Issue #26: Lash 支持多个 spec 文件输入
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { cwd as processCwd } from 'node:process';

// ---------------------------------------------------------------------------
// Internal types (mirrors plan-generator.ts shapes for compatibility)
// ---------------------------------------------------------------------------

interface SpecModule {
  id: string;
  [key: string]: unknown;
}

interface EdgeEntry {
  from?: string;
  to?: string;
  [key: string]: unknown;
}

interface Spec {
  phase?: string;
  version?: string;
  modules?: SpecModule[];
  dependency_graph?: Record<string, unknown>;
  [key: string]: unknown;
}

interface Discover {
  phase?: string;
  version?: string;
  core_scenarios?: Array<Record<string, unknown>>;
  requirements?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface TestsArtifact {
  phase?: string;
  artifact?: string;
  example_cases?: Array<Record<string, unknown>>;
  property_cases?: Array<Record<string, unknown>>;
  coverage_summary?: Record<string, unknown>;
  coverage_guards?: Record<string, unknown>;
  [key: string]: unknown;
}

interface BuildReportArtifact {
  phase?: string;
  execution_plan?: Record<string, unknown>;
  tracer_bullet_result?: Record<string, unknown>;
  test_summary?: Record<string, unknown>;
  acceptance_result?: Record<string, unknown>;
  contract_amendments?: Array<Record<string, unknown>>;
  auto_decisions?: Array<Record<string, unknown>>;
  unresolved_issues?: unknown[];
  module_results?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

type ArtifactFormat = 'single_file' | 'split_directory';

interface ResolvedArtifactInput {
  format: ArtifactFormat;
  normalizedPath: string;
}

// ---------------------------------------------------------------------------
// detectFormat
// ---------------------------------------------------------------------------

/**
 * Detect whether the input path is a single JSON file or a split directory.
 * @throws Error with PATH_NOT_FOUND or INDEX_MISSING
 */
export function detectFormat(inputPath: string): 'single_file' | 'split_directory' {
  return resolveArtifactInput(inputPath).format;
}

function resolveArtifactInput(inputPath: string): ResolvedArtifactInput {
  const abs = resolve(inputPath);

  if (!existsSync(abs)) {
    throw new Error(`[PATH_NOT_FOUND] Path does not exist (path: ${abs})`);
  }

  const stat = statSync(abs);

  if (stat.isFile()) {
    if (basename(abs) === 'index.json') {
      const dirPath = dirname(abs);
      return { format: 'split_directory', normalizedPath: dirPath };
    }
    return { format: 'single_file', normalizedPath: abs };
  }

  if (stat.isDirectory()) {
    const indexPath = join(abs, 'index.json');
    if (!existsSync(indexPath)) {
      throw new Error(`[INDEX_MISSING] Directory does not contain index.json (path: ${abs})`);
    }
    return { format: 'split_directory', normalizedPath: abs };
  }

  throw new Error(`[PATH_NOT_FOUND] Path is neither a file nor directory (path: ${abs})`);
}

// ---------------------------------------------------------------------------
// resolveSpec
// ---------------------------------------------------------------------------

/**
 * Load a spec artifact from a single file or split directory.
 * Returns { spec, specHash } where specHash is SHA256 of the loaded content.
 * @throws Error with PATH_NOT_FOUND, INDEX_MISSING, MODULE_FILE_MISSING, INVALID_JSON, INVALID_DEPENDENCY_REF
 */
export function resolveSpec(specPath: string): { spec: Spec; specHash: string } {
  const { format, normalizedPath } = resolveArtifactInput(specPath);

  if (format === 'single_file') {
    return loadSingleSpec(normalizedPath);
  }

  return loadSplitSpec(normalizedPath);
}

function loadSingleSpec(filePath: string): { spec: Spec; specHash: string } {
  const abs = resolve(filePath);
  const bytes = readFileSync(abs);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const spec: Spec = parseJson(bytes.toString('utf8'), abs);
  return { spec, specHash: hash };
}

function loadSplitSpec(dirPath: string): { spec: Spec; specHash: string } {
  const abs = resolve(dirPath);
  const indexPath = join(abs, 'index.json');
  const indexBytes = readFileSync(indexPath);
  const index = parseJson(indexBytes.toString('utf8'), indexPath) as Record<string, unknown>;

  const moduleRefs = (index.module_refs ?? []) as string[];
  const modules: SpecModule[] = [];
  const moduleEntries: { ref: string; bytes: Buffer; mod: SpecModule }[] = [];

  for (const ref of moduleRefs) {
    const modPath = join(abs, ref);
    if (!existsSync(modPath)) {
      throw new Error(`[MODULE_FILE_MISSING] Referenced module file not found (path: ${modPath})`);
    }
    const modBytes = readFileSync(modPath);
    const mod: SpecModule = parseJson(modBytes.toString('utf8'), modPath);
    moduleEntries.push({ ref, bytes: modBytes, mod });
  }

  // Sort by filename for deterministic hash regardless of module_refs order
  const sortedEntries = [...moduleEntries].sort((a, b) => a.ref.localeCompare(b.ref));
  const hashParts: Buffer[] = [indexBytes, ...sortedEntries.map((e) => e.bytes)];
  for (const entry of moduleEntries) {
    modules.push(entry.mod);
  }

  // Validate dependency_graph references
  const depGraph = (index.dependency_graph ?? {}) as Record<string, unknown>;
  const moduleIds = new Set(modules.map((m) => m.id));
  const edges = ((depGraph as { edges?: EdgeEntry[] }).edges ?? []);

  for (const edge of edges) {
    const from = edge.from ?? '';
    const to = edge.to ?? '';
    if (from && !moduleIds.has(from)) {
      throw new Error(`[INVALID_DEPENDENCY_REF] dependency_graph references unknown module '${from}' (path: ${indexPath})`);
    }
    if (to && !moduleIds.has(to)) {
      throw new Error(`[INVALID_DEPENDENCY_REF] dependency_graph references unknown module '${to}' (path: ${indexPath})`);
    }
  }

  // Compute hash from all file contents
  const combinedHash = createHash('sha256');
  for (const part of hashParts) {
    combinedHash.update(part);
  }

  // Assemble Spec: top-level fields from index + modules from loaded files
  // Ensure dependency_graph is always at least {} for consistency with single-file behavior
  const spec: Spec = { ...index, modules, dependency_graph: depGraph, module_refs: undefined };
  // Remove module_refs from assembled spec (it's a routing field, not a Spec field)
  delete spec.module_refs;

  return { spec, specHash: combinedHash.digest('hex') };
}

// ---------------------------------------------------------------------------
// resolveDiscover
// ---------------------------------------------------------------------------

/**
 * Load a discover artifact from a single file or split directory.
 * @throws Error with PATH_NOT_FOUND, INDEX_MISSING, CHILD_FILE_MISSING, INVALID_JSON
 */
export function resolveDiscover(discoverPath: string): { discover: Discover } {
  const { format, normalizedPath } = resolveArtifactInput(discoverPath);

  if (format === 'single_file') {
    const text = readFileSync(normalizedPath, 'utf8');
    const discover: Discover = parseJson(text, normalizedPath);
    return { discover };
  }

  return loadSplitDiscover(normalizedPath);
}

function loadSplitDiscover(dirPath: string): { discover: Discover } {
  const abs = resolve(dirPath);
  const indexPath = join(abs, 'index.json');
  const indexText = readFileSync(indexPath, 'utf8');
  const index = parseJson(indexText, indexPath) as Record<string, unknown>;

  const childFiles = (index.child_files ?? {}) as Record<string, string>;
  const merged: Record<string, unknown> = { ...index };
  delete merged.child_files;

  for (const [_key, filename] of Object.entries(childFiles)) {
    const childPath = join(abs, filename);
    if (!existsSync(childPath)) {
      throw new Error(`[CHILD_FILE_MISSING] Referenced child file not found (path: ${childPath})`);
    }
    const childText = readFileSync(childPath, 'utf8');
    const childData = parseJson(childText, childPath) as Record<string, unknown>;
    // Merge child file fields into the top-level discover object
    Object.assign(merged, childData);
  }

  return { discover: merged as Discover };
}

// ---------------------------------------------------------------------------
// resolveTests
// ---------------------------------------------------------------------------

/**
 * Load a tests artifact from a single file or split directory.
 * @throws Error with PATH_NOT_FOUND, INDEX_MISSING, CHILD_FILE_MISSING, INVALID_JSON
 */
export function resolveTests(testsPath: string): { tests: TestsArtifact } {
  const { format, normalizedPath } = resolveArtifactInput(testsPath);

  if (format === 'single_file') {
    const text = readFileSync(normalizedPath, 'utf8');
    const tests: TestsArtifact = parseJson(text, normalizedPath);
    return { tests };
  }

  return loadSplitTests(normalizedPath);
}

function loadSplitTests(dirPath: string): { tests: TestsArtifact } {
  const abs = resolve(dirPath);
  const indexPath = join(abs, 'index.json');
  const indexText = readFileSync(indexPath, 'utf8');
  const index = parseJson(indexText, indexPath) as Record<string, unknown>;

  const moduleFiles = (index.modules ?? []) as string[];
  const merged: TestsArtifact = {
    ...index,
    example_cases: [],
    property_cases: [],
  };

  delete merged.modules;

  for (const filename of moduleFiles) {
    const childPath = join(abs, filename);
    if (!existsSync(childPath)) {
      throw new Error(`[CHILD_FILE_MISSING] Referenced child file not found (path: ${childPath})`);
    }
    const childText = readFileSync(childPath, 'utf8');
    const childData = parseJson(childText, childPath) as Record<string, unknown>;
    merged.example_cases!.push(...extractObjectArray(childData.example_cases));
    merged.property_cases!.push(...extractObjectArray(childData.property_cases));
  }

  return { tests: merged };
}

// ---------------------------------------------------------------------------
// resolveBuildReport
// ---------------------------------------------------------------------------

/**
 * Load a build report artifact from a single file or split directory.
 * @throws Error with PATH_NOT_FOUND, INDEX_MISSING, CHILD_FILE_MISSING, INVALID_JSON
 */
export function resolveBuildReport(buildPath: string): { buildReport: BuildReportArtifact } {
  const { format, normalizedPath } = resolveArtifactInput(buildPath);

  if (format === 'single_file') {
    const text = readFileSync(normalizedPath, 'utf8');
    const buildReport: BuildReportArtifact = parseJson(text, normalizedPath);
    return { buildReport };
  }

  return loadSplitBuildReport(normalizedPath);
}

function loadSplitBuildReport(dirPath: string): { buildReport: BuildReportArtifact } {
  const abs = resolve(dirPath);
  const indexPath = join(abs, 'index.json');
  const indexText = readFileSync(indexPath, 'utf8');
  const index = parseJson(indexText, indexPath) as Record<string, unknown>;

  const moduleFiles = (index.modules ?? []) as string[];
  const merged: BuildReportArtifact = {
    ...index,
    module_results: [],
  };

  delete merged.modules;

  for (const filename of moduleFiles) {
    const childPath = join(abs, filename);
    if (!existsSync(childPath)) {
      throw new Error(`[CHILD_FILE_MISSING] Referenced child file not found (path: ${childPath})`);
    }
    const childText = readFileSync(childPath, 'utf8');
    const childData = parseJson(childText, childPath) as Record<string, unknown>;
    merged.module_results!.push(...extractObjectArray(childData.module_results));
  }

  return { buildReport: merged };
}

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

function parseJson<T>(text: string, sourcePath: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`[INVALID_JSON] Failed to parse JSON (path: ${sourcePath})`);
  }
}

function extractObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  );
}

// ---------------------------------------------------------------------------
// resolveArtifactPaths
// ---------------------------------------------------------------------------

/**
 * Find a spec or discover artifact in a directory.
 * Checks for `{name}.json` (single file) then `{name}/index.json` (split directory).
 * Returns the path to use with resolveSpec/resolveDiscover, or null if not found.
 */
export function findArtifactPath(dir: string, name: string): string | null {
  const singleFile = join(dir, `${name}.json`);
  if (existsSync(singleFile) && statSync(singleFile).isFile()) {
    return singleFile;
  }
  const splitDir = join(dir, name);
  if (existsSync(splitDir) && statSync(splitDir).isDirectory()) {
    if (existsSync(join(splitDir, 'index.json'))) {
      return splitDir;
    }
  }
  return null;
}

/**
 * Auto-detect spec and discover artifact paths from the project root.
 *
 * Search order:
 * 1. Greenfield: `specs/spec.json` or `specs/spec/index.json`
 *    + `specs/discover.json` or `specs/discover/index.json`
 * 2. Feature mode: scan `specs/features/` for subdirectories containing both artifacts.
 *    - Exactly one match → auto-select
 *    - Multiple matches → throw [AMBIGUOUS_FEATURE] with directory list
 *    - Zero matches → throw [NO_ARTIFACTS]
 *
 * @throws Error with [NO_ARTIFACTS] or [AMBIGUOUS_FEATURE] error codes
 */
export function resolveArtifactPaths(projectRoot: string = processCwd()): {
  specPath: string;
  discoverPath: string;
} {
  const specsRoot = join(projectRoot, 'specs');

  // 1. Greenfield: check specs/ root
  const greenfieldSpec = findArtifactPath(specsRoot, 'spec');
  const greenfieldDiscover = findArtifactPath(specsRoot, 'discover');
  if (greenfieldSpec !== null && greenfieldDiscover !== null) {
    return { specPath: greenfieldSpec, discoverPath: greenfieldDiscover };
  }

  // 2. Feature mode: scan specs/features/
  const featuresRoot = join(specsRoot, 'features');
  if (!existsSync(featuresRoot) || !statSync(featuresRoot).isDirectory()) {
    throw new Error(
      '[NO_ARTIFACTS] No spec/discover artifacts found in specs/ and specs/features/ does not exist',
    );
  }

  interface FeatureMatch {
    name: string;
    specPath: string;
    discoverPath: string;
  }

  const matches: FeatureMatch[] = readdirSync(featuresRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const featureDir = join(featuresRoot, entry.name);
      const s = findArtifactPath(featureDir, 'spec');
      const d = findArtifactPath(featureDir, 'discover');
      if (s !== null && d !== null) {
        return [{ name: entry.name, specPath: s, discoverPath: d }];
      }
      return [];
    });

  if (matches.length === 0) {
    throw new Error(
      '[NO_ARTIFACTS] No spec/discover artifacts found in specs/ or specs/features/',
    );
  }

  if (matches.length > 1) {
    const names = matches.map((m) => m.name).join(', ');
    throw new Error(
      `[AMBIGUOUS_FEATURE] Multiple feature directories found: ${names}. Specify paths explicitly.`,
    );
  }

  return { specPath: matches[0].specPath, discoverPath: matches[0].discoverPath };
}
