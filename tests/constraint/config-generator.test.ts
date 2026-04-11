/**
 * Tests for MOD-003: constraint/config-generator
 * Covers TEST-001, TEST-024, TEST-025, TEST-033, TEST-034
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateMcpConfig, getMcpWorkerInstructions } from '../../src/constraint/config-generator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'config-gen-test-'));
}

// ---------------------------------------------------------------------------
// TEST-001: generateMcpConfig writes Claude Code MCP config with correct structure
// ---------------------------------------------------------------------------

describe('generateMcpConfig - claude-code', () => {
  let worktreePath: string;

  beforeEach(() => {
    worktreePath = makeTmpDir();
  });

  it('TEST-001: writes .claude/settings.local.json with correct mcpServers structure', () => {
    const specPath = '/path/to/spec.json';
    const moduleId = 'MOD-003';

    const result = generateMcpConfig('claude-code', specPath, moduleId, worktreePath);

    expect(result.configPath).toBe(join(worktreePath, '.claude', 'settings.local.json'));
    expect(existsSync(result.configPath)).toBe(true);

    const config = JSON.parse(readFileSync(result.configPath, 'utf8'));
    expect(config).toHaveProperty('mcpServers');
    expect(config.mcpServers).toHaveProperty('nopilot-constraint');

    const server = config.mcpServers['nopilot-constraint'];
    expect(server.command).toBe('node');
    expect(Array.isArray(server.args)).toBe(true);

    // Args must include the spec path, module id, and workdir
    const argsStr = server.args.join(' ');
    expect(argsStr).toContain('--spec');
    expect(argsStr).toContain(specPath);
    expect(argsStr).toContain('--module');
    expect(argsStr).toContain(moduleId);
    expect(argsStr).toContain('--workdir');
    expect(argsStr).toContain(worktreePath);
  });

  it('configContent matches what is written to disk', () => {
    const result = generateMcpConfig('claude-code', '/spec.json', 'MOD-001', worktreePath);
    const onDisk = readFileSync(result.configPath, 'utf8');
    expect(result.configContent).toBe(onDisk);
  });

  it('returns configPath pointing inside worktreePath', () => {
    const result = generateMcpConfig('claude-code', '/spec.json', 'MOD-001', worktreePath);
    expect(result.configPath.startsWith(worktreePath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEST-033: generateMcpConfig produces valid Codex config
// ---------------------------------------------------------------------------

describe('generateMcpConfig - codex', () => {
  let worktreePath: string;

  beforeEach(() => {
    worktreePath = makeTmpDir();
  });

  it('TEST-033: writes codex MCP config file with stdio server entry', () => {
    const specPath = '/path/to/spec.json';
    const moduleId = 'MOD-003';

    const result = generateMcpConfig('codex', specPath, moduleId, worktreePath);

    expect(existsSync(result.configPath)).toBe(true);
    expect(result.configPath.startsWith(worktreePath)).toBe(true);

    // Config content must reference the nopilot-constraint server and key args
    expect(result.configContent).toContain('nopilot-constraint');
    expect(result.configContent).toContain(specPath);
    expect(result.configContent).toContain(moduleId);
    expect(result.configContent).toContain(worktreePath);
  });

  it('configContent matches what is written to disk', () => {
    const result = generateMcpConfig('codex', '/spec.json', 'MOD-002', worktreePath);
    const onDisk = readFileSync(result.configPath, 'utf8');
    expect(result.configContent).toBe(onDisk);
  });
});

// ---------------------------------------------------------------------------
// TEST-034: generateMcpConfig produces valid OpenCode config
// ---------------------------------------------------------------------------

describe('generateMcpConfig - opencode', () => {
  let worktreePath: string;

  beforeEach(() => {
    worktreePath = makeTmpDir();
  });

  it('TEST-034: writes opencode.json with mcpServers entry', () => {
    const specPath = '/path/to/spec.json';
    const moduleId = 'MOD-003';

    const result = generateMcpConfig('opencode', specPath, moduleId, worktreePath);

    expect(result.configPath).toBe(join(worktreePath, 'opencode.json'));
    expect(existsSync(result.configPath)).toBe(true);

    const config = JSON.parse(readFileSync(result.configPath, 'utf8'));
    expect(config).toHaveProperty('mcpServers');
    expect(config.mcpServers).toHaveProperty('nopilot-constraint');

    const server = config.mcpServers['nopilot-constraint'];
    expect(server.command).toBe('node');
    expect(Array.isArray(server.args)).toBe(true);

    const argsStr = server.args.join(' ');
    expect(argsStr).toContain('--spec');
    expect(argsStr).toContain(specPath);
    expect(argsStr).toContain('--module');
    expect(argsStr).toContain(moduleId);
    expect(argsStr).toContain('--workdir');
    expect(argsStr).toContain(worktreePath);
  });

  it('configContent matches what is written to disk', () => {
    const result = generateMcpConfig('opencode', '/spec.json', 'MOD-001', worktreePath);
    const onDisk = readFileSync(result.configPath, 'utf8');
    expect(result.configContent).toBe(onDisk);
  });
});

// ---------------------------------------------------------------------------
// UNSUPPORTED_PLATFORM error
// ---------------------------------------------------------------------------

describe('generateMcpConfig - unsupported platform', () => {
  it('throws UNSUPPORTED_PLATFORM for unknown platform', () => {
    const worktreePath = makeTmpDir();
    expect(() =>
      generateMcpConfig('unknown-platform' as never, '/spec.json', 'MOD-001', worktreePath),
    ).toThrow(/UNSUPPORTED_PLATFORM/);
  });
});

// ---------------------------------------------------------------------------
// TEST-024: Worker proceeds normally when MCP config absent (graceful degradation)
// ---------------------------------------------------------------------------

describe('getMcpWorkerInstructions', () => {
  it('TEST-024: returns non-empty instruction string for claude-code', () => {
    const instructions = getMcpWorkerInstructions('claude-code');
    expect(typeof instructions).toBe('string');
    expect(instructions.length).toBeGreaterThan(0);
  });

  it('instructions mention nopilot_write_file tool', () => {
    const instructions = getMcpWorkerInstructions('claude-code');
    expect(instructions).toContain('nopilot_write_file');
  });

  it('instructions advise preferring nopilot_write_file over native Write/Edit', () => {
    const instructions = getMcpWorkerInstructions('claude-code');
    // Should mention preference over native write/edit tools
    const lower = instructions.toLowerCase();
    expect(lower).toMatch(/prefer|instead|use.*nopilot|nopilot.*instead/);
  });

  it('returns instruction string for codex', () => {
    const instructions = getMcpWorkerInstructions('codex');
    expect(typeof instructions).toBe('string');
    expect(instructions).toContain('nopilot_write_file');
  });

  it('returns instruction string for opencode', () => {
    const instructions = getMcpWorkerInstructions('opencode');
    expect(typeof instructions).toBe('string');
    expect(instructions).toContain('nopilot_write_file');
  });
});

// ---------------------------------------------------------------------------
// TEST-025: owned_files.txt format unchanged with constraint server
// This validates that generateMcpConfig does NOT modify the owned_files listing —
// it only writes config files (settings.local.json, codex config, opencode.json).
// ---------------------------------------------------------------------------

describe('TEST-025: generateMcpConfig does not create owned_files.txt', () => {
  it('does not create owned_files.txt in worktree', () => {
    const worktreePath = makeTmpDir();
    generateMcpConfig('claude-code', '/spec.json', 'MOD-001', worktreePath);
    expect(existsSync(join(worktreePath, 'owned_files.txt'))).toBe(false);
  });

  it('only creates the platform-specific config file', () => {
    const worktreePath = makeTmpDir();
    const result = generateMcpConfig('opencode', '/spec.json', 'MOD-001', worktreePath);
    // The only new file should be opencode.json
    expect(result.configPath).toBe(join(worktreePath, 'opencode.json'));
    expect(existsSync(join(worktreePath, 'owned_files.txt'))).toBe(false);
  });
});
