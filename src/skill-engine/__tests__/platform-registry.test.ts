/**
 * Tests for MOD-002: PlatformRegistry
 * Covers: getActivePlatforms, getPlatform, validateMappingCompleteness
 */
import { describe, it, expect } from 'vitest';
import * as os from 'node:os';

import {
  getActivePlatforms,
  getPlatform,
  validateMappingCompleteness,
} from '../platform-registry.js';

const home = os.homedir();

describe('getActivePlatforms', () => {
  it('TEST-011: returns claude, codex, and opencode (active platforms)', () => {
    const active = getActivePlatforms();
    const names = active.map((p) => p.name);
    expect(names).toContain('claude');
    expect(names).toContain('codex');
    expect(names).toContain('opencode');
    expect(names).not.toContain('gemini');
    expect(active.every((p) => p.status === 'active')).toBe(true);
    expect(active).toHaveLength(3);
  });
});

describe('getPlatform', () => {
  it('TEST-012: returns full config for claude', () => {
    const platform = getPlatform('claude');
    expect(platform).toBeDefined();
    expect(platform!.name).toBe('claude');
    expect(platform!.status).toBe('active');
    expect(platform!.skillsDir).toBe(`${home}/.claude/skills/`);
    expect(platform!.legacyDir).toBe(`${home}/.claude/commands/`);
    expect(platform!.placeholderMap['CRITIC_PATH']).toBe(
      `${home}/.claude/skills/critic/SKILL.md`,
    );
    expect(platform!.placeholderMap['SUPERVISOR_PATH']).toBe(
      `${home}/.claude/skills/supervisor/SKILL.md`,
    );
  });

  it('TEST-013: returns config for codex with .agents/skills path', () => {
    const platform = getPlatform('codex');
    expect(platform).toBeDefined();
    expect(platform!.name).toBe('codex');
    expect(platform!.status).toBe('active');
    expect(platform!.skillsDir).toBe(`${home}/.agents/skills/`);
    expect(platform!.legacyDir).toBe(`${home}/.codex/prompts/`);
    expect(platform!.placeholderMap['CRITIC_PATH']).toBe(
      `${home}/.agents/skills/critic/SKILL.md`,
    );
    expect(platform!.placeholderMap['SUPERVISOR_PATH']).toBe(
      `${home}/.agents/skills/supervisor/SKILL.md`,
    );
  });

  it('TEST-014: returns experimental status for gemini', () => {
    const platform = getPlatform('gemini');
    expect(platform).toBeDefined();
    expect(platform!.name).toBe('gemini');
    expect(platform!.status).toBe('experimental');
    expect(platform!.legacyDir).toBeNull();
    expect(platform!.placeholderMap).toEqual({});
  });

  it('TEST-015: returns undefined for nonexistent platform', () => {
    const platform = getPlatform('nonexistent');
    expect(platform).toBeUndefined();
  });

  it('TEST-016: returns correct config for opencode', () => {
    const platform = getPlatform('opencode');
    expect(platform).toBeDefined();
    expect(platform!.name).toBe('opencode');
    expect(platform!.status).toBe('active');
    expect(platform!.skillsDir).toBe(`${home}/.agents/skills/`);
    expect(platform!.legacyDir).toBeNull();
    expect(platform!.placeholderMap['CRITIC_PATH']).toBe(
      `${home}/.agents/skills/critic/SKILL.md`,
    );
    expect(platform!.placeholderMap['SUPERVISOR_PATH']).toBe(
      `${home}/.agents/skills/supervisor/SKILL.md`,
    );
  });
});

describe('validateMappingCompleteness', () => {
  it('TEST-017: valid when all required variables are mapped', () => {
    const platform = getPlatform('claude')!;
    const result = validateMappingCompleteness(platform, ['CRITIC_PATH', 'SUPERVISOR_PATH']);
    expect(result.valid).toBe(true);
    expect(result.missingKeys).toEqual([]);
  });

  it('TEST-018: invalid when a required key is missing', () => {
    const platform = getPlatform('gemini')!;
    const result = validateMappingCompleteness(platform, ['CRITIC_PATH', 'SUPERVISOR_PATH']);
    expect(result.valid).toBe(false);
    expect(result.missingKeys).toContain('CRITIC_PATH');
    expect(result.missingKeys).toContain('SUPERVISOR_PATH');
  });
});
