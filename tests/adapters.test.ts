/**
 * Tests for Issue #90: PlatformAdapter — engine, adapters, and registry.
 * Pure-function tests — no child_process mocks needed.
 */
import { describe, it, expect } from 'vitest';

import { interpolateCmd, buildSpawnCommand, buildResumeCommand, buildProbeCommand } from '../src/lash/adapters/engine.js';
import { getAdapter, hasAdapter, registerAdapter } from '../src/lash/adapters/registry.js';
import { claudeCodeAdapter } from '../src/lash/adapters/claude-code.js';
import { codexAdapter } from '../src/lash/adapters/codex.js';
import { opencodeAdapter } from '../src/lash/adapters/opencode.js';
import type { PlatformAdapter } from '../src/lash/types.js';

// ---------------------------------------------------------------------------
// Engine: interpolateCmd
// ---------------------------------------------------------------------------
describe('interpolateCmd', () => {
  it('replaces single placeholder', () => {
    expect(interpolateCmd(['{task}'], { task: 'hello' })).toEqual(['hello']);
  });

  it('replaces multiple placeholders in one arg', () => {
    expect(interpolateCmd(['{a}-{b}'], { a: 'x', b: 'y' })).toEqual(['x-y']);
  });

  it('replaces placeholders across multiple args', () => {
    expect(interpolateCmd(['claude', '-p', '{task}', '--id', '{sessionId}'], {
      task: 'fix bug',
      sessionId: 'sess-1',
    })).toEqual(['claude', '-p', 'fix bug', '--id', 'sess-1']);
  });

  it('leaves unknown placeholders as-is', () => {
    expect(interpolateCmd(['{unknown}'], {})).toEqual(['{unknown}']);
  });

  it('handles empty template', () => {
    expect(interpolateCmd([], { task: 'hello' })).toEqual([]);
  });

  it('handles args without placeholders', () => {
    expect(interpolateCmd(['--flag', 'value'], { task: 'hello' })).toEqual(['--flag', 'value']);
  });

  it('handles undefined values — leaves placeholder', () => {
    expect(interpolateCmd(['{task}'], { task: undefined })).toEqual(['{task}']);
  });
});

// ---------------------------------------------------------------------------
// Engine: buildSpawnCommand
// ---------------------------------------------------------------------------
describe('buildSpawnCommand', () => {
  it('claude-code: basic spawn without optional args', () => {
    const cmd = buildSpawnCommand(claudeCodeAdapter, 'implement feature', {
      sessionId: 'sess-abc',
      instructionFile: null,
    });
    expect(cmd).toEqual([
      'claude', '-p', 'implement feature', '--session-id', 'sess-abc',
      '--permission-mode', 'bypassPermissions',
    ]);
  });

  it('claude-code: with instruction file', () => {
    const cmd = buildSpawnCommand(claudeCodeAdapter, 'task', {
      sessionId: 'sess-1',
      instructionFile: '.lash/worker-instructions.md',
    });
    expect(cmd).toContain('--append-system-prompt-file');
    expect(cmd).toContain('.lash/worker-instructions.md');
  });

  it('claude-code: with maxBudgetUsd', () => {
    const cmd = buildSpawnCommand(claudeCodeAdapter, 'task', {
      sessionId: 'sess-1',
      instructionFile: null,
      maxBudgetUsd: 5.0,
    });
    expect(cmd).toContain('--max-budget-usd');
    expect(cmd).toContain('5');
  });

  it('claude-code: with both optional args', () => {
    const cmd = buildSpawnCommand(claudeCodeAdapter, 'task', {
      sessionId: 'sess-1',
      instructionFile: 'instr.md',
      maxBudgetUsd: 3,
    });
    expect(cmd).toContain('--append-system-prompt-file');
    expect(cmd).toContain('instr.md');
    expect(cmd).toContain('--max-budget-usd');
    expect(cmd).toContain('3');
  });

  it('codex: basic spawn', () => {
    const cmd = buildSpawnCommand(codexAdapter, 'fix bug', {
      sessionId: 'sess-2',
      instructionFile: null,
    });
    expect(cmd).toEqual(['codex', 'exec', '-c', 'approval_policy=auto-edit', 'fix bug']);
  });

  it('codex: ignores maxBudgetUsd silently (no optionalSpawnArgs)', () => {
    const cmd = buildSpawnCommand(codexAdapter, 'task', {
      sessionId: 'sess-2',
      instructionFile: null,
      maxBudgetUsd: 5.0,
    });
    expect(cmd).not.toContain('--max-budget-usd');
  });

  it('codex: ignores instructionFile silently', () => {
    const cmd = buildSpawnCommand(codexAdapter, 'task', {
      sessionId: 'sess-2',
      instructionFile: 'instr.md',
    });
    expect(cmd).not.toContain('--append-system-prompt-file');
  });

  it('opencode: basic spawn', () => {
    const cmd = buildSpawnCommand(opencodeAdapter, 'refactor Z', {
      sessionId: 'sess-3',
      instructionFile: null,
    });
    expect(cmd).toEqual(['opencode', 'run', 'refactor Z', '--agent', 'coder']);
  });
});

