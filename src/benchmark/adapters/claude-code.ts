import {
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  AdapterLaunchRequest,
  AdapterRunResult,
  BenchmarkAdapter,
} from '../adapter-registry.js';
import { BenchmarkValidationError } from '../types.js';

function collectWorkspaceFiles(rootDir: string, currentDir = rootDir): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectWorkspaceFiles(rootDir, entryPath));
      continue;
    }

    if (path.relative(rootDir, entryPath).startsWith('.benchmark')) {
      continue;
    }

    files.push(entryPath);
  }

  return files.sort();
}

function buildArtifactSnapshot(rootDir: string, startedAtMs: number): string[] {
  return collectWorkspaceFiles(rootDir)
    .filter((entryPath) => statSync(entryPath).mtimeMs >= startedAtMs)
    .map((entryPath) => path.relative(rootDir, entryPath).replace(/\\/g, '/'));
}

function runClaudeProcess(request: AdapterLaunchRequest): Promise<AdapterRunResult> {
  const promptText = readFileSync(request.prompt_path, 'utf-8');
  const args = ['-p', promptText, '--model', request.model_id];
  const startedAtMs = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: request.workspace_path,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new BenchmarkValidationError('process_timeout', 'Claude Code adapter timed out'));
    }, request.timeout_seconds * 1000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new BenchmarkValidationError('platform_cli_unavailable', 'Claude Code CLI is not installed'));
        return;
      }

      reject(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const content = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      resolve({
        exit_code: exitCode ?? 1,
        transcript_records: content.length === 0
          ? []
          : [
              {
                timestamp: new Date().toISOString(),
                role: 'assistant',
                event_type: 'message',
                content,
              },
            ],
        artifact_snapshot: buildArtifactSnapshot(request.workspace_path, startedAtMs),
        adapter_notes: [`claude ${args.join(' ')}`],
      });
    });
  });
}

export function createClaudeCodeAdapter(): BenchmarkAdapter {
  return {
    platform_id: 'claude-code',
    command: ['claude'],
    run: runClaudeProcess,
  };
}
