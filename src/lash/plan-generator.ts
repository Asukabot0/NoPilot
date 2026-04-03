/**
 * MOD-001: plan_generator (TypeScript translation)
 *
 * Parse spec.json dependency graph, detect cycles and invalid references,
 * validate file ownership boundaries, topologically sort modules into
 * parallelizable batches with deterministic ordering (ties broken by
 * module ID alphanumeric sort), select tracer bullet scenario and derive
 * tracer module set via transitive dependency closure.
 *
 * Pure algorithm module — NO subprocess calls, NO I/O beyond JSON parse/stringify.
 * All functions are synchronous.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { ExecutionPlan, PlanBatch, PlanModuleNode, TracerConfig } from './types.js';

// ---------------------------------------------------------------------------
// Internal shapes (mirrors spec.json module entries)
// ---------------------------------------------------------------------------

interface SpecModule {
  id: string;
  source_root?: string;
  owned_files?: string[];
  depends_on?: string[];
  requirement_refs?: string[];
  [key: string]: unknown;
}

interface DiscoverScenario {
  id: string;
  description?: string;
  priority?: string;
  requirement_refs?: string[];
}

interface Discover {
  core_scenarios?: DiscoverScenario[];
  [key: string]: unknown;
}

interface Spec {
  modules?: SpecModule[];
  dependency_graph?: Record<string, unknown> | { edges?: EdgeEntry[] };
  [key: string]: unknown;
}

interface EdgeEntry {
  from?: string;
  to?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read spec.json and discover.json, return an ExecutionPlan.
 *
 * Throws Error on:
 *   - circular_dependency
 *   - invalid_dependency_ref
 */