// ---------------------------------------------------------------------------
// Engine: buildResumeCommand
// ---------------------------------------------------------------------------
describe('buildResumeCommand', () => {
  it('claude-code: cli-args mode', () => {
    const result = buildResumeCommand(claudeCodeAdapter, 'sess-abc', 'fix the error');
    expect(result.mode).toBe('cli-args');
    expect(result.cmd).toEqual(['claude', '--resume', 'sess-abc', '-p', 'fix the error']);
  });

  it('codex: stdin mode', () => {
    const result = buildResumeCommand(codexAdapter, 'sess-2', 'retry');
    expect(result.mode).toBe('stdin');
    expect(result.cmd).toEqual(['codex', 'exec', 'resume', '--last']);
  });

  it('opencode: cli-args mode with session', () => {
    const result = buildResumeCommand(opencodeAdapter, 'sess-3', 'some feedback');
    expect(result.mode).toBe('cli-args');
    expect(result.cmd).toEqual(['opencode', 'run', 'some feedback', '--session', 'sess-3']);
  });
});

// ---------------------------------------------------------------------------
// Engine: buildProbeCommand
// ---------------------------------------------------------------------------
describe('buildProbeCommand', () => {
  it('claude-code: includes session id', () => {
    const cmd = buildProbeCommand(claudeCodeAdapter, 'sess-abc');
    expect(cmd).toEqual([
      'claude', '--resume', 'sess-abc', '-p', 'heartbeat probe: please respond',
    ]);
  });

  it('codex: ignores session id (uses --last)', () => {
    const cmd = buildProbeCommand(codexAdapter, 'sess-2');
    expect(cmd).toEqual(['codex', 'exec', 'resume', '--last']);
  });

  it('opencode: includes session id', () => {
    const cmd = buildProbeCommand(opencodeAdapter, 'sess-3');
    expect(cmd).toEqual([
      'opencode', 'run', 'heartbeat probe: please respond', '--session', 'sess-3',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
describe('registry', () => {
  it('getAdapter returns registered adapters', () => {
    expect(getAdapter('claude-code')).toBe(claudeCodeAdapter);
    expect(getAdapter('codex')).toBe(codexAdapter);
    expect(getAdapter('opencode')).toBe(opencodeAdapter);
  });

  it('getAdapter throws on unknown platform', () => {
    expect(() => getAdapter('unknown')).toThrow('Unknown platform: unknown');
  });

  it('hasAdapter returns true for registered', () => {
    expect(hasAdapter('claude-code')).toBe(true);
    expect(hasAdapter('codex')).toBe(true);
    expect(hasAdapter('opencode')).toBe(true);
  });

  it('hasAdapter returns false for unknown', () => {
    expect(hasAdapter('unknown')).toBe(false);
  });

  it('registerAdapter + getAdapter round-trip', () => {
    const testAdapter: PlatformAdapter = {
      name: 'test-platform' as 'claude-code',  // cast for test only
      binary: 'test-bin',
      versionArgs: ['test-bin', '--version'],
      authProbeArgs: ['test-bin', '--version'],
      spawnArgs: ['test-bin', 'run', '{task}'],
      resumeArgs: ['test-bin', 'resume', '{sessionId}'],
      resumeMode: 'cli-args',
      probeArgs: ['test-bin', 'probe'],
      integrationText: '## Test Platform\n',
    };
    registerAdapter(testAdapter);
    expect(getAdapter('test-platform')).toBe(testAdapter);
    expect(hasAdapter('test-platform')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Adapter capability tests (implicit via optionalSpawnArgs)
// ---------------------------------------------------------------------------
describe('adapter capabilities', () => {
  it('claude-code supports budget control', () => {
    expect(claudeCodeAdapter.optionalSpawnArgs?.maxBudgetUsd).toBeDefined();
  });

  it('claude-code supports instruction file', () => {
    expect(claudeCodeAdapter.optionalSpawnArgs?.instructionFile).toBeDefined();
  });

  it('codex does NOT support budget control', () => {
    expect(codexAdapter.optionalSpawnArgs?.maxBudgetUsd).toBeUndefined();
  });

  it('codex does NOT support instruction file', () => {
    expect(codexAdapter.optionalSpawnArgs?.instructionFile).toBeUndefined();
  });

  it('opencode does NOT support budget control', () => {
    expect(opencodeAdapter.optionalSpawnArgs?.maxBudgetUsd).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Adapter resume mode tests
// ---------------------------------------------------------------------------
describe('adapter resume modes', () => {
  it('claude-code: cli-args', () => {
    expect(claudeCodeAdapter.resumeMode).toBe('cli-args');
  });

  it('codex: stdin', () => {
    expect(codexAdapter.resumeMode).toBe('stdin');
  });

  it('opencode: cli-args', () => {
    expect(opencodeAdapter.resumeMode).toBe('cli-args');
  });
});

// ---------------------------------------------------------------------------
// Adapter data correctness
// ---------------------------------------------------------------------------
describe('adapter binary and version', () => {
  it('claude-code binary is claude', () => {
    expect(claudeCodeAdapter.binary).toBe('claude');
    expect(claudeCodeAdapter.versionArgs[0]).toBe('claude');
  });

  it('codex binary is codex', () => {
    expect(codexAdapter.binary).toBe('codex');
    expect(codexAdapter.versionArgs[0]).toBe('codex');
  });

  it('opencode binary is opencode', () => {
    expect(opencodeAdapter.binary).toBe('opencode');
    expect(opencodeAdapter.versionArgs[0]).toBe('opencode');
  });
});
