/**
 * MOD-001: constraint/rule-engine
 *
 * Parses spec.json via spec-resolver and extracts per-module ConstraintRuleSets.
 * Provides file-ownership validation, import-direction validation,
 * circular dependency detection, and profile conflict checking.
 */
import { existsSync, readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { resolveSpec } from '../lash/spec-resolver.js';
import type {
  ConstraintRule,
  ConstraintRuleSet,
  ConstraintViolation,
  ProfileConflict,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal spec shape helpers
// ---------------------------------------------------------------------------

interface SpecModuleEntry {
  id: string;
  owned_files?: string[];
  [key: string]: unknown;
}

interface SpecEdge {
  from?: string;
  to?: string;
}

interface SpecShape {
  modules?: SpecModuleEntry[];
  dependency_graph?: { edges?: SpecEdge[] };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Path normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a file path to forward-slash relative form.
 * Resolves ../ sequences relative to cwd, then converts to posix.
 */
function normalizePath(filePath: string): string {
  // Replace backslashes, then resolve ../ traversal
  const withForwardSlashes = filePath.replace(/\\/g, '/');
  // Use posix.normalize to clean up ../ and ./
  const normalized = posix.normalize(withForwardSlashes);
  // Remove leading slash if present (ensure relative)
  return normalized.startsWith('/') ? normalized.slice(1) : normalized;
}

/**
 * Check whether a file path matches an owned_files entry.
 * owned_files entries can be exact paths or glob-style with ** wildcards.
 */
function matchesOwnedFile(filePath: string, ownedPattern: string): boolean {
  const normalFile = normalizePath(filePath);
  const normalPattern = normalizePath(ownedPattern);

  if (normalPattern === normalFile) return true;

  // Simple glob: pattern ends with /** — match any file under that directory
  if (normalPattern.endsWith('/**')) {
    const prefix = normalPattern.slice(0, -3);
    return normalFile === prefix || normalFile.startsWith(prefix + '/');
  }

  // Pattern ends with /* — match direct children only
  if (normalPattern.endsWith('/*')) {
    const prefix = normalPattern.slice(0, -2);
    const rest = normalFile.slice(prefix.length + 1);
    return normalFile.startsWith(prefix + '/') && !rest.includes('/');
  }

  // Treat as directory prefix if pattern has no extension and no glob
  if (!normalPattern.includes('*') && !normalPattern.includes('.')) {
    return normalFile.startsWith(normalPattern + '/');
  }

  return false;
}

// ---------------------------------------------------------------------------
// extractRules
// ---------------------------------------------------------------------------

/**
 * Parse spec.json via spec-resolver and build a ConstraintRuleSet for moduleId.
 *
 * @throws Error with SPEC_NOT_FOUND, SPEC_MALFORMED, MODULE_NOT_FOUND
 */
export function extractRules(specPath: string, moduleId: string): ConstraintRuleSet {
  // spec-resolver throws PATH_NOT_FOUND if path doesn't exist
  let spec: SpecShape;
  try {
    const resolved = resolveSpec(specPath);
    spec = resolved.spec as SpecShape;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('PATH_NOT_FOUND') || msg.includes('INDEX_MISSING')) {
      throw new Error(`[SPEC_NOT_FOUND] ${msg}`);
    }
    if (msg.includes('INVALID_JSON')) {
      throw new Error(`[SPEC_MALFORMED] ${msg}`);
    }
    throw new Error(`[SPEC_MALFORMED] Failed to load spec: ${msg}`);
  }

  // Validate spec structure
  if (!Array.isArray(spec.modules) || spec.modules.length === 0) {
    throw new Error('[SPEC_MALFORMED] spec.json missing required "modules" array');
  }

  // Find target module
  const targetModule = spec.modules.find((m) => m.id === moduleId);
  if (!targetModule) {
    throw new Error(`[MODULE_NOT_FOUND] Module "${moduleId}" not found in spec.modules[]`);
  }

  const ownedFiles: string[] = (targetModule.owned_files ?? []).map(normalizePath);

  // Build allModules list
  const allModules = spec.modules.map((m) => ({
    id: m.id,
    ownedFiles: (m.owned_files ?? []).map(normalizePath),
  }));

  // Build dependency edges
  const edges = spec.dependency_graph?.edges ?? [];
  const dependencyEdges = edges
    .filter((e) => typeof e.from === 'string' && typeof e.to === 'string')
    .map((e) => ({ from: e.from as string, to: e.to as string }));

  // Build allowedDependencies: modules reachable from moduleId via dependency edges
  const allowedDependencies = dependencyEdges
    .filter((e) => e.from === moduleId)
    .map((e) => {
      const depModule = spec.modules!.find((m) => m.id === e.to);
      return {
        moduleId: e.to,
        ownedFiles: (depModule?.owned_files ?? []).map(normalizePath),
      };
    });

  // Build rules
  const rules: ConstraintRule[] = [];

  // Rule: file_ownership
  rules.push({
    id: `file-ownership-${moduleId}`,
    type: 'file_ownership',
    moduleId,
    description: `Files written during this session must belong to module ${moduleId}'s owned_files set`,
  });

  // Rules: import_direction for each dependency edge from this module
  for (const dep of allowedDependencies) {
    rules.push({
      id: `import-direction-${moduleId}-${dep.moduleId}`,
      type: 'import_direction',
      moduleId,
      description: `Imports from ${moduleId} to ${dep.moduleId} are allowed via dependency_graph edge`,
    });
  }

  // Rule: circular_dep
  rules.push({
    id: `circular-dep-${moduleId}`,
    type: 'circular_dep',
    moduleId,
    description: `Circular dependencies involving ${moduleId} are prohibited`,
  });

  return {
    moduleId,
    ownedFiles,
    allowedDependencies,
    allModules,
    dependencyEdges,
    rules,
  };
}

// ---------------------------------------------------------------------------
// checkFileOwnership
// ---------------------------------------------------------------------------

/**
 * Check whether filePath is within the module's owned_files.
 * Returns { allowed: true, violation: null } or { allowed: false, violation }.
 */
export function checkFileOwnership(
  ruleSet: ConstraintRuleSet,
  filePath: string,
): { allowed: boolean; violation: ConstraintViolation | null } {
  const normalized = normalizePath(filePath);

  const isOwned = ruleSet.ownedFiles.some((pattern) => matchesOwnedFile(normalized, pattern));
  if (isOwned) {
    return { allowed: true, violation: null };
  }

  // Find which module owns this path
  const owningModule = ruleSet.allModules.find(
    (m) => m.id !== ruleSet.moduleId && m.ownedFiles.some((p) => matchesOwnedFile(normalized, p)),
  );

  const owningModuleId = owningModule?.id ?? null;

  const suggestedFix = owningModuleId
    ? `This file belongs to module ${owningModuleId}. Move it to your module's directory or update the spec to add it to your owned_files.`
    : `This file is not owned by any module. Move it to your module's directory or update the spec to add it to module ${ruleSet.moduleId}'s owned_files.`;

  const violation: ConstraintViolation = {
    ruleId: `file-ownership-${ruleSet.moduleId}`,
    ruleType: 'file_ownership',
    violatingPath: normalized,
    owningModuleId,
    suggestedFix,
  };

  return { allowed: false, violation };
}

// ---------------------------------------------------------------------------
// validateImport
// ---------------------------------------------------------------------------

/**
 * Validate whether an import from sourcePath to importTargetPath is allowed.
 * Both paths are resolved to their owning modules, then checked against dependency_graph.
 *
 * @throws Error with UNRESOLVABLE_PATH if either path cannot be mapped to a module
 */
export function validateImport(
  ruleSet: ConstraintRuleSet,
  sourcePath: string,
  importTargetPath: string,
): { allowed: boolean; violation: ConstraintViolation | null } {
  const normalSource = normalizePath(sourcePath);
  const normalTarget = normalizePath(importTargetPath);

  // Resolve source to module
  const sourceModule = ruleSet.allModules.find((m) =>
    m.ownedFiles.some((p) => matchesOwnedFile(normalSource, p)),
  );
  if (!sourceModule) {
    throw new Error(
      `[UNRESOLVABLE_PATH] Source path "${normalSource}" cannot be mapped to any module`,
    );
  }

  // Resolve target to module
  const targetModule = ruleSet.allModules.find((m) =>
    m.ownedFiles.some((p) => matchesOwnedFile(normalTarget, p)),
  );
  if (!targetModule) {
    throw new Error(
      `[UNRESOLVABLE_PATH] Import target path "${normalTarget}" cannot be mapped to any module`,
    );
  }

  // Same module — always allowed
  if (sourceModule.id === targetModule.id) {
    return { allowed: true, violation: null };
  }

  // Check if there is an edge from sourceModule to targetModule
  const hasEdge = ruleSet.dependencyEdges.some(
    (e) => e.from === sourceModule.id && e.to === targetModule.id,
  );

  if (hasEdge) {
    return { allowed: true, violation: null };
  }

  const allowedDeps = ruleSet.dependencyEdges
    .filter((e) => e.from === sourceModule.id)
    .map((e) => e.to)
    .join(', ') || 'none';

  const violation: ConstraintViolation = {
    ruleId: `import-direction-${sourceModule.id}`,
    ruleType: 'import_direction',
    violatingPath: normalTarget,
    owningModuleId: targetModule.id,
    suggestedFix: `Module ${sourceModule.id} is not allowed to import from ${targetModule.id}. Allowed dependencies: [${allowedDeps}]. Update dependency_graph.edges in spec.json to allow this import.`,
  };

  return { allowed: false, violation };
}

// ---------------------------------------------------------------------------
// detectCycle
// ---------------------------------------------------------------------------

/**
 * Detect whether adding an edge from -> to would create a cycle in the dependency graph.
 * Uses DFS reachability from `toModuleId` back to `fromModuleId`.
 */
export function detectCycle(
  ruleSet: ConstraintRuleSet,
  fromModuleId: string,
  toModuleId: string,
): { hasCycle: boolean; cyclePath: string[] | null } {
  // Build adjacency map from existing edges
  const adj = new Map<string, string[]>();
  for (const edge of ruleSet.dependencyEdges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
  }

  // DFS from toModuleId to see if we can reach fromModuleId
  // (which would mean adding from->to creates a cycle)
  const visited = new Set<string>();
  const path: string[] = [toModuleId];

  function dfs(current: string): string[] | null {
    if (current === fromModuleId) {
      // Found cycle: complete the cycle by adding fromModuleId at the end
      return [...path, fromModuleId];
    }
    visited.add(current);
    const neighbors = adj.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        path.push(neighbor);
        const result = dfs(neighbor);
        if (result !== null) return result;
        path.pop();
      }
    }
    return null;
  }

  const cyclePath = dfs(toModuleId);
  if (cyclePath !== null) {
    return { hasCycle: true, cyclePath };
  }

  return { hasCycle: false, cyclePath: null };
}

