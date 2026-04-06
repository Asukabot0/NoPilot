/**
 * Tests for MOD-003: SkillInstaller
 * Covers: scanSourceSkills, installAllPlatforms
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { scanSourceSkills, installAllPlatforms } from '../skill-installer.js';
import type { PlatformAdapter } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeTmpDir(suffix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nopilot-si-${suffix}-`));
}

/** Write a file, creating parent dirs as needed */
function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

/** Build a minimal PlatformAdapter pointing to a temp skillsDir */
function makePlatform(
  name: 'claude' | 'codex' | 'gemini' | 'opencode',
  skillsDir: string,
  placeholderMap: Record<string, string> = {},
): PlatformAdapter {
  return {
    name,
    status: 'active',
    skillsDir,
    legacyDir: null,
    placeholderMap,
  };
}

beforeEach(() => {
  tmpDir = makeTmpDir('root');
});

afterEach(() => {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// TEST-018: scanSourceSkills discovers directory + single-file skills
// ---------------------------------------------------------------------------

describe('scanSourceSkills', () => {
  it('TEST-018: discovers directory skill and single-file skill', () => {
    const sourceDir = path.join(tmpDir, 'source');

    // Directory skill: discover/SKILL.md
    writeFile(path.join(sourceDir, 'discover', 'SKILL.md'), '# Discover');

    // Single-file skill: lash-batch.md
    writeFile(path.join(sourceDir, 'lash-batch.md'), '# Lash Batch');

    // Non-skill directory (no SKILL.md) — should be skipped
    writeFile(path.join(sourceDir, 'not-a-skill', 'README.md'), '# ignored');

    // Non-.md file at top level — should be skipped
    writeFile(path.join(sourceDir, 'config.json'), '{}');

    const skills = scanSourceSkills(sourceDir);

    const names = skills.map((s) => s.name);
    expect(names).toContain('discover');
    expect(names).toContain('lash-batch');
    expect(names).not.toContain('not-a-skill');
    expect(names).not.toContain('config');

    const dir = skills.find((s) => s.name === 'discover')!;
    expect(dir.type).toBe('directory');
    expect(dir.files).toContain('SKILL.md');

    const single = skills.find((s) => s.name === 'lash-batch')!;
    expect(single.type).toBe('single-file');
    expect(single.files).toContain('lash-batch.md');
  });
});

// ---------------------------------------------------------------------------
// TEST-019: installAllPlatforms generates files for claude + codex
// ---------------------------------------------------------------------------

describe('installAllPlatforms — basic install', () => {
  it('TEST-019: installs skills for claude and codex into their skillsDirs', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const claudeSkillsDir = path.join(tmpDir, 'claude-skills');
    const codexSkillsDir = path.join(tmpDir, 'codex-skills');

    const criticPathClaude = path.join(claudeSkillsDir, 'critic', 'SKILL.md');
    const criticPathCodex = path.join(codexSkillsDir, 'critic', 'SKILL.md');

    // Directory skill with a placeholder
    writeFile(
      path.join(sourceDir, 'discover', 'SKILL.md'),
      '# Discover\nCritic: <%= CRITIC_PATH %>',
    );

    // Single-file skill with no placeholders
    writeFile(path.join(sourceDir, 'lash-batch.md'), '# Lash Batch');

    const platforms: PlatformAdapter[] = [
      makePlatform('claude', claudeSkillsDir, { CRITIC_PATH: criticPathClaude }),
      makePlatform('codex', codexSkillsDir, { CRITIC_PATH: criticPathCodex }),
    ];

    const results = installAllPlatforms(sourceDir, false, platforms);

    expect(results).toHaveLength(2);

    // Both platforms succeed
    for (const r of results) {
      expect(r.success).toBe(true);
      expect(r.errors).toHaveLength(0);
      expect(r.filesWritten).toBe(2);
    }

    // Claude output
    const claudeDiscoverPath = path.join(claudeSkillsDir, 'discover', 'SKILL.md');
    expect(fs.existsSync(claudeDiscoverPath)).toBe(true);
    expect(fs.readFileSync(claudeDiscoverPath, 'utf-8')).toContain(criticPathClaude);

    const claudeLashPath = path.join(claudeSkillsDir, 'lash-batch', 'SKILL.md');
    expect(fs.existsSync(claudeLashPath)).toBe(true);

    // Codex output
    const codexDiscoverPath = path.join(codexSkillsDir, 'discover', 'SKILL.md');
    expect(fs.existsSync(codexDiscoverPath)).toBe(true);
    expect(fs.readFileSync(codexDiscoverPath, 'utf-8')).toContain(criticPathCodex);
  });
});

// ---------------------------------------------------------------------------
// TEST-020: installAllPlatforms template error → stops that platform
// ---------------------------------------------------------------------------

describe('installAllPlatforms — template error', () => {
  it('TEST-020: stops platform on UNDEFINED_VARIABLE and marks success=false', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const claudeSkillsDir = path.join(tmpDir, 'claude-skills');

    // Skill that references a variable missing from placeholderMap
    writeFile(
      path.join(sourceDir, 'bad-skill', 'SKILL.md'),
      '# Bad\nRef: <%= MISSING_VAR %>',
    );

    // Second skill that would otherwise succeed
    writeFile(path.join(sourceDir, 'good-skill.md'), '# Good');

    const platforms: PlatformAdapter[] = [
      makePlatform('claude', claudeSkillsDir, {}), // no MISSING_VAR
    ];

    const results = installAllPlatforms(sourceDir, false, platforms);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.length).toBeGreaterThan(0);
    expect(results[0].errors[0]).toMatch(/MISSING_VAR/i);
  });
});

