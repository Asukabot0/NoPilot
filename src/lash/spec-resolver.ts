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
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

// ---------------------------------------------------------------------------
// detectFormat
// ---------------------------------------------------------------------------

/**
 * Detect whether the input path is a single JSON file or a split directory.
 * @throws Error with PATH_NOT_FOUND or INDEX_MISSING
 */
export function detectFormat(inputPath: string): 'single_file' | 'split_directory' {
  const abs = resolve(inputPath);

  if (!existsSync(abs)) {
    throw new Error(`[PATH_NOT_FOUND] Path does not exist (path: ${abs})`);
  }

  const stat = statSync(abs);

  if (stat.isFile()) {
    return 'single_file';
  }

  if (stat.isDirectory()) {
    const indexPath = join(abs, 'index.json');
    if (!existsSync(indexPath)) {
      throw new Error(`[INDEX_MISSING] Directory does not contain index.json (path: ${abs})`);
    }
    return 'split_directory';
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
  const format = detectFormat(specPath);

  if (format === 'single_file') {
    return loadSingleSpec(specPath);
  }

  return loadSplitSpec(specPath);
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
  const format = detectFormat(discoverPath);

  if (format === 'single_file') {
    const abs = resolve(discoverPath);
    const text = readFileSync(abs, 'utf8');
    const discover: Discover = parseJson(text, abs);
    return { discover };
  }

  return loadSplitDiscover(discoverPath);
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
// Shared helper
// ---------------------------------------------------------------------------

function parseJson<T>(text: string, sourcePath: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`[INVALID_JSON] Failed to parse JSON (path: ${sourcePath})`);
  }
}