export function generatePlan(specPath: string, discoverPath: string): ExecutionPlan {
  const specBytes = readFileSync(specPath);
  const specHash = createHash('sha256').update(specBytes).digest('hex');
  const spec: Spec = JSON.parse(specBytes.toString('utf8'));

  const discoverText = readFileSync(discoverPath, 'utf8');
  const discover: Discover = JSON.parse(discoverText);

  let modules: SpecModule[] = spec.modules ?? [];
  const moduleIds = new Set(modules.map((m) => m.id));

  // --- Build adjacency map from dependency_graph.edges ---
  const deps: Record<string, string[]> = Object.fromEntries(modules.map((m) => [m.id, []]));
  const depGraph = spec.dependency_graph ?? {};

  const edges: EdgeEntry[] = (depGraph as { edges?: EdgeEntry[] }).edges ?? [];
  // Also support legacy format where dependency_graph is a flat dict {id: [deps]}
  const isLegacyFormat =
    edges.length === 0 &&
    Object.values(depGraph).some((v) => Array.isArray(v));

  if (isLegacyFormat) {
    for (const [mid, depList] of Object.entries(depGraph)) {
      if (Array.isArray(depList)) {
        deps[mid] = [...depList];
      }
    }
  } else {
    for (const edge of edges) {
      const src = edge.from ?? '';
      const dst = edge.to ?? '';
      if (src in deps) {
        deps[src].push(dst);
      }
    }
  }

  // Also support per-module depends_on field as fallback
  for (const m of modules) {
    if (m.depends_on && m.depends_on.length > 0) {
      if (!(m.id in deps)) {
        deps[m.id] = [];
      }
      for (const d of m.depends_on) {
        if (!deps[m.id].includes(d)) {
          deps[m.id].push(d);
        }
      }
    }
  }

  // --- Validate dependency references ---
  const invalidRefs = collectInvalidRefs(deps, moduleIds);
  if (invalidRefs.size > 0) {
    throw new Error(`invalid_dependency_ref: ${JSON.stringify([...invalidRefs].sort())}`);
  }

  // --- Detect cycles ---
  detectCycles(deps);

  // --- Infer owned_files for modules that lack them ---
  modules = inferOwnedFiles(modules);

  // --- Topological sort into batches ---
  const batches = buildBatches(modules, deps);

  // --- Tracer config ---
  const tracer = buildTracer(discover, modules, deps);

  return {
    spec_hash: specHash,
    tracer,
    batches,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function collectInvalidRefs(
  deps: Record<string, string[]>,
  moduleIds: Set<string>,
): Set<string> {
  const invalid = new Set<string>();
  for (const depList of Object.values(deps)) {
    for (const dep of depList) {
      if (!moduleIds.has(dep)) {
        invalid.add(dep);
      }
    }
  }
  return invalid;
}

function detectCycles(deps: Record<string, string[]>): void {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color: Record<string, number> = Object.fromEntries(
    Object.keys(deps).map((n) => [n, WHITE]),
  );
  const parent: Record<string, string | null> = Object.fromEntries(
    Object.keys(deps).map((n) => [n, null]),
  );

  function dfs(node: string): void {
    color[node] = GRAY;
    const neighbours = [...(deps[node] ?? [])].sort();
    for (const neighbour of neighbours) {
      if (color[neighbour] === GRAY) {
        const cycle = reconstructCycle(parent, node, neighbour);
        throw new Error(`circular_dependency: ${JSON.stringify(cycle)}`);
      }
      if (color[neighbour] === WHITE) {
        parent[neighbour] = node;
        dfs(neighbour);
      }
    }
    color[node] = BLACK;
  }

  for (const node of Object.keys(deps).sort()) {
    if (color[node] === WHITE) {
      dfs(node);
    }
  }
}

function reconstructCycle(
  parent: Record<string, string | null>,
  start: string,
  cycleNode: string,
): string[] {
  const path: string[] = [start];
  let cur = start;
  while (cur !== cycleNode) {
    const next = parent[cur];
    if (next === null || next === undefined) break;
    cur = next;
    path.push(cur);
  }
  path.reverse();
  path.push(cycleNode);
  return path;
}

// ---------------------------------------------------------------------------
// Owned files inference
// ---------------------------------------------------------------------------

function inferOwnedFiles(modules: SpecModule[]): SpecModule[] {
  return modules.map((mod) => {
    if (!mod.owned_files || mod.owned_files.length === 0) {
      const sourceRoot = mod.source_root ?? '';
      const inferred = sourceRoot + '**';
      console.warn(
        `Module ${mod.id} has no owned_files; ` +
        `treating as owning all files under ${JSON.stringify(sourceRoot)} -> ${JSON.stringify(inferred)}`,
      );
      return { ...mod, owned_files: [inferred] };
    }
    return { ...mod };
  });
}

// ---------------------------------------------------------------------------
// Batch building (Kahn's algorithm level-by-level)
// ---------------------------------------------------------------------------

/**
 * Group modules into sequential batches.
 *
 * Two modules may share a batch only when:
 *   1. Neither has a transitive dependency on the other.
 *   2. Their owned_files sets do not overlap.
 *
 * Deterministic ordering: modules sorted by ID alphanumerically within a batch.
 */
function buildBatches(modules: SpecModule[], deps: Record<string, string[]>): PlanBatch[] {
  const modLookup = Object.fromEntries(modules.map((m) => [m.id, m]));

  const remaining = new Set(modules.map((m) => m.id));
  const batches: PlanBatch[] = [];
  let batchNum = 1;

  while (remaining.size > 0) {
    // Candidates: modules with all dependencies satisfied (in prior batches)
    const placed = new Set(
      modules.map((m) => m.id).filter((mid) => !remaining.has(mid)),
    );
    const candidates = [...remaining]
      .filter((mid) => (deps[mid] ?? []).every((d) => placed.has(d)))
      .sort();

    if (candidates.length === 0) {
      // Should not happen after cycle detection, but guard anyway
      throw new Error(
        `circular_dependency: cannot resolve remaining modules ${JSON.stringify([...remaining].sort())}`,
      );
    }

    // Greedily assign to current batch, respecting file-overlap constraint
    const batchModules: string[] = [];
    const batchFiles = new Set<string>();

    for (const mid of candidates) {
      const owned = new Set<string>(modLookup[mid].owned_files ?? []);
      const hasOverlap = [...owned].some((f) => batchFiles.has(f));
      if (!hasOverlap) {
        batchModules.push(mid);
        for (const f of owned) {
          batchFiles.add(f);
        }
      }
    }

    // Sort within batch for determinism
    batchModules.sort();

    const batchEntry: PlanBatch = {
      batch_id: `BATCH-${String(batchNum).padStart(3, '0')}`,
      modules: batchModules.map((mid): PlanModuleNode => ({
        module_id: mid,
        depends_on: [...(deps[mid] ?? [])],
        owned_files: [...(modLookup[mid].owned_files ?? [])],
        source_root: modLookup[mid].source_root ?? '',
      })),
    };

    batches.push(batchEntry);
    for (const mid of batchModules) {
      remaining.delete(mid);
    }
    batchNum++;
  }

  return batches;
}

function computeTransitiveDeps(
  deps: Record<string, string[]>,
): Record<string, Set<string>> {
  const memo = new Map<string, Set<string>>();

  function get(mid: string): Set<string> {
    if (memo.has(mid)) return memo.get(mid)!;
    const result = new Set<string>();
    for (const d of deps[mid] ?? []) {
      result.add(d);
      for (const td of get(d)) {
        result.add(td);
      }
    }
    memo.set(mid, result);
    return result;
  }

  for (const mid of Object.keys(deps)) {
    get(mid);
  }

  return Object.fromEntries(memo.entries());
}

// ---------------------------------------------------------------------------
// Tracer config
// ---------------------------------------------------------------------------

function buildTracer(
  discover: Discover,
  modules: SpecModule[],
  deps: Record<string, string[]>,
): TracerConfig | null {
  const coreScenarios = discover.core_scenarios ?? [];
  if (coreScenarios.length === 0) return null;

  const priorityOrder: Record<string, number> = { highest: 0, high: 1, medium: 2, low: 3 };

  const getPrio = (s: DiscoverScenario): number =>
    priorityOrder[s.priority ?? 'low'] ?? 3;

  const minPrio = Math.min(...coreScenarios.map(getPrio));
  const topScenarios = coreScenarios.filter((s) => getPrio(s) === minPrio);

  if (topScenarios.length === 0) return null;

  function derivedCount(scenario: DiscoverScenario): [number, string] {
    const scenarioReqs = new Set(scenario.requirement_refs ?? []);
    const seedIds = new Set(
      modules
        .filter((m) => (m.requirement_refs ?? []).some((r) => scenarioReqs.has(r)))
        .map((m) => m.id),
    );
    const closure = transitiveClosure(seedIds, deps);
    return [closure.size, scenario.id];
  }

  // Sort: fewest derived modules first, then alphanumeric scenario_id
  const scored = [...topScenarios].sort((a, b) => {
    const [countA, idA] = derivedCount(a);
    const [countB, idB] = derivedCount(b);
    if (countA !== countB) return countA - countB;
    return idA.localeCompare(idB);
  });

  const selected = scored[0];

  const scenarioReqs = new Set(selected.requirement_refs ?? []);
  const seedIds = new Set(
    modules
      .filter((m) => (m.requirement_refs ?? []).some((r) => scenarioReqs.has(r)))
      .map((m) => m.id),
  );
  const tracerIds = [...transitiveClosure(seedIds, deps)].sort();

  // Build a single tracer batch respecting internal deps among tracer modules
  const tracerIdSet = new Set(tracerIds);
  const tracerModLookup = Object.fromEntries(
    modules.filter((m) => tracerIdSet.has(m.id)).map((m) => [m.id, m]),
  );
  const tracerDeps = Object.fromEntries(
    tracerIds.map((mid) => [
      mid,
      (deps[mid] ?? []).filter((d) => tracerIdSet.has(d)),
    ]),
  );

  // Order tracer modules topologically (within the tracer set)
  const ordered = topoSort(tracerIds, tracerDeps);

  const tracerBatch: PlanBatch = {
    batch_id: 'BATCH-TRACER',
    modules: ordered.map((mid): PlanModuleNode => ({
      module_id: mid,
      depends_on: [...(deps[mid] ?? [])],
      owned_files: [...(tracerModLookup[mid].owned_files ?? [])],
      source_root: tracerModLookup[mid].source_root ?? '',
    })),
  };

  return {
    scenario_id: selected.id,
    module_ids: tracerIds,
    batch: tracerBatch,
  };
}

function transitiveClosure(
  seedIds: Set<string>,
  deps: Record<string, string[]>,
): Set<string> {
  const visited = new Set<string>();
  const stack = [...seedIds];
  while (stack.length > 0) {
    const mid = stack.pop()!;
    if (visited.has(mid)) continue;
    visited.add(mid);
    for (const d of deps[mid] ?? []) {
      if (!visited.has(d)) {
        stack.push(d);
      }
    }
  }
  return visited;
}

function topoSort(moduleIds: string[], deps: Record<string, string[]>): string[] {
  const inDegree: Record<string, number> = Object.fromEntries(
    moduleIds.map((mid) => [mid, (deps[mid] ?? []).length]),
  );
  const rdeps: Record<string, string[]> = Object.fromEntries(
    moduleIds.map((mid) => [mid, []]),
  );
  for (const mid of moduleIds) {
    for (const d of deps[mid] ?? []) {
      if (d in rdeps) {
        rdeps[d].push(mid);
      }
    }
  }

  const queue: string[] = moduleIds.filter((mid) => inDegree[mid] === 0).sort();
  const result: string[] = [];

  while (queue.length > 0) {
    const mid = queue.shift()!;
    result.push(mid);
    for (const dependent of [...(rdeps[mid] ?? [])].sort()) {
      inDegree[dependent]--;
      if (inDegree[dependent] === 0) {
        // Insert in sorted order
        const insertIdx = queue.findIndex((q) => q > dependent);
        if (insertIdx === -1) {
          queue.push(dependent);
        } else {
          queue.splice(insertIdx, 0, dependent);
        }
      }
    }
  }

  return result;
}

// Re-export for consumers who want the transitive deps map
export { computeTransitiveDeps };
