export interface BenchmarkBudget {
  max_turns: number;
  timeout_seconds: number;
  max_cost_usd: number;
  [key: string]: unknown;
}

export interface BenchmarkCase {
  id: string;
  case_version: string;
  run_profile: string;
  fixture: string;
  budget: BenchmarkBudget;
  [key: string]: unknown;
}

export interface BenchmarkOracle {
  verdict: string;
  checks?: string[];
  [key: string]: unknown;
}

export interface BenchmarkRunMetadata {
  run_id: string;
  case_id: string;
  case_version: string;
  platform_id: string;
  model_id: string;
  workflow_version: string;
  repo_fixture_hash: string;
  trace_extractor_version: string;
  run_profile: string;
  [key: string]: unknown;
}

export interface BenchmarkCaseBundle {
  case: BenchmarkCase;
  oracle: BenchmarkOracle;
  prompt_text: string;
  fixture_dir: string;
  fixture_hash: string;
  run_metadata_seed: Pick<
    BenchmarkRunMetadata,
    'case_id' | 'case_version' | 'repo_fixture_hash'
  >;
}

export interface Phase1RunProfile {
  profile_id: 'phase1-local-cli-v1';
  required_artifacts: string[];
  required_metadata_fields: string[];
  transcript_record_fields: string[];
}

export interface BenchmarkValidationDetails {
  missingFiles?: string[];
  missingFields?: string[];
  missingArtifacts?: string[];
  missingTraceFields?: string[];
  schemaErrors?: string[];
}

export class BenchmarkValidationError extends Error {
  code: string;
  details: BenchmarkValidationDetails;

  constructor(code: string, message: string, details: BenchmarkValidationDetails = {}) {
    super(message);
    this.name = 'BenchmarkValidationError';
    this.code = code;
    this.details = details;
  }
}

export interface SchemaValidationResult<T> {
  valid: boolean;
  errors: string[];
  data?: T;
}

export interface RunContractValidationResult {
  valid: boolean;
  metadata: BenchmarkRunMetadata | null;
  missing_fields: string[];
  errors: string[];
  missing_artifacts: string[];
  missing_trace_fields: string[];
}
