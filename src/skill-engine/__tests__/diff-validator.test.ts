/**
 * Tests for MOD-006: DiffValidator
 * Covers: validateMigrationEquivalence, deleteLegacyAfterValidation
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  validateMigrationEquivalence,
  deleteLegacyAfterValidation,
} from '../diff-validator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(dir: string, name: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content, 'utf-8');
}

afterEach(() => {
  for (const dir of tmpDirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  tmpDirs.length = 0;
});

// ---------------------------------------------------------------------------
// TEST-044: matching files with placeholder-only diffs → passed=true
// ---------------------------------------------------------------------------

describe('validateMigrationEquivalence — placeholder-only diffs', () => {
  it('TEST-044: returns passed=true when diffs are only in platform-specific paths', () => {
    const generatedDir = makeTmpDir('nopilot-dv-gen-');
    const legacyDir = makeTmpDir('nopilot-dv-leg-');

    // Lines with .claude/ path differ (placeholder substitution) — expected
    writeFile(
      generatedDir,
      'skill.md',
      [
        '# Skill',
        'Critic path: /home/user/.claude/skills/critic/SKILL.md',
        'Some shared content here.',
      ].join('\n'),
    );
    writeFile(
      legacyDir,
      'skill.md',
      [
        '# Skill',
        'Critic path: /home/other/.claude/skills/critic/SKILL.md',
        'Some shared content here.',
      ].join('\n'),
    );

    const result = validateMigrationEquivalence(generatedDir, legacyDir);

    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].fileName).toBe('skill.md');
    expect(result.results[0].passed).toBe(true);
    expect(result.results[0].totalDiffLines).toBe(1);
    expect(result.results[0].placeholderDiffLines).toBe(1);
    expect(result.results[0].unexpectedDiffs).toHaveLength(0);
  });

  it('TEST-044b: returns passed=true when files are identical (zero diffs)', () => {
    const generatedDir = makeTmpDir('nopilot-dv-gen-');
    const legacyDir = makeTmpDir('nopilot-dv-leg-');

    const content = '# Skill\nThis is shared content.\nNo platform paths here.\n';
    writeFile(generatedDir, 'readme.md', content);
    writeFile(legacyDir, 'readme.md', content);

    const result = validateMigrationEquivalence(generatedDir, legacyDir);

    expect(result.passed).toBe(true);
    expect(result.results[0].totalDiffLines).toBe(0);
    expect(result.results[0].unexpectedDiffs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TEST-045: non-placeholder diff detected → passed=false
// ---------------------------------------------------------------------------

describe('validateMigrationEquivalence — unexpected diffs', () => {
  it('TEST-045: returns passed=false when a non-placeholder line differs', () => {
    const generatedDir = makeTmpDir('nopilot-dv-gen-');
    const legacyDir = makeTmpDir('nopilot-dv-leg-');

    writeFile(
      generatedDir,
      'skill.md',
      ['# Skill', 'This line is different in generated output.', 'End.'].join('\n'),
    );
    writeFile(
      legacyDir,
      'skill.md',
      ['# Skill', 'This line is the original legacy content.', 'End.'].join('\n'),
    );

    const result = validateMigrationEquivalence(generatedDir, legacyDir);

    expect(result.passed).toBe(false);
    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].unexpectedDiffs).toHaveLength(1);
    expect(result.results[0].unexpectedDiffs[0].line).toBe(2);
    expect(result.results[0].unexpectedDiffs[0].expected).toContain('legacy');
    expect(result.results[0].unexpectedDiffs[0].actual).toContain('generated');
  });

  it('TEST-045b: reports passed=false when .agents/ path and non-placeholder diff both present', () => {
    const generatedDir = makeTmpDir('nopilot-dv-gen-');
    const legacyDir = makeTmpDir('nopilot-dv-leg-');

    writeFile(
      generatedDir,
      'codex.md',
      [
        '# Codex Skill',
        'Path: /home/user/.agents/skills/critic/SKILL.md',
        'Unexpected change here.',
      ].join('\n'),
    );
    writeFile(
      legacyDir,
      'codex.md',
      [
        '# Codex Skill',
        'Path: /home/other/.agents/skills/critic/SKILL.md',
        'Original content here.',
      ].join('\n'),
    );

    const result = validateMigrationEquivalence(generatedDir, legacyDir);

    expect(result.passed).toBe(false);
    expect(result.results[0].totalDiffLines).toBe(2);
    expect(result.results[0].placeholderDiffLines).toBe(1);
    expect(result.results[0].unexpectedDiffs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TEST-046: legacy dir not found → LEGACY_DIR_NOT_FOUND error
// ---------------------------------------------------------------------------

describe('validateMigrationEquivalence — missing legacy dir', () => {
  it('TEST-046: throws LEGACY_DIR_NOT_FOUND when legacyDir does not exist', () => {
    const generatedDir = makeTmpDir('nopilot-dv-gen-');
    const nonExistentDir = path.join(os.tmpdir(), 'nopilot-dv-does-not-exist-12345');

    expect(() => validateMigrationEquivalence(generatedDir, nonExistentDir)).toThrowError(
      expect.objectContaining({ code: 'LEGACY_DIR_NOT_FOUND' }),
    );
  });
});

// ---------------------------------------------------------------------------
// TEST-047: deleteLegacy with passed=true → deletes dir
// ---------------------------------------------------------------------------

describe('deleteLegacyAfterValidation — successful deletion', () => {
  it('TEST-047: deletes legacyDir when validationResult.passed is true', () => {
    const legacyDir = makeTmpDir('nopilot-dv-del-');
    writeFile(legacyDir, 'old-skill.md', '# Old Skill\nLegacy content.\n');
    writeFile(legacyDir, 'another.md', '# Another\nMore legacy.\n');

    expect(fs.existsSync(legacyDir)).toBe(true);

    const result = deleteLegacyAfterValidation(legacyDir, { passed: true });

    expect(result.deleted).toBe(true);
    expect(result.filesRemoved).toBe(2);
    expect(fs.existsSync(legacyDir)).toBe(false);
  });

  it('TEST-047b: returns filesRemoved=0 and deleted=true for an empty directory', () => {
    const legacyDir = makeTmpDir('nopilot-dv-empty-');

    const result = deleteLegacyAfterValidation(legacyDir, { passed: true });

    expect(result.deleted).toBe(true);
    expect(result.filesRemoved).toBe(0);
    expect(fs.existsSync(legacyDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TEST-048: deleteLegacy with passed=false → VALIDATION_NOT_PASSED error
// ---------------------------------------------------------------------------

describe('deleteLegacyAfterValidation — validation not passed', () => {
  it('TEST-048: throws VALIDATION_NOT_PASSED when validationResult.passed is false', () => {
    const legacyDir = makeTmpDir('nopilot-dv-keep-');
    writeFile(legacyDir, 'skill.md', '# Keep me\n');

    expect(() =>
      deleteLegacyAfterValidation(legacyDir, { passed: false }),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_NOT_PASSED' }));

    // Directory should still exist
    expect(fs.existsSync(legacyDir)).toBe(true);
  });
});
