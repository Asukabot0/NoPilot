/**
 * MOD-004: LegacyMigrator for the Universal Skill Engine.
 * Scans legacy skill directories, prompts for cleanup, and manages migration windows.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

import type { CleanResult, LegacyFile } from './types.js';

/** The version that introduced skill migration. */
export const MIGRATION_SINCE_VERSION = '0.0.3';

const MANAGED_MARKER_RE = /^<!--\s*nopilot-managed\s+v([\w.]+)\s*-->/;

/**
 * Scans legacyDir for .md files and classifies each as managed, modified, or unrelated.
 * - managed: first line matches `<!-- nopilot-managed v{version} -->` AND name is in knownSkillNames
 * - modified: name is in knownSkillNames but marker is absent
 * - unrelated: not in knownSkillNames
 *
 * If legacyDir does not exist, returns empty results without throwing.
 */
export function detectLegacyFiles(
  legacyDir: string,
  knownSkillNames: string[],
): { managed: LegacyFile[]; modified: LegacyFile[]; unrelated: string[] } {
  const managed: LegacyFile[] = [];
  const modified: LegacyFile[] = [];
  const unrelated: string[] = [];

  if (!fs.existsSync(legacyDir)) {
    return { managed, modified, unrelated };
  }

  const entries = fs.readdirSync(legacyDir);
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;

    const filePath = path.join(legacyDir, entry);
    const name = entry.slice(0, -3); // strip .md

    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split('\n')[0] ?? '';
    const match = MANAGED_MARKER_RE.exec(firstLine);

    const isKnown = knownSkillNames.includes(name);

    if (match && isKnown) {
      managed.push({ path: filePath, name, hasMarker: true, markerVersion: match[1] });
    } else if (!match && isKnown) {
      modified.push({ path: filePath, name, hasMarker: false, markerVersion: null });
    } else {
      unrelated.push(filePath);
    }
  }

  return { managed, modified, unrelated };
}

/**
 * Prompts the user for confirmation before deleting legacy files.
 * - managed: listed together, one y/N prompt for all
 * - modified: prompted one by one, default N (empty input = N)
 * On delete failure, records in failed[] and continues.
 */
export async function promptAndClean(
  managed: LegacyFile[],
  modified: LegacyFile[],
  stdin: NodeJS.ReadableStream,
): Promise<CleanResult> {
  const deleted: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  const rl = readline.createInterface({ input: stdin, output: process.stdout });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    // Handle managed files as a batch
    if (managed.length > 0) {
      console.log('\nThe following managed legacy files will be removed:');
      for (const f of managed) {
        console.log(`  ${f.path} (v${f.markerVersion})`);
      }
      const answer = await question('Delete all managed files? [y/N] ');
      if (answer.trim().toLowerCase() === 'y') {
        for (const f of managed) {
          try {
            fs.unlinkSync(f.path);
            deleted.push(f.path);
          } catch (err) {
            failed.push({ path: f.path, error: (err as Error).message });
          }
        }
      } else {
        for (const f of managed) {
          skipped.push(f.path);
        }
      }
    }

    // Handle modified files one by one, default N
    for (const f of modified) {
      const answer = await question(
        `\nModified legacy file: ${f.path}\nThis file has local changes. Delete anyway? [y/N] `,
      );
      if (answer.trim().toLowerCase() === 'y') {
        try {
          fs.unlinkSync(f.path);
          deleted.push(f.path);
        } catch (err) {
          failed.push({ path: f.path, error: (err as Error).message });
        }
      } else {
        skipped.push(f.path);
      }
    }
  } finally {
    rl.close();
  }

  return { deleted, skipped, failed };
}

/**
 * Determines whether the migration cleanup window is still active.
 * Window = minor version of migrationSinceVersion + 5.
 * Compares minor components only.
 */
export function isWithinMigrationWindow(
  currentVersion: string,
  migrationSinceVersion: string,
): { active: boolean; versionsRemaining: number } {
  const currentMinor = parseMinor(currentVersion);
  const sinceMinor = parseMinor(migrationSinceVersion);
  const windowEnd = sinceMinor + 5;
  const versionsRemaining = Math.max(0, windowEnd - currentMinor);
  return { active: currentMinor <= windowEnd, versionsRemaining };
}

function parseMinor(version: string): number {
  const parts = version.split('.');
  return parseInt(parts[1] ?? '0', 10);
}
