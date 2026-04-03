/**
 * Tests for src/lash/config.ts
 * Covers config loading, merging, and platform assignment logic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, assignPlatform } from '../src/lash/config.js';
import type { LashConfig } from '../src/lash/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testTempDir = join(__dirname, '.config-test-temp');

describe('loadConfig', () => {
  beforeEach(() => {
    // Create temp directory for test files
    mkdirSync(testTempDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup temp directory
    try {
      rmSync(testTempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(join(testTempDir, 'nonexistent.json'));

    expect(config.platforms).toEqual(['claude-code', 'codex', 'opencode']);
    expect(config.platform_assignment).toBe('round-robin');
    expect(config.platform_overrides).toBeNull();
    expect(config.critic_platform).toBeNull();
    expect(config.max_concurrency).toBeNull();
    expect(config.heartbeat_timeout).toBe(300);
    expect(config.graceful_shutdown_seconds).toBe(10);
    expect(config.max_retries_per_module).toBe(3);
    expect(config.max_critic_rounds).toBe(2);
    expect(config.max_approach_resets).toBe(2);
  });

  it('loads and merges user config from file', () => {
    const configPath = join(testTempDir, 'lash.config.json');
    const userConfig = {
      platforms: ['custom-platform'],
      heartbeat_timeout: 600,
      max_concurrency: 4,
    };

    writeFileSync(configPath, JSON.stringify(userConfig));

    const config = loadConfig(configPath);

    // User values override defaults
    expect(config.platforms).toEqual(['custom-platform']);
    expect(config.heartbeat_timeout).toBe(600);
    expect(config.max_concurrency).toBe(4);

    // Other defaults remain unchanged
    expect(config.platform_assignment).toBe('round-robin');
    expect(config.graceful_shutdown_seconds).toBe(10);
  });

  it('merges all fields correctly', () => {
    const configPath = join(testTempDir, 'lash.config.json');
    const userConfig: Partial<LashConfig> = {
      platforms: ['platform-a', 'platform-b'],
      platform_assignment: 'manual',
      platform_overrides: {
        'module-1': 'platform-a',
        'module-2': 'platform-b',
      },
      critic_platform: 'platform-a',
      max_concurrency: 8,
      heartbeat_timeout: 500,
      graceful_shutdown_seconds: 20,
      max_retries_per_module: 5,
      max_critic_rounds: 3,
      max_approach_resets: 4,
    };

    writeFileSync(configPath, JSON.stringify(userConfig));

    const config = loadConfig(configPath);

    expect(config.platforms).toEqual(['platform-a', 'platform-b']);
    expect(config.platform_assignment).toBe('manual');
    expect(config.platform_overrides).toEqual({
      'module-1': 'platform-a',
      'module-2': 'platform-b',
    });
    expect(config.critic_platform).toBe('platform-a');
    expect(config.max_concurrency).toBe(8);
    expect(config.heartbeat_timeout).toBe(500);
    expect(config.graceful_shutdown_seconds).toBe(20);
    expect(config.max_retries_per_module).toBe(5);
    expect(config.max_critic_rounds).toBe(3);
    expect(config.max_approach_resets).toBe(4);
  });

  it('handles malformed JSON gracefully, returns defaults', () => {
    const configPath = join(testTempDir, 'bad.json');
    writeFileSync(configPath, 'not valid json {{{');

    const config = loadConfig(configPath);

    // Should return defaults when JSON is invalid
    expect(config.platforms).toEqual(['claude-code', 'codex', 'opencode']);
    expect(config.heartbeat_timeout).toBe(300);
  });

  it('handles partial config file', () => {
    const configPath = join(testTempDir, 'partial.json');
    const partialConfig = {
      max_retries_per_module: 10,
    };

    writeFileSync(configPath, JSON.stringify(partialConfig));

    const config = loadConfig(configPath);

    // Override applied
    expect(config.max_retries_per_module).toBe(10);

    // Defaults still present for other fields
    expect(config.platforms).toEqual(['claude-code', 'codex', 'opencode']);
    expect(config.heartbeat_timeout).toBe(300);
  });
});

describe('assignPlatform', () => {
  const defaultConfig: LashConfig = {
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

  it('assigns platforms by round-robin with integer index', () => {
    const platforms = ['platform-a', 'platform-b', 'platform-c'];

    expect(assignPlatform(0, platforms, defaultConfig)).toBe('platform-a');
    expect(assignPlatform(1, platforms, defaultConfig)).toBe('platform-b');
    expect(assignPlatform(2, platforms, defaultConfig)).toBe('platform-c');
    expect(assignPlatform(3, platforms, defaultConfig)).toBe('platform-a');
    expect(assignPlatform(4, platforms, defaultConfig)).toBe('platform-b');
  });

  it('respects per-module overrides', () => {
    const config: LashConfig = {
      ...defaultConfig,
      platform_overrides: {
        'special-module': 'custom-platform',
        'another-module': 'different-platform',
      },
    };

    const platforms = ['platform-a', 'platform-b'];

    // Override takes precedence
    expect(assignPlatform('special-module', platforms, config)).toBe(
      'custom-platform',
    );
    expect(assignPlatform('another-module', platforms, config)).toBe(
      'different-platform',
    );

    // Non-override modules use round-robin
    expect(assignPlatform(0, platforms, config)).toBe('platform-a');
    expect(assignPlatform(1, platforms, config)).toBe('platform-b');
  });

  it('handles string module index without override', () => {
    const platforms = ['platform-a', 'platform-b', 'platform-c'];

    // String index without override defaults to index 0
    expect(assignPlatform('any-string', platforms, defaultConfig)).toBe(
      'platform-a',
    );
  });

  it('throws error when no available platforms', () => {
    expect(() => {
      assignPlatform(0, [], defaultConfig);
    }).toThrow('No available platforms');
  });

  it('returns first platform for string index when no overrides', () => {
    const platforms = ['only-platform'];

    expect(assignPlatform('module-id', platforms, defaultConfig)).toBe(
      'only-platform',
    );
  });

  it('handles null platform_overrides', () => {
    const config: LashConfig = {
      ...defaultConfig,
      platform_overrides: null,
    };

    const platforms = ['platform-a'];

    expect(assignPlatform('any-module', platforms, config)).toBe('platform-a');
  });

  it('complex scenario: mixed overrides and round-robin', () => {
    const config: LashConfig = {
      ...defaultConfig,
      platform_overrides: {
        'critical-module': 'critical-platform',
      },
    };

    const platforms = ['p1', 'p2', 'p3'];

    // Override applies
    expect(assignPlatform('critical-module', platforms, config)).toBe(
      'critical-platform',
    );

    // Round-robin for others
    expect(assignPlatform(0, platforms, config)).toBe('p1');
    expect(assignPlatform(1, platforms, config)).toBe('p2');
    expect(assignPlatform(2, platforms, config)).toBe('p3');
    expect(assignPlatform(3, platforms, config)).toBe('p1');

    // String without override defaults to first
    expect(assignPlatform('regular-module', platforms, config)).toBe('p1');
  });
});
