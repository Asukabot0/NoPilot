/**
 * MOD-002: PlatformRegistry for the Universal Skill Engine.
 * Defines all supported AI coding platforms and their adapter configurations.
 */
import * as os from 'node:os';

import type { PlatformAdapter } from './types.js';

const home = os.homedir();

const PLATFORMS: PlatformAdapter[] = [
  {
    name: 'claude',
    status: 'active',
    skillsDir: `${home}/.claude/skills/`,
    legacyDir: `${home}/.claude/commands/`,
    placeholderMap: {
      CRITIC_PATH: `${home}/.claude/skills/critic/SKILL.md`,
      SUPERVISOR_PATH: `${home}/.claude/skills/supervisor/SKILL.md`,
    },
  },
  {
    name: 'codex',
    status: 'active',
    skillsDir: `${home}/.agents/skills/`,
    legacyDir: `${home}/.codex/prompts/`,
    placeholderMap: {
      CRITIC_PATH: `${home}/.agents/skills/critic/SKILL.md`,
      SUPERVISOR_PATH: `${home}/.agents/skills/supervisor/SKILL.md`,
    },
  },
  {
    name: 'gemini',
    status: 'experimental',
    skillsDir: `${home}/.gemini/skills/`,
    legacyDir: null,
    placeholderMap: {},
  },
  {
    name: 'opencode',
    status: 'experimental',
    skillsDir: `${home}/.config/opencode/skills/`,
    legacyDir: null,
    placeholderMap: {
      CRITIC_PATH: `${home}/.config/opencode/skills/critic/SKILL.md`,
      SUPERVISOR_PATH: `${home}/.config/opencode/skills/supervisor/SKILL.md`,
    },
  },
];

/**
 * Returns only platforms with `active` status.
 */
export function getActivePlatforms(): PlatformAdapter[] {
  return PLATFORMS.filter((p) => p.status === 'active');
}

/**
 * Looks up a platform by name. Returns undefined if not found.
 */
export function getPlatform(name: string): PlatformAdapter | undefined {
  return PLATFORMS.find((p) => p.name === name);
}

/**
 * Validates that all required variable names have entries in the platform's placeholderMap.
 */
export function validateMappingCompleteness(
  platform: PlatformAdapter,
  requiredVariables: string[],
): { valid: boolean; missingKeys: string[] } {
  const missingKeys = requiredVariables.filter((v) => !(v in platform.placeholderMap));
  return { valid: missingKeys.length === 0, missingKeys };
}
