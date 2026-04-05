/**
 * Per-layer extractors for MOD-002: profile-writer.
 * Extracts information from stage artifacts into profile layer partials.
 */
import type {
  ProfileL0Infra,
  ProfileL1Arch,
  ProfileL2Decisions,
  ProfileL3Status,
} from './types.js';

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

// ---------------------------------------------------------------------------
// extractL0 — tech stack / infra from discover.json (+spec.json)
// ---------------------------------------------------------------------------

export function extractL0(
  discoverArtifact: Record<string, unknown>,
  _specArtifact: Record<string, unknown> | null
): Partial<ProfileL0Infra> {
  const constraints = (discoverArtifact['constraints'] as Record<string, unknown>) ?? {};
  const techStack = asArray(constraints['tech_stack']);

  // Separate languages vs frameworks heuristically: languages start with upper-case known langs
  const knownLanguages = new Set([
    'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C#', 'Ruby', 'PHP',
    'Swift', 'Kotlin', 'Dart', 'Elixir', 'Haskell', 'Scala', 'C', 'C++',
  ]);
  const knownPackageManagers = new Set(['npm', 'yarn', 'pnpm', 'bun']);

  const languages: string[] = [];
  const frameworks: string[] = [];
  let packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | null = null;

  for (const item of techStack) {
    const s = asString(item);
    if (!s) continue;
    const lower = s.toLowerCase() as 'npm' | 'yarn' | 'pnpm' | 'bun';
    if (knownPackageManagers.has(lower)) {
      packageManager = lower;
    } else if (knownLanguages.has(s)) {
      languages.push(s);
    } else {
      frameworks.push(s);
    }
  }

  return {
    languages,
    frameworks,
    package_manager: packageManager,
    runtime: null,
    build_tools: [],
    ci: null,
    test_framework: null,
  };
}

// ---------------------------------------------------------------------------
// extractL1 — architecture from spec.json (+build_report.json)
// ---------------------------------------------------------------------------

