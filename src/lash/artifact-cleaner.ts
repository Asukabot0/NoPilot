/**
 * Lash artifact cleaner — MOD-001.
 *
 * Removes spec artifacts from the specs/ directory after build completion.
 * Supports both root-level cleanup and per-feature cleanup.
 * Idempotent: no error if target files/directories don't exist.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CleanupOptions {
  /** Project root directory. Defaults to process.cwd(). */
  projectRoot?: string;
  /** If provided, only remove specs/features/{featureName}/ directory. */
  featureName?: string;
}

export interface CleanupResult {
  /** Paths that were deleted. */
  removedPaths: string[];
  /** Paths intentionally preserved (e.g. .gitkeep). */
  preservedPaths: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Directories under specs/ that are removed in root-level cleanup. */
const CLEANUP_DIRS = ['discover', 'spec', 'views', 'mockups'] as const;

/** Files/patterns that are always preserved. */
const PRESERVED_NAMES = new Set(['.gitkeep']);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Remove spec artifacts from the specs/ directory.
 *
 * Without `featureName`: removes all *.json files (except .gitkeep) and
 * the discover/, spec/, views/, mockups/ subdirectories under specs/.
 *
 * With `featureName`: removes specs/features/{featureName}/ entirely,
 * preserving the specs/features/ parent directory.
 *
 * @throws Error with message starting with 'PROJECT_ROOT_NOT_FOUND' if projectRoot does not exist.
 */
export function cleanupArtifacts(options?: CleanupOptions): CleanupResult {
  const projectRoot = resolve(options?.projectRoot ?? process.cwd());

  if (!existsSync(projectRoot)) {
    throw new Error(`PROJECT_ROOT_NOT_FOUND: ${projectRoot} does not exist`);
  }

  const specsDir = join(projectRoot, 'specs');
  const removedPaths: string[] = [];
  const preservedPaths: string[] = [];

  if (!existsSync(specsDir)) {
    return { removedPaths, preservedPaths };
  }

  const featureName = options?.featureName;

  if (featureName) {
    // Feature mode: remove specs/features/{featureName}/ directory
    cleanupFeature(specsDir, featureName, removedPaths);
  } else {
    // Root mode: remove JSON files and known directories
    cleanupRoot(specsDir, removedPaths, preservedPaths);
  }

  return { removedPaths, preservedPaths };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function cleanupRoot(
  specsDir: string,
  removedPaths: string[],
  preservedPaths: string[],
): void {
  // Remove root-level JSON files (not directories, not preserved names)
  let entries: string[];
  try {
    entries = readdirSync(specsDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(specsDir, entry);

    if (PRESERVED_NAMES.has(entry)) {
      preservedPaths.push(fullPath);
      continue;
    }

    // Remove .json files at root level
    if (entry.endsWith('.json')) {
      try {
        const stat = statSync(fullPath);
        if (stat.isFile()) {
          rmSync(fullPath);
          removedPaths.push(fullPath);
        }
      } catch {
        // File may have been removed concurrently; ignore
      }
    }
  }

  // Remove known directories
  for (const dirName of CLEANUP_DIRS) {
    const dirPath = join(specsDir, dirName);
    if (existsSync(dirPath)) {
      rmSync(dirPath, { recursive: true, force: true });
      removedPaths.push(dirPath);
    }
  }
}

function cleanupFeature(
  specsDir: string,
  featureName: string,
  removedPaths: string[],
): void {
  const featureDir = join(specsDir, 'features', featureName);

  if (!existsSync(featureDir)) {
    return;
  }

  rmSync(featureDir, { recursive: true, force: true });
  removedPaths.push(featureDir);
}
