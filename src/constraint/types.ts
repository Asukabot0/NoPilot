/**
 * MOD-001: constraint/types
 *
 * Shared TypeScript type definitions for the constraint enforcement layer.
 * All types are derived from spec.json data_models.
 */

// ---------------------------------------------------------------------------
// Core constraint types
// ---------------------------------------------------------------------------

export type ConstraintRuleType = 'file_ownership' | 'import_direction' | 'circular_dep';

export interface ConstraintRule {
  id: string;
  type: ConstraintRuleType;
  moduleId: string;
  description: string;
}

export interface ConstraintRuleSet {
  moduleId: string;
  ownedFiles: string[];
  allowedDependencies: { moduleId: string; ownedFiles: string[] }[];
  allModules: { id: string; ownedFiles: string[] }[];
  dependencyEdges: { from: string; to: string }[];
  rules: ConstraintRule[];
}

export interface ConstraintViolation {
  ruleId: string;
  ruleType: ConstraintRuleType;
  violatingPath: string;
  owningModuleId: string | null;
  suggestedFix: string;
}

export interface ProfileConflict {
  ruleId: string;
  profileEntry: string;
  description: string;
  resolution: 'pending';
}

// ---------------------------------------------------------------------------
// Session and report types (used by MOD-002)
// ---------------------------------------------------------------------------

export interface ConstraintReport {
  moduleId: string;
  violations: ConstraintViolation[];
  counters: {
    mcpCalls: number;
    violationsBlocked: number;
  };
  timestamp: string;
}

export interface SessionState {
  ruleSet: ConstraintRuleSet;
  violations: ConstraintViolation[];
  mcpCallCount: number;
  violationsBlockedCount: number;
}
