/**
 * Type definitions for NoPilot profile layers and config.
 * All profile files live under .nopilot/profile/
 * Config at .nopilot/config.json
 */

export interface ProfileL0Infra {
  updated_at: string;
  languages: string[];
  frameworks: string[];
  package_manager: 'npm' | 'yarn' | 'pnpm' | 'bun' | null;
  runtime: string | null;
  build_tools: string[];
  ci: { provider: string; config_path: string } | null;
  test_framework: string | null;
}

export interface ProfileL1Arch {
  updated_at: string;
  directory_structure: Record<string, string>;
  modules: { name: string; path: string; responsibility: string }[];
  dependency_directions: { from: string; to: string; type: string }[];
  communication_patterns: string[];
  design_patterns: string[];
}

export interface ProfileL2Decisions {
  updated_at: string;
  design_philosophy: {
    principle: string;
    justification: string;
    source_artifact: string;
  }[];
  architecture_decisions: {
    decision: string;
    rationale: string;
    alternatives: string[];
    source_artifact: string;
  }[];
  constraints: {
    constraint: string;
    source: 'user_stated' | 'ai_inferred';
    source_artifact: string;
  }[];
}

export interface ProfileL3Status {
  updated_at: string;
  test_coverage: { total_tests: number; framework: string };
  domain_model: {
    entities: Record<string, unknown>[];
    relationships: Record<string, unknown>[];
  };
  tech_debt: string[];
  change_hotspots: string[];
  recent_features: string[];
  ui_taste?: {
    designDNA: Record<string, unknown>;
    tokensPath: string;
    mockupsDir: string;
    stitchProjectId: string | null;
    tier: 1 | 2 | 3;
    selectedPages: Array<{
      name: string;
      mockupFile: string;
      darkMockupFile: string | null;
    }>;
  } | null;
}

/** On-disk config shape (.nopilot/config.json) */
export interface ProfileConfigRaw {
  l2_enabled?: boolean;
  scan_threshold_files?: number;
  staleness_threshold_hours?: number;
}

/** Normalized config returned by readConfig (camelCase) */
export interface ProfileConfig {
  l2Enabled: boolean;
  scanThresholdFiles: number;
  stalenessThresholdHours: number;
}

export type LayerName = 'l0' | 'l1' | 'l2' | 'l3';

export type LayerData = ProfileL0Infra | ProfileL1Arch | ProfileL2Decisions | ProfileL3Status;

export interface ReadLayerResult {
  data: LayerData | null;
  valid: boolean;
  errors: string[];
}

export interface WriteLayerResult {
  success: boolean;
  path: string;
}

export interface ProfileExistsResult {
  exists: boolean;
  layers: { l0: boolean; l1: boolean; l2: boolean; l3: boolean };
}

export interface StalenessResult {
  stale: boolean;
  profileUpdatedAt: string | null;
  latestCommitAt: string | null;
  hoursApart: number;
  thresholdHours: number;
}

export interface EnsureGitignoreResult {
  added: boolean;
}

export interface ScanResult {
  fileCount: number;
  parallelized: boolean;
  l0Partial: Partial<ProfileL0Infra>;
  l1Partial: Partial<ProfileL1Arch>;
  l3Partial: Partial<ProfileL3Status>;
}

export interface HasExistingCodeResult {
  hasCode: boolean;
  indicators: string[];
}
