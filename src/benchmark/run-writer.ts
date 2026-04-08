import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { validateRunContract } from './run-profile.js';
import { BenchmarkValidationError, type BenchmarkRunMetadata } from './types.js';
import type { ExecutedAdapterResult } from './adapter-runner.js';

export interface StandardRunDirectoryResult {
  run_dir: string;
  metadata_path: string;
  transcript_path: string;
}

function assertSafeRunId(runId: string): void {
  if (runId.length === 0 || path.isAbsolute(runId) || runId.includes('..') || runId.includes(path.sep)) {
    throw new BenchmarkValidationError(
      'run_write_failed',
      'run_id must stay within the benchmark output root',
      {
        missingFields: ['run_id'],
      },
    );
  }
}

function resolveArtifactDestinationPath(
  workspacePath: string,
  sourcePath: string,
  artifactsDir: string,
): string {
  const relativePath = path.relative(workspacePath, sourcePath);
  if (
    relativePath.length === 0
    || relativePath.startsWith('..')
    || path.isAbsolute(relativePath)
  ) {
    throw new BenchmarkValidationError(
      'run_write_failed',
      'Adapter artifact snapshot must reference files within the prepared workspace',
      {
        missingFiles: [sourcePath],
      },
    );
  }

  return path.join(artifactsDir, relativePath);
}

function copyArtifactSnapshot(
  artifactSnapshot: string[],
  artifactsDir: string,
  workspacePath: string,
): void {
  for (const sourcePath of artifactSnapshot) {
    if (!existsSync(sourcePath)) {
      throw new BenchmarkValidationError(
        'run_write_failed',
        'Adapter artifact snapshot referenced a path that does not exist',
        {
          missingFiles: [sourcePath],
        },
      );
    }

    const destinationPath = resolveArtifactDestinationPath(
      workspacePath,
      sourcePath,
      artifactsDir,
    );
    mkdirSync(path.dirname(destinationPath), { recursive: true });

    if (statSync(sourcePath).isDirectory()) {
      cpSync(sourcePath, destinationPath, { recursive: true });
      continue;
    }

    cpSync(sourcePath, destinationPath);
  }
}

function writeTranscriptArtifacts(
  runDir: string,
  adapterResult: ExecutedAdapterResult,
): string {
  const transcriptPath = path.join(runDir, 'transcript.jsonl');
  const transcriptJsonPath = path.join(runDir, 'transcript.json');
  const transcriptJson = adapterResult.transcript_records;

  writeFileSync(transcriptPath, readFileSync(adapterResult.transcript_path, 'utf-8'), 'utf-8');
  writeFileSync(transcriptJsonPath, `${JSON.stringify(transcriptJson, null, 2)}\n`, 'utf-8');

  return transcriptPath;
}

export function writeStandardRunDirectory(
  metadata: BenchmarkRunMetadata,
  adapterResult: ExecutedAdapterResult,
  outputRoot: string,
): StandardRunDirectoryResult {
  assertSafeRunId(metadata.run_id);
  const runDir = path.join(outputRoot, metadata.run_id);
  if (existsSync(runDir)) {
    rmSync(runDir, { recursive: true, force: true });
  }

  const artifactsDir = path.join(runDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });

  const metadataPath = path.join(runDir, 'metadata.json');
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');

  const transcriptPath = writeTranscriptArtifacts(runDir, adapterResult);
  copyArtifactSnapshot(
    adapterResult.artifact_snapshot,
    artifactsDir,
    adapterResult.workspace_path,
  );

  writeFileSync(
    path.join(runDir, 'event-log.json'),
    `${JSON.stringify({
      status: 'pending_trace',
      observation_events: [],
      semantic_events: [],
      warnings: [],
    }, null, 2)}\n`,
    'utf-8',
  );
  writeFileSync(
    path.join(runDir, 'verdict.json'),
    `${JSON.stringify({
      status: 'pending_review',
      notes: 'Awaiting trace extraction and evaluation.',
    }, null, 2)}\n`,
    'utf-8',
  );

  const validation = validateRunContract(runDir, metadata.run_profile);
  if (!validation.valid) {
    throw new BenchmarkValidationError(
      'incomplete_run_contract',
      'Standard run directory did not satisfy the phase1 contract',
      {
        missingFields: validation.missing_fields,
        missingArtifacts: validation.missing_artifacts,
        missingTraceFields: validation.missing_trace_fields,
        schemaErrors: validation.errors,
      },
    );
  }

  return {
    run_dir: runDir,
    metadata_path: metadataPath,
    transcript_path: transcriptPath,
  };
}
