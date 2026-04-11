import {
  createClaudeCodeAdapter,
} from './adapters/claude-code.js';
import {
  createCodexCliAdapter,
} from './adapters/codex.js';
import {
  createOpenCodeAdapter,
} from './adapters/opencode.js';
import type { Phase1RunProfile } from './types.js';

export interface AdapterLaunchRequest {
  platform_id: string;
  model_id: string;
  workspace_path: string;
  prompt_path: string;
  profile: Phase1RunProfile;
  timeout_seconds: number;
}

export interface AdapterRunResult {
  exit_code: number;
  transcript_records: Array<Record<string, unknown>>;
  artifact_snapshot: string[];
  adapter_notes: string[];
}

export interface BenchmarkAdapter {
  platform_id: string;
  command: string[];
  run(request: AdapterLaunchRequest): Promise<AdapterRunResult>;
}

export interface BenchmarkAdapterRegistry {
  get(platformId: string): BenchmarkAdapter | null;
  has(platformId: string): boolean;
  list(): BenchmarkAdapter[];
}

function getDefaultAdapters(): BenchmarkAdapter[] {
  return [
    createClaudeCodeAdapter(),
    createCodexCliAdapter(),
    createOpenCodeAdapter(),
  ];
}

export function createAdapterRegistry(
  adapters: BenchmarkAdapter[] = [],
): BenchmarkAdapterRegistry {
  const registry = new Map<string, BenchmarkAdapter>();

  for (const adapter of [...getDefaultAdapters(), ...adapters]) {
    registry.set(adapter.platform_id, adapter);
  }

  return {
    get(platformId: string): BenchmarkAdapter | null {
      return registry.get(platformId) ?? null;
    },
    has(platformId: string): boolean {
      return registry.has(platformId);
    },
    list(): BenchmarkAdapter[] {
      return [...registry.values()];
    },
  };
}

export function getBenchmarkAdapter(
  platformId: string,
  registry = createAdapterRegistry(),
): BenchmarkAdapter | null {
  return registry.get(platformId);
}