export function extractL1(
  specArtifact: Record<string, unknown> | null,
  _buildReport: Record<string, unknown> | null
): Partial<ProfileL1Arch> {
  if (!specArtifact) {
    return {
      directory_structure: {},
      modules: [],
      dependency_directions: [],
      communication_patterns: [],
      design_patterns: [],
    };
  }

  const rawModules = asArray(specArtifact['modules']);
  const modules: ProfileL1Arch['modules'] = rawModules.map((m) => {
    const mod = (m as Record<string, unknown>) ?? {};
    return {
      name: asString(mod['name']),
      path: asString(mod['path'] ?? mod['source_root'] ?? ''),
      responsibility: asString(mod['responsibility']),
    };
  });

  // Collect dependency_directions from dependency_graph edges
  const depGraph = (specArtifact['dependency_graph'] as Record<string, unknown>) ?? {};
  const edges = asArray(depGraph['edges']);
  const dependency_directions = edges.map((e) => {
    const edge = (e as Record<string, unknown>) ?? {};
    return {
      from: asString(edge['from']),
      to: asString(edge['to']),
      type: asString(edge['type'] ?? 'calls'),
    };
  });

  // Collect communication_patterns and design_patterns from modules
  const communicationSet = new Set<string>();
  const designPatternSet = new Set<string>();
  for (const m of rawModules) {
    const mod = (m as Record<string, unknown>) ?? {};
    for (const cp of asArray(mod['communication_patterns'])) communicationSet.add(asString(cp));
    for (const dp of asArray(mod['design_patterns'])) designPatternSet.add(asString(dp));
  }

  return {
    directory_structure: {},
    modules,
    dependency_directions,
    communication_patterns: [...communicationSet].filter(Boolean),
    design_patterns: [...designPatternSet].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// extractL2 — design philosophy and decisions
// ---------------------------------------------------------------------------

export function extractL2(
  discoverArtifact: Record<string, unknown>,
  decisionsArtifact: Record<string, unknown> | null,
  _buildReport: Record<string, unknown> | null
): Partial<ProfileL2Decisions> {
  // Design philosophy from discover
  const rawPhilosophy = asArray(discoverArtifact['design_philosophy']);
  const design_philosophy: ProfileL2Decisions['design_philosophy'] = rawPhilosophy.map((p) => {
    const entry = (p as Record<string, unknown>) ?? {};
    return {
      principle: asString(entry['principle']),
      justification: asString(entry['justification']),
      source_artifact: asString(entry['source_artifact'] ?? 'discover.json'),
    };
  });

  // Architecture decisions from decisions.json
  const architecture_decisions: ProfileL2Decisions['architecture_decisions'] = [];
  if (decisionsArtifact) {
    const rawDecisions = asArray(decisionsArtifact['decisions']);
    for (const d of rawDecisions) {
      const entry = (d as Record<string, unknown>) ?? {};
      architecture_decisions.push({
        decision: asString(entry['decision']),
        rationale: asString(entry['rationale']),
        alternatives: asArray(entry['alternatives']).map(asString).filter(Boolean),
        source_artifact: asString(entry['source_artifact'] ?? 'decisions.json'),
      });
    }
  }

  // Constraints from discover constraints.non_negotiable
  const constraints_raw = (discoverArtifact['constraints'] as Record<string, unknown>) ?? {};
  const nonNeg = asArray(constraints_raw['non_negotiable']);
  const constraints: ProfileL2Decisions['constraints'] = nonNeg.map((c) => ({
    constraint: asString(c),
    source: 'user_stated' as const,
    source_artifact: 'discover.json',
  }));

  return { design_philosophy, architecture_decisions, constraints };
}

// ---------------------------------------------------------------------------
// extractL3 — domain model, test coverage, feature list
// ---------------------------------------------------------------------------

export function extractL3(
  discoverArtifact: Record<string, unknown>,
  buildReport: Record<string, unknown> | null,
  _featureSlug: string | null
): Partial<ProfileL3Status> {
  // Domain model from discover
  const rawDomainModel = (discoverArtifact['domain_model'] as Record<string, unknown>) ?? {};
  const entities = asArray(rawDomainModel['entities']);
  const relationships = asArray(rawDomainModel['relationships']);

  const domain_model: ProfileL3Status['domain_model'] = {
    entities,
    relationships,
  };

  // Test coverage from build report
  let test_coverage: ProfileL3Status['test_coverage'] = { total_tests: 0, framework: 'unknown' };
  if (buildReport) {
    const summary = (buildReport['test_summary'] as Record<string, unknown>) ?? {};
    test_coverage = {
      total_tests: typeof summary['total'] === 'number' ? summary['total'] : 0,
      framework: asString(summary['framework'] ?? 'unknown'),
    };
  }

  return {
    domain_model,
    test_coverage,
    tech_debt: [],
    change_hotspots: [],
    recent_features: [],
  };
}

// ---------------------------------------------------------------------------
// mergeDomainModel
// ---------------------------------------------------------------------------

export interface MergeDomainModelResult {
  merged: { entities: object[]; relationships: object[] };
  added: string[];
  conflicts: string[];
}

export function mergeDomainModel(
  existing: { entities: object[]; relationships: object[] },
  incoming: { entities: object[]; relationships: object[] }
): MergeDomainModelResult {
  const existingEntities = existing.entities ?? [];
  const incomingEntities = incoming.entities ?? [];

  const existingNames = new Set(
    existingEntities.map((e) => (e as Record<string, unknown>)['name'] as string)
  );

  const added: string[] = [];
  const conflicts: string[] = [];
  const mergedEntities = [...existingEntities];

  for (const entity of incomingEntities) {
    const name = (entity as Record<string, unknown>)['name'] as string;
    if (existingNames.has(name)) {
      conflicts.push(name);
    } else {
      mergedEntities.push(entity);
      added.push(name);
      existingNames.add(name);
    }
  }

  // Merge relationships additively (no collision detection for relationships)
  const mergedRelationships = [
    ...(existing.relationships ?? []),
    ...(incoming.relationships ?? []),
  ];

  return {
    merged: { entities: mergedEntities, relationships: mergedRelationships },
    added,
    conflicts,
  };
}