// ---------------------------------------------------------------------------
// TEST-022: installAllPlatforms doesn't create experimental platform dirs
// ---------------------------------------------------------------------------

describe('installAllPlatforms — experimental platforms excluded', () => {
  it('TEST-022: only installs to platforms passed in; experimental dirs not created', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const claudeSkillsDir = path.join(tmpDir, 'claude-skills');
    const geminiSkillsDir = path.join(tmpDir, 'gemini-skills');

    writeFile(path.join(sourceDir, 'simple.md'), '# Simple');

    // Only pass active claude platform (simulates getActivePlatforms not returning gemini)
    const platforms: PlatformAdapter[] = [
      makePlatform('claude', claudeSkillsDir, {}),
    ];

    installAllPlatforms(sourceDir, false, platforms);

    // Gemini dir was never created
    expect(fs.existsSync(geminiSkillsDir)).toBe(false);
    // Claude dir was created
    expect(fs.existsSync(path.join(claudeSkillsDir, 'simple', 'SKILL.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEST-023: installAllPlatforms preserves directory structure for directory skills
// ---------------------------------------------------------------------------

describe('installAllPlatforms — directory structure', () => {
  it('TEST-023: preserves all .md files from a directory skill', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const claudeSkillsDir = path.join(tmpDir, 'claude-skills');

    // Directory skill with multiple .md files
    writeFile(path.join(sourceDir, 'multi-skill', 'SKILL.md'), '# Main');
    writeFile(path.join(sourceDir, 'multi-skill', 'GUIDE.md'), '# Guide');
    writeFile(path.join(sourceDir, 'multi-skill', 'REFERENCE.md'), '# Reference');

    const platforms: PlatformAdapter[] = [
      makePlatform('claude', claudeSkillsDir, {}),
    ];

    const results = installAllPlatforms(sourceDir, false, platforms);

    expect(results[0].success).toBe(true);
    expect(results[0].filesWritten).toBe(3);

    expect(fs.existsSync(path.join(claudeSkillsDir, 'multi-skill', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(claudeSkillsDir, 'multi-skill', 'GUIDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(claudeSkillsDir, 'multi-skill', 'REFERENCE.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEST-024: installAllPlatforms skips platforms sharing skillsDir
// ---------------------------------------------------------------------------

describe('installAllPlatforms — shared directory deduplication', () => {
  it('TEST-024: skips installation for second platform sharing same skillsDir', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const sharedSkillsDir = path.join(tmpDir, 'shared-skills');

    writeFile(path.join(sourceDir, 'simple.md'), '# Simple');

    const platforms: PlatformAdapter[] = [
      makePlatform('codex', sharedSkillsDir, {}),
      makePlatform('opencode', sharedSkillsDir, {}),
    ];

    const results = installAllPlatforms(sourceDir, false, platforms);

    expect(results).toHaveLength(2);

    // First platform installs
    expect(results[0].platform).toBe('codex');
    expect(results[0].success).toBe(true);
    expect(results[0].filesWritten).toBe(1);
    expect(results[0].skipped).toBe(false);

    // Second platform skipped
    expect(results[1].platform).toBe('opencode');
    expect(results[1].success).toBe(true);
    expect(results[1].filesWritten).toBe(0);
    expect(results[1].skipped).toBe(true);
  });
});
