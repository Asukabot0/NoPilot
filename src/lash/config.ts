/**
 * Lash configuration loading.
 * Mirrors Python lash/config.py exactly.
 */
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import type { LashConfig } from './types.js';

/** Default configuration matching Python DEFAULT_CONFIG. */
const DEFAULT_CONFIG: LashConfig = {
  platforms: ['claude-code', 'codex', 'opencode'],
  platform_assignment: 'round-robin',
  platform_overrides: null,
  critic_platform: null,
  max_concurrency: null,
  heartbeat_timeout: 300,
  graceful_shutdown_seconds: 10,
  max_retries_per_module: 3,
  max_critic_rounds: 2,
  max_approach_resets: 2,
};

/**
 * Load config from lash.config.json, falling back to defaults.
 * Searches for config file in current working directory.
 * User config values merge over defaults.
 */
export function loadConfig(configPath?: string): LashConfig {
  const config: LashConfig = { ...DEFAULT_CONFIG };

  // Determine the config file path
  const filePath = configPath ?? resolve(cwd(), 'lash.config.json');

  // Try to load user config if file exists
  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const userConfig = JSON.parse(content) as Partial<LashConfig>;
      // Merge user config over defaults
      Object.assign(config, userConfig);
    } catch (error) {
      // If file can't be read or parsed, silently fall back to defaults
      // This matches Python behavior of not raising on load failure
    }
  }

  return config;
}

/**
 * Assign platform to a module using configured strategy.
 * Supports per-module overrides and round-robin assignment.
 *
 * @param moduleIndex - Module index (integer) or module ID (string)
 * @param availablePlatforms - List of available platform names
 * @param config - Loaded Lash configuration
 * @returns Assigned platform name
 * @throws Error if no available platforms
 */
export function assignPlatform(
  moduleIndex: string | number,
  availablePlatforms: string[],
  config: LashConfig,
): string {
  const overrides = config.platform_overrides ?? {};

  // Check for per-module override (pass module_id as string if checking by name)
  if (typeof moduleIndex === 'string' && moduleIndex in overrides) {
    return overrides[moduleIndex];
  }

  // Round-robin assignment
  if (availablePlatforms.length === 0) {
    throw new Error('No available platforms');
  }

  const idx = typeof moduleIndex === 'number' ? moduleIndex : 0;
  return availablePlatforms[idx % availablePlatforms.length];
}
