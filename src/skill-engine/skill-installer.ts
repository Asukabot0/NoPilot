/**
 * MOD-003: SkillInstaller for the Universal Skill Engine.
 *
 * Scans source skill directories and installs rendered skill files
 * into each active platform's skillsDir.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { renderSkillFile, validateOutput } from './template-engine.js';
import { getActivePlatforms } from './platform-registry.js';
import type { InstallResult, PlatformAdapter, SourceSkill } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans sourceDir for skill entries:
 * - Subdirectory containing SKILL.md → type=directory (lists all .md files)
 * - Standalone .md file → type=single-file
 * Skips non-.md files and subdirectories that lack SKILL.md.
 */
export function scanSourceSkills(sourceDir: string): SourceSkill[] {
  const results: SourceSkill[] = [];

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const dirPath = path.join(sourceDir, entry.name);
      const skillMd = path.join(dirPath, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;

      // Collect all .md files within the directory
      const mdFiles = fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith('.md'))
        .map((f) => f.name);

      results.push({
        name: entry.name,
        type: 'directory',
        sourcePath: dirPath,
        files: mdFiles,
      });
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const filePath = path.join(sourceDir, entry.name);
      const name = entry.name.slice(0, -3); // strip .md
      results.push({
        name,
        type: 'single-file',
        sourcePath: filePath,
        files: [entry.name],
      });
    }
  }

  return results;
}

/**
 * Installs all source skills into each active platform's skillsDir.
 *
 * Platforms sharing the same skillsDir are deduplicated: only the first
 * platform in iteration order is installed; subsequent platforms with an
 * already-seen skillsDir are skipped (result.skipped = true).
 *
 * For each non-skipped active platform:
 *   1. Scans sourceDir for skills
 *   2. For each skill file, renders with the platform's placeholderMap
 *   3. Validates for residual placeholders (throws RESIDUAL_PLACEHOLDER if invalid)
 *   4. Writes to platform skillsDir preserving directory structure
 *
 * Directory skills → {skillsDir}/{skillName}/{file}
 * Single-file skills → {skillsDir}/{skillName}/SKILL.md
 *
 * On template error for any file, stops that platform immediately.
 *
 * @param sourceDir  Absolute path to the source skills directory
 * @param force      Reserved for future use (overwrite guard)
 * @param platforms  Optional override for the platform list (used in tests)
 */
export function installAllPlatforms(
  sourceDir: string,
  force: boolean,
  platforms?: PlatformAdapter[],
): InstallResult[] {
  const activePlatforms = platforms ?? getActivePlatforms();
  const results: InstallResult[] = [];
  const installedDirs = new Set<string>();

  for (const platform of activePlatforms) {
    const result: InstallResult = {
      platform: platform.name,
      success: true,
      skipped: false,
      filesWritten: 0,
      errors: [],
    };

    if (installedDirs.has(platform.skillsDir)) {
      result.skipped = true;
      results.push(result);
      continue;
    }

    installedDirs.add(platform.skillsDir);

    try {
      const skills = scanSourceSkills(sourceDir);

      for (const skill of skills) {
        if (skill.type === 'directory') {
          for (const relFile of skill.files) {
            const srcFile = path.join(skill.sourcePath, relFile);
            const destFile = path.join(platform.skillsDir, skill.name, relFile);
            writeRenderedFile(srcFile, destFile, platform, result);
            if (!result.success) break;
          }
        } else {
          // single-file: wrap in a subdirectory named after the skill
          const srcFile = skill.sourcePath;
          const destFile = path.join(platform.skillsDir, skill.name, 'SKILL.md');
          writeRenderedFile(srcFile, destFile, platform, result);
        }

        if (!result.success) break;
      }
    } catch (err) {
      result.success = false;
      result.errors.push((err as Error).message);
    }

    results.push(result);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Renders srcFile, validates the output, then writes to destFile.
 * Mutates result on error (sets success=false, pushes error message).
 */
function writeRenderedFile(
  srcFile: string,
  destFile: string,
  platform: PlatformAdapter,
  result: InstallResult,
): void {
  let rendered: string;

  try {
    rendered = renderSkillFile(srcFile, platform.placeholderMap, platform.name);
  } catch (err) {
    result.success = false;
    result.errors.push((err as Error).message);
    return;
  }

  const validation = validateOutput(rendered, srcFile);
  if (!validation.valid) {
    const patterns = validation.residuals.map((r) => r.pattern).join(', ');
    const e = new Error(
      `Residual placeholders in "${srcFile}" for platform "${platform.name}": ${patterns}`,
    );
    (e as NodeJS.ErrnoException).code = 'RESIDUAL_PLACEHOLDER';
    throw e;
  }

  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.writeFileSync(destFile, rendered, 'utf-8');
  result.filesWritten += 1;
}
