import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { validateBenchmarkSchema } from './schema-loader.js';
import type {
  BenchmarkValidationError,
  BenchmarkRunMetadata,
  Phase1RunProfile,
  RunContractValidationResult,
} from './types.js';

const PHASE1_PROFILE: Phase1RunProfile = {
  profile_id: 'phase1-local-cli-v1',
  required_artifacts: [
    'metadata.json',
    'transcript.jsonl',
    'artifacts',
    'event-log.json',
    'verdict.json',
  ],
  required_metadata_fields: [
    'run_id',
    'case_id',
    'case_version',
    'platform_id',
    'model_id',
    'workflow_version',
    'repo_fixture_hash',
    'trace_extractor_version',
  ],
  transcript_record_fields: [
    'timestamp',
    'role',
    'event_type',
    'content',
  ],
};

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
}

function tryReadJsonFile(filePath: string): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, data: readJsonFile(filePath) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isMissingValue(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function collectMissingArtifacts(runDir: string, profile: Phase1RunProfile): string[] {
  return profile.required_artifacts.filter((artifact) => {
    const fullPath = path.join(runDir, artifact);
    if (!existsSync(fullPath)) {
      return true;
    }

    if (artifact === 'artifacts') {
      return !statSync(fullPath).isDirectory();
    }

    return !statSync(fullPath).isFile();
  });
}

function collectMissingTraceFields(
  transcriptPath: string,
  requiredFields: string[],
): string[] {
  const content = readFileSync(transcriptPath, 'utf-8').trim();
  if (content.length === 0) {
    return [...requiredFields];
  }

  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const missing = new Set<string>();

  for (const line of lines) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`invalid transcript JSON (${error instanceof Error ? error.message : String(error)})`);
    }
    for (const field of requiredFields) {
      if (isMissingValue(parsed[field])) {
        missing.add(field);
      }
    }
  }

  return [...missing].sort();
}

export function getPhase1RunProfile(profileId: string): Phase1RunProfile {
  if (profileId !== PHASE1_PROFILE.profile_id) {
    throw new Error('unsupported_profile');
  }

  return {
    profile_id: PHASE1_PROFILE.profile_id,
    required_artifacts: [...PHASE1_PROFILE.required_artifacts],
    required_metadata_fields: [...PHASE1_PROFILE.required_metadata_fields],
    transcript_record_fields: [...PHASE1_PROFILE.transcript_record_fields],
  };
}

export function validateRunContract(
  runDir: string,
  profileId: string,
): RunContractValidationResult {
  const profile = getPhase1RunProfile(profileId);
  const missingArtifacts = collectMissingArtifacts(runDir, profile);
  const errors: string[] = [];

  if (missingArtifacts.length > 0) {
    errors.push('missing required artifacts');
    return {
      valid: false,
      metadata: null,
      missing_fields: [],
      errors,
      missing_artifacts: missingArtifacts,
      missing_trace_fields: [],
    };
  }

  const metadataPath = path.join(runDir, 'metadata.json');
  const transcriptPath = path.join(runDir, 'transcript.jsonl');
  const parsedMetadata = tryReadJsonFile(metadataPath);
  if (!parsedMetadata.ok) {
    return {
      valid: false,
      metadata: null,
      missing_fields: [],
      errors: ['run_schema_invalid'],
      missing_artifacts: missingArtifacts,
      missing_trace_fields: [`metadata.json: invalid JSON (${parsedMetadata.error})`],
    };
  }

  const rawMetadata = parsedMetadata.data;
  const metadataValidation = validateBenchmarkSchema<BenchmarkRunMetadata>(
    'benchmark-run',
    rawMetadata,
  );
  const metadataRecord = asRecord(rawMetadata);
  if (metadataRecord === null) {
    errors.push('run_schema_invalid');
    return {
      valid: false,
      metadata: null,
      missing_fields: [],
      errors,
      missing_artifacts: missingArtifacts,
      missing_trace_fields: [],
    };
  }
  const metadata = metadataValidation.data ?? null;
  const missingFields = profile.required_metadata_fields.filter((field) => isMissingValue(metadataRecord[field]));

  if (!metadataValidation.valid) {
    errors.push('run_schema_invalid');
  }

  if (missingFields.length > 0) {
    errors.push('missing required metadata fields');
  }

  const rawRunProfile = metadataRecord['run_profile'];
  if (!isMissingValue(rawRunProfile) && rawRunProfile !== profile.profile_id) {
    errors.push('profile_mismatch');
  }

  let missingTraceFields: string[] = [];
  try {
    missingTraceFields = collectMissingTraceFields(
      transcriptPath,
      profile.transcript_record_fields,
    );
  } catch (error) {
    errors.push('run_schema_invalid');
    missingTraceFields = [error instanceof Error ? error.message : String(error)];
  }
  if (missingTraceFields.length > 0) {
    if (!errors.includes('run_schema_invalid')) {
      errors.push('missing transcript record fields');
    }
  }

  return {
    valid: errors.length === 0,
    metadata,
    missing_fields: [...missingFields],
    errors,
    missing_artifacts: missingArtifacts,
    missing_trace_fields: missingTraceFields,
  };
}
