import {
  readdirSync,
  readFileSync,
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

    files.push(entryPath);
  }

  return files.sort();
}

function runOpenCodeProcess(request: AdapterLaunchRequest): Promise<AdapterRunResult> {
  const promptText = readFileSync(request.prompt_path, 'utf-8');
  const args = ['run', promptText, '--agent', 'coder', '--model', request.model_id];

  return new Promise((resolve, reject) => {
    const child = spawn('opencode', args, {
      cwd: request.workspace_path,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new BenchmarkValidationError('process_timeout', 'OpenCode adapter timed out'));
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
        reject(new BenchmarkValidationError('platform_cli_unavailable', 'OpenCode CLI is not installed'));
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
        artifact_snapshot: collectWorkspaceFiles(request.workspace_path),
        adapter_notes: [`opencode ${args.join(' ')}`],
      });
    });
  });
}

export function createOpenCodeAdapter(): BenchmarkAdapter {
  return {
    platform_id: 'opencode',
    command: ['opencode'],
    run: runOpenCodeProcess,
  };
}