// ---------------------------------------------------------------------------
// checkProfileConflicts
// ---------------------------------------------------------------------------

/**
 * Compare constraint rules against profile L2 decisions.
 * Returns conflicts and skipped rule IDs.
 * Non-fatal if profile file does not exist (returns empty conflicts).
 */
export function checkProfileConflicts(
  ruleSet: ConstraintRuleSet,
  profileL2Path: string,
): { conflicts: ProfileConflict[]; skippedRuleIds: string[] } {
  const absPath = resolve(profileL2Path);

  if (!existsSync(absPath)) {
    return { conflicts: [], skippedRuleIds: [] };
  }

  let l2Data: Record<string, unknown>;
  try {
    const text = readFileSync(absPath, 'utf8');
    l2Data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { conflicts: [], skippedRuleIds: [] };
  }

  const conflicts: ProfileConflict[] = [];
  const skippedRuleIds: string[] = [];

  // L2 decisions are structured as an array of constraint decisions
  const decisions = Array.isArray(l2Data['decisions']) ? l2Data['decisions'] : [];

  for (const decision of decisions as Record<string, unknown>[]) {
    const decisionType = String(decision['type'] ?? '');
    const decisionDescription = String(decision['description'] ?? '');

    // Check each import_direction rule against profile constraints
    for (const rule of ruleSet.rules) {
      if (rule.type !== 'import_direction') continue;

      // If profile prohibits a dependency that spec allows
      if (
        decisionType === 'prohibit_dependency' &&
        decisionDescription.includes(rule.id)
      ) {
        conflicts.push({
          ruleId: rule.id,
          profileEntry: decisionDescription,
          description: `Constraint rule "${rule.id}" conflicts with profile L2 decision: "${decisionDescription}"`,
          resolution: 'pending',
        });
        skippedRuleIds.push(rule.id);
      }
    }
  }

  return { conflicts, skippedRuleIds };
}
