/**
 * Shared types for the Universal Skill Engine (feat-universal-skill-engine).
 */

/** Platform adapter configuration — one entry per supported AI coding platform. */
export interface PlatformAdapter {
  /** Platform identifier */
  name: 'claude' | 'codex' | 'gemini' | 'opencode';
  /** active = participates in init; experimental = config reserved only */
  status: 'active' | 'experimental';
  /** Target skills directory (absolute path) */
  skillsDir: string;
  /** Legacy directory to migrate from (null if no legacy path) */
  legacyDir: string | null;
  /** Placeholder variable name → platform-specific value */
  placeholderMap: Record<string, string>;
}

/** Result of scanning a single source skill in commands/ */
export interface SourceSkill {
  /** Skill name (directory name or filename without .md) */
  name: string;
  /** directory = contains SKILL.md; single-file = standalone .md */
  type: 'directory' | 'single-file';
  /** Absolute path to source directory or file */
  sourcePath: string;
  /** All .md files (relative paths within the skill) */
  files: string[];
}

/** Result of installing skills for one platform */
export interface InstallResult {
  platform: string;
  success: boolean;
  filesWritten: number;
  errors: string[];
}

/** A legacy file detected during migration */
export interface LegacyFile {
  path: string;
  name: string;
  hasMarker: boolean;
  markerVersion: string | null;
}

/** Result of legacy migration cleanup */
export interface CleanResult {
  deleted: string[];
  skipped: string[];
  failed: Array<{ path: string; error: string }>;
}

/** Result of output validation (residual placeholder check) */
export interface ValidationResult {
  valid: boolean;
  residuals: Array<{ pattern: string; line: number }>;
}

/** Result of migration equivalence diff for a single file */
export interface FileCompareResult {
  fileName: string;
  passed: boolean;
  totalDiffLines: number;
  placeholderDiffLines: number;
  unexpectedDiffs: Array<{ line: number; expected: string; actual: string }>;
}
