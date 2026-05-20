/**
 * Adapter registry — maps platform names to PlatformAdapter configs.
 * New platform = new adapter file + one registerAdapter() call here.
 */

import type { PlatformAdapter } from '../types.js';
import { claudeCodeAdapter } from './claude-code.js';
import { codexAdapter } from './codex.js';
import { opencodeAdapter } from './opencode.js';

const ADAPTERS = new Map<string, PlatformAdapter>();

export function registerAdapter(adapter: PlatformAdapter): void {
  ADAPTERS.set(adapter.name, adapter);
}

export function getAdapter(platform: string): PlatformAdapter {
  const adapter = ADAPTERS.get(platform);
  if (!adapter) throw new Error(`Unknown platform: ${platform}`);
  return adapter;
}

export function hasAdapter(platform: string): boolean {
  return ADAPTERS.has(platform);
}

// Register built-in adapters
registerAdapter(claudeCodeAdapter);
registerAdapter(codexAdapter);
registerAdapter(opencodeAdapter);
