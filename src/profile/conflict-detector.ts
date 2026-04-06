/**
 * Conflict detector — MOD-005.
 * Structural comparison of feature requirements against project profile layers.
 * LLM semantic comparison happens at the prompt level (MOD-006); this is the
 * TypeScript structural utility.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConflictType = 'philosophy' | 'constraint' | 'architecture' | 'domain_model';
export type ConflictSeverity = 'high' | 'medium' | 'low';
export type ConflictResolution = 'ADAPT' | 'EVOLVE' | 'DEFER';

export interface Conflict {
  id: string;
  type: ConflictType;
  profileEntry: string;
  profileLayer: 'l0' | 'l1' | 'l2' | 'l3';
  featureEntry: string;
  severity: ConflictSeverity;
  description: string;
  resolution: ConflictResolution | null;
}

export interface ConflictReport {
  conflicts: Conflict[];
  hasBlockingConflicts: boolean;
}

export interface ResolveConflictResult {
  resolved: boolean;
  action: string;
  profileUpdateFlag: boolean;
}

// ---------------------------------------------------------------------------
// In-memory conflict registry (for resolveConflict lookup)
// ---------------------------------------------------------------------------

const conflictRegistry = new Map<string, Conflict>();
let conflictCounter = 0;

function nextConflictId(): string {
  conflictCounter += 1;
  return `CONFLICT-${String(conflictCounter).padStart(3, '0')}`;
}

function registerConflict(conflict: Omit<Conflict, 'id' | 'resolution'>): Conflict {
  const id = nextConflictId();
  const full: Conflict = { ...conflict, id, resolution: null };
  conflictRegistry.set(id, full);
  return full;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  return [];
}

function asString(val: unknown): string {
  if (typeof val === 'string') return val;
  return '';
}

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

// ---------------------------------------------------------------------------
// detectConflicts
// ---------------------------------------------------------------------------

export function detectConflicts(
  featureRequirements: Record<string, unknown>,
  profile: Record<string, unknown>
): ConflictReport {
  const conflicts: Conflict[] = [];

  const l0 = (profile['l0'] as Record<string, unknown>) ?? null;
  const l1 = (profile['l1'] as Record<string, unknown>) ?? null;
  const l2 = (profile['l2'] as Record<string, unknown>) ?? null;
  const l3 = (profile['l3'] as Record<string, unknown>) ?? null;

  const featureTechDirection = (featureRequirements['tech_direction'] as Record<string, unknown>) ?? {};
  const featureRequirementsList = asArray(featureRequirements['requirements']);
  const featureDomainModel = (featureRequirements['domain_model'] as Record<string, unknown>) ?? {};

  // Build a combined feature text for keyword matching
  const featureDescriptions = featureRequirementsList
    .map((r) => asString((r as Record<string, unknown>)['description']))
    .join(' ');

  // -------------------------------------------------------------------------
  // L2 checks (philosophy + constraints) — when L2 is available
  // -------------------------------------------------------------------------
  if (l2) {
    const philosophyEntries = asArray(l2['design_philosophy']);
    for (const entry of philosophyEntries) {
      const e = (entry as Record<string, unknown>) ?? {};
      const principle = asString(e['principle']);

      // Detect philosophy conflict: "humans decide, machines execute" vs full automation
      if (
        containsAny(principle, ['humans decide', 'human in the loop', 'human oversight']) &&
        (containsAny(featureDescriptions, ['fully automated', 'no human', 'autonomous decision']) ||
          containsAny(asString(featureTechDirection['automation']), ['fully_automated', 'autonomous']))
      ) {
        conflicts.push(
          registerConflict({
            type: 'philosophy',
            profileEntry: principle,
            profileLayer: 'l2',
            featureEntry: featureDescriptions.slice(0, 200) || asString(featureTechDirection['automation']),
            severity: 'high',
            description: `Feature contradicts design philosophy: "${principle}"`,
          })
        );
      }
    }

    // Constraint conflicts (e.g., "REST only" vs WebSocket)
    const constraintEntries = asArray(l2['constraints']);
    for (const entry of constraintEntries) {
      const e = (entry as Record<string, unknown>) ?? {};
      const constraint = asString(e['constraint']);

      // "REST only" vs WebSocket
      if (
        containsAny(constraint, ['REST only', 'REST-only', 'no websocket', 'no WebSocket']) &&
        (containsAny(featureDescriptions, ['WebSocket', 'websocket', 'real-time', 'realtime']) ||
          asArray(featureTechDirection['protocols']).some((p) =>
            containsAny(asString(p), ['WebSocket', 'websocket'])
          ))
      ) {
        // Find the specific feature entry mentioning WebSocket
        const conflictingReq = featureRequirementsList.find((r) =>
          containsAny(asString((r as Record<string, unknown>)['description']), ['WebSocket', 'websocket'])
        );
        const featureEntry = conflictingReq
          ? asString((conflictingReq as Record<string, unknown>)['description'])
          : asString(asArray(featureTechDirection['protocols']).find((p) =>
              containsAny(asString(p), ['WebSocket'])
            ));

        conflicts.push(
          registerConflict({
            type: 'constraint',
            profileEntry: constraint,
            profileLayer: 'l2',
            featureEntry: featureEntry || 'WebSocket',
            severity: 'high',
            description: `Feature violates constraint: "${constraint}"`,
          })
        );
      }

      // Generic constraint: check if feature tech direction introduces something forbidden
      if (
        containsAny(constraint, ['no ']) &&
        asArray(featureTechDirection['protocols']).some((p) => {
          const proto = asString(p);
          return constraint.toLowerCase().includes(proto.toLowerCase()) && proto.length > 2;
        })
      ) {
        // Already handled above — skip duplicates
      }
    }
  } else {
    // -----------------------------------------------------------------------
    // L0/L1 structural checks only (L2 absent or disabled)
    // -----------------------------------------------------------------------
    if (l0) {
      const profileRuntime = asString(l0['runtime']);
      const featureRuntime = asString(featureTechDirection['runtime']);
      if (profileRuntime && featureRuntime && profileRuntime !== featureRuntime) {
        conflicts.push(
          registerConflict({
            type: 'architecture',
            profileEntry: `runtime: ${profileRuntime}`,
            profileLayer: 'l0',
            featureEntry: `runtime: ${featureRuntime}`,
            severity: 'medium',
            description: `Feature runtime "${featureRuntime}" differs from profile runtime "${profileRuntime}"`,
          })
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // L3 domain model entity name collision
  // -------------------------------------------------------------------------
  if (l3) {
    const profileDomain = (l3['domain_model'] as Record<string, unknown>) ?? {};
    const profileEntities = asArray(profileDomain['entities']);
    const profileEntityNames = new Map(
      profileEntities.map((e) => {
        const entity = e as Record<string, unknown>;
        return [asString(entity['name']), asString(entity['description'])];
      })
    );

    const featureEntities = asArray(featureDomainModel['entities']);
    for (const fe of featureEntities) {
      const feEntity = fe as Record<string, unknown>;
      const name = asString(feEntity['name']);
      const feDesc = asString(feEntity['description']);

      if (profileEntityNames.has(name)) {
        const profileDesc = profileEntityNames.get(name) ?? '';
        // Only flag as conflict if descriptions differ
        if (feDesc !== profileDesc) {
          conflicts.push(
            registerConflict({
              type: 'domain_model',
              profileEntry: `entity "${name}": ${profileDesc}`,
              profileLayer: 'l3',
              featureEntry: `entity "${name}": ${feDesc}`,
              severity: 'medium',
              description: `Domain model entity name collision: "${name}" already exists with different description`,
            })
          );
        }
      }
    }
  }

  const hasBlockingConflicts = conflicts.some((c) => c.severity === 'high');

  return { conflicts, hasBlockingConflicts };
}

// ---------------------------------------------------------------------------
// resolveConflict
// ---------------------------------------------------------------------------

export function resolveConflict(
  conflictId: string,
  resolution: ConflictResolution
): ResolveConflictResult {
  const conflict = conflictRegistry.get(conflictId);
  if (!conflict) {
    throw new Error(`CONFLICT_NOT_FOUND: no conflict with id "${conflictId}"`);
  }

  conflict.resolution = resolution;

  switch (resolution) {
    case 'ADAPT':
      return {
        resolved: true,
        action: 'ADAPT: requirement modified to fit existing profile',
        profileUpdateFlag: false,
      };
    case 'EVOLVE':
      return {
        resolved: true,
        action: 'EVOLVE: architecture evolution flagged for profile update after build',
        profileUpdateFlag: true,
      };
    case 'DEFER':
      return {
        resolved: true,
        action: 'DEFER: feature requirement moved to V2',
        profileUpdateFlag: false,
      };
  }
}
