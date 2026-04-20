/**
 * MOD-006: DiffValidator for the Universal Skill Engine.
 *
 * Validates migration equivalence between generated and legacy skill directories,
 * and handles cleanup of legacy directories after successful validation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { FileCompareResult } from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Platform-specific path segments that identify placeholder-driven lines. */
const PLACEHOLDER_PATH_PATTERNS = ['.claude/', '.agents/', '.codex/', '.gemini/', '.opencode/'];

/**
 * Returns true if a line contains a known platform-specific path segment,
 * indicating the diff is due to placeholder substitution (expected).
 */
function isPlaceholderLine(line: string): boolean {
  return PLACEHOLDER_PATH_PATTERNS.some((pattern) => line.includes(pattern));
}

/**
 * Compare two .md file contents line-by-line and produce a FileCompareResult.
 */
function compareFiles(
  fileName: string,
  generatedContent: string,
  legacyContent: string,
): FileCompareResult {
  const generatedLines = generatedContent.split('\n');
  const legacyLines = legacyContent.split('\n');

  const maxLen = Math.max(generatedLines.length, legacyLines.length);

  let totalDiffLines = 0;
  let placeholderDiffLines = 0;
  const unexpectedDiffs: Array<{ line: number; expected: string; actual: string }> = [];

  for (let i = 0; i < maxLen; i++) {
    const generated = generatedLines[i] ?? '';
    const legacy = legacyLines[i] ?? '';

    if (generated !== legacy) {
      totalDiffLines++;

      if (isPlaceholderLine(generated) || isPlaceholderLine(legacy)) {
        placeholderDiffLines++;
      } else {
        unexpectedDiffs.push({ line: i + 1, expected: legacy, actual: generated });
      }
    }
  }

  return {
    fileName,
    passed: unexpectedDiffs.length === 0,
    totalDiffLines,
    placeholderDiffLines,
    unexpectedDiffs,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compares each .md file in generatedDir against its counterpart in legacyDir.
 * Diffs line-by-line; lines that differ due to platform-specific paths are
 * classified as placeholder diffs (expected). Any other diff marks the file
 * as failed and the overall result as passed=false.
 *
 * @throws Error with code `LEGACY_DIR_NOT_FOUND` if legacyDir does not exist.
 */
export function validateMigrationEquivalence(
  generatedDir: string,
  legacyDir: string,
): { passed: boolean; results: FileCompareResult[] } {
  if (!fs.existsSync(legacyDir)) {
    const e = new Error(`Legacy directory not found: ${legacyDir}`);
    (e as NodeJS.ErrnoException).code = 'LEGACY_DIR_NOT_FOUND';
    throw e;
  }

  const mdFiles = fs
    .readdirSync(generatedDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name);

  const results: FileCompareResult[] = [];

  for (const fileName of mdFiles) {
    const generatedPath = path.join(generatedDir, fileName);
    const legacyPath = path.join(legacyDir, fileName);

    const generatedContent = fs.readFileSync(generatedPath, 'utf-8');
    const legacyContent = fs.existsSync(legacyPath)
      ? fs.readFileSync(legacyPath, 'utf-8')
      : '';

    results.push(compareFiles(fileName, generatedContent, legacyContent));
  }

  const passed = results.every((r) => r.passed);
  return { passed, results };
}

/**
 * Recursively deletes legacyDir if validationResult.passed is true.
 *
 * @throws Error with code `VALIDATION_NOT_PASSED` if validationResult.passed is false.
 * @throws Error with code `DELETE_FAILED` on filesystem errors during deletion.
 */
export function deleteLegacyAfterValidation(
  legacyDir: string,
  validationResult: { passed: boolean },
): { deleted: boolean; filesRemoved: number } {
  if (!validationResult.passed) {
    const e = new Error('Validation did not pass; refusing to delete legacy directory');
    (e as NodeJS.ErrnoException).code = 'VALIDATION_NOT_PASSED';
    throw e;
  }

  let filesRemoved = 0;

  try {
    // Count files before removal
    const countFiles = (dir: string): number => {
      let count = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          count += countFiles(path.join(dir, entry.name));
        } else {
          count++;
        }
      }
      return count;
    };

    if (fs.existsSync(legacyDir)) {
      filesRemoved = countFiles(legacyDir);
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const e = new Error(`Failed to delete legacy directory "${legacyDir}": ${message}`);
    (e as NodeJS.ErrnoException).code = 'DELETE_FAILED';
    throw e;
  }

  return { deleted: true, filesRemoved };
}
