import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  createAdapterRegistry,
  type AdapterLaunchRequest,
  type AdapterRunResult,
  type BenchmarkAdapterRegistry,
} from './adapter-registry.js';
import { BenchmarkValidationError } from './types.js';

export interface ExecutedAdapterResult extends AdapterRunResult {
  transcript_path: string;
  workspace_path: string;
}

export interface ExecuteRunAdapterOptions {
  registry?: BenchmarkAdapterRegistry;
}

function ensureReadableFile(filePath: string, label: string): void {
  try {
    accessSync(filePath, constants.R_OK);
  } catch {
    throw new BenchmarkValidationError(
      'incomplete_run_contract',
      `${label} must exist before adapter execution`,
      {
        missingFiles: [path.basename(filePath)],
      },
    );
  }
}

function collectMissingTraceFields(
  transcriptRecords: Array<Record<string, unknown>>,
  requiredFields: string[],
): string[] {
  if (transcriptRecords.length === 0) {
    return [...requiredFields];
  }

  const missingFields = new Set<string>();

  for (const record of transcriptRecords) {
    for (const field of requiredFields) {
      const value = record[field];
      if (value === null || value === undefined || value === '') {
        missingFields.add(field);
      }
    }
  }

  return [...missingFields].sort();
}

function normalizeArtifactSnapshot(
  workspacePath: string,
  artifactSnapshot: string[],
): string[] {
  return artifactSnapshot.map((entry) => (
    path.isAbsolute(entry)
      ? entry
      : path.resolve(workspacePath, entry)
  ));
}

function writeTranscriptStagingFiles(
  request: AdapterLaunchRequest,
  transcriptRecords: Array<Record<string, unknown>>,
): string {
  const transcriptDir = path.join(request.workspace_path, '.benchmark');
  mkdirSync(transcriptDir, { recursive: true });

  const transcriptPath = path.join(transcriptDir, `${request.platform_id}-transcript.jsonl`);
  const transcriptJsonPath = path.join(transcriptDir, `${request.platform_id}-transcript.json`);

  writeFileSync(
    transcriptPath,
    transcriptRecords.map((record) => JSON.stringify(record)).join('\n').concat('\n'),
    'utf-8',
  );
  writeFileSync(transcriptJsonPath, `${JSON.stringify(transcriptRecords, null, 2)}\n`, 'utf-8');

  return transcriptPath;
}

export async function executeRunAdapter(
  request: AdapterLaunchRequest,
  options: ExecuteRunAdapterOptions = {},
): Promise<ExecutedAdapterResult> {
  ensureReadableFile(request.prompt_path, 'prompt.txt');

  if (!existsSync(request.workspace_path)) {
    throw new BenchmarkValidationError(
      'workspace_init_failed',
      'Benchmark workspace must exist before adapter execution',
      {
        missingFiles: [request.workspace_path],
      },
    );
  }

  const registry = options.registry ?? createAdapterRegistry();
  const adapter = registry.get(request.platform_id);

  if (adapter === null) {
    throw new BenchmarkValidationError(
      'adapter_missing',
      `No benchmark adapter is registered for '${request.platform_id}'`,
      {
        missingFields: ['platform_id'],
      },
    );
  }

  const rawResult = await adapter.run(request);
  const missingTraceFields = collectMissingTraceFields(
    rawResult.transcript_records,
    request.profile.transcript_record_fields,
  );

  if (missingTraceFields.length > 0) {
    throw new BenchmarkValidationError(
      'incomplete_run_contract',
      'Adapter transcript did not satisfy the phase1 transcript profile',
      {
        missingTraceFields,
      },
    );
  }

  const transcriptPath = writeTranscriptStagingFiles(request, rawResult.transcript_records);

  return {
    exit_code: rawResult.exit_code,
    transcript_path: transcriptPath,
    workspace_path: request.workspace_path,
    transcript_records: rawResult.transcript_records.map((record) => ({ ...record })),
    artifact_snapshot: normalizeArtifactSnapshot(request.workspace_path, rawResult.artifact_snapshot),
    adapter_notes: [...rawResult.adapter_notes],
  };
}
