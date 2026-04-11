import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import type { BenchmarkCaseBundle } from './types.js';

export interface PreparedRunWorkspace {
  workspace_path: string;
  artifact_root: string;
  cleanup_policy: 'delete_on_success' | 'preserve_on_failure';
}

function assertSafeRunId(runId: string): void {
  if (runId.length === 0 || path.isAbsolute(runId) || runId.includes('..') || runId.includes(path.sep)) {
    throw new Error('invalid_run_id');
  }
}

export function prepareRunWorkspace(
  caseBundle: BenchmarkCaseBundle,
  runId: string,
  projectRoot: string,
): PreparedRunWorkspace {
  assertSafeRunId(runId);
  const artifactRoot = path.join(projectRoot, '.benchmark', runId);
  const workspacePath = path.join(artifactRoot, 'workspace');

  if (existsSync(artifactRoot)) {
    rmSync(artifactRoot, { recursive: true, force: true });
  }

  mkdirSync(artifactRoot, { recursive: true });
  cpSync(caseBundle.fixture_dir, workspacePath, { recursive: true });

  return {
    workspace_path: workspacePath,
    artifact_root: artifactRoot,
    cleanup_policy: 'preserve_on_failure',
  };
}
