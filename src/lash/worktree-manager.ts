/**
 * MOD-003: worktree_manager — Create and manage isolated git worktrees for Workers.
 * Translated from Python lash/worktree_manager.py.
 */
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { existsSync, symlinkSync } from 'node:fs';
import type { MergeResult, WorktreeInfo, PreserveResult, UnexpectedFilesResult } from './types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface GitResult {
  stdout: string;
  stderr: string;
  returncode: number;
}

/**
 * Run a git command, capturing output. Does NOT throw on non-zero return.
 * Uses execFile (no shell) to avoid shell injection.
 * Mirrors Python _run_git(): subprocess.run(["git", ...], capture_output=True, text=True)
 */
export async function runGit(args: string[], cwd?: string): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd });
    return { stdout, stderr, returncode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      returncode: e.code ?? 1,
    };
  }
}

function _worktreeBase(projectRoot: string): string {
  return join(projectRoot, '.lash', 'worktrees');
}

function _worktreePath(moduleId: string, projectRoot: string): string {
  return join(_worktreeBase(projectRoot), moduleId);
}

function _branchName(moduleId: string): string {
  return `lash/${moduleId}`;
}

function _parseConflictFiles(output: string): string[] {
  const files: string[] = [];
  const pattern = /CONFLICT \([^)]+\): Merge conflict in (.+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output)) !== null) {
    files.push(match[1].trim());
  }
  return files;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a git worktree at .lash/worktrees/<moduleId>/ branching from main HEAD.
 *
 * Returns WorktreeInfo: { worktree_path, branch_name }
 *
 * Throws ValueError-style Error:
 *   'worktree_exists' if the worktree already exists.
 *   'git_error' on other git failures.
 */
export async function createWorktree(moduleId: string, projectRoot: string = '.'): Promise<WorktreeInfo> {
  const path = _worktreePath(moduleId, projectRoot);
  const branch = _branchName(moduleId);

  // Get current HEAD sha to branch from
  const headResult = await runGit(['rev-parse', 'HEAD'], projectRoot);
  if (headResult.returncode !== 0) {
    throw new Error(`git_error: could not resolve HEAD: ${headResult.stderr.trim()}`);
  }
  const headSha = headResult.stdout.trim();

  // Create the worktree on a new branch
  const result = await runGit(['worktree', 'add', '-b', branch, path, headSha], projectRoot);
  if (result.returncode !== 0) {
    const stderr = result.stderr.trim();
    if (stderr.includes('already exists') || stderr.includes('already checked out')) {
      throw new Error(`worktree_exists: worktree for ${moduleId} already exists`);
    }
    throw new Error(`git_error: ${stderr}`);
  }

  // Symlink node_modules from main repo — worktrees lack it (gitignored). (#37)
  const srcModules = resolve(projectRoot, 'node_modules');
  const destModules = join(path, 'node_modules');
  if (existsSync(srcModules) && !existsSync(destModules)) {
    symlinkSync(srcModules, destModules, 'dir');
  }

  return { worktree_path: path, branch_name: branch };
}

/**
 * Merge branch lash/<moduleId> to main using git merge --no-ff.
 *
 * Returns MergeResult.
 *
 * Throws:
 *   'no_worktree' if no worktree exists for this module.
 *   'git_error' on unexpected git failures.
 */
export async function mergeToMain(moduleId: string, projectRoot: string = '.'): Promise<MergeResult> {
  const branch = _branchName(moduleId);

  // Verify worktree exists
  const listResult = await runGit(['worktree', 'list'], projectRoot);
  const path = _worktreePath(moduleId, projectRoot);
  if (!listResult.stdout.includes(path)) {
    throw new Error(`no_worktree: no worktree found for ${moduleId}`);
  }

  // Switch to main
  const checkoutResult = await runGit(['checkout', 'main'], projectRoot);
  if (checkoutResult.returncode !== 0) {
    throw new Error(`git_error: could not checkout main: ${checkoutResult.stderr.trim()}`);
  }

  // Attempt merge --no-ff
  const mergeResult = await runGit(['merge', '--no-ff', branch], projectRoot);

  if (mergeResult.returncode !== 0) {
    // Conflict — abort and report conflict files
    const conflictFiles = _parseConflictFiles(mergeResult.stdout);
    await runGit(['merge', '--abort'], projectRoot);
    return {
      success: false,
      branch_name: branch,
      conflict_files: conflictFiles.length > 0 ? conflictFiles : null,
      merge_commit: null,
    };
  }

  // Success — get merge commit sha
  const commitResult = await runGit(['rev-parse', 'HEAD'], projectRoot);
  const mergeCommit = commitResult.returncode === 0 ? commitResult.stdout.trim() : null;

  return {
    success: true,
    branch_name: branch,
    conflict_files: null,
    merge_commit: mergeCommit,
  };
}

/**
 * Remove worktree and delete branch.
 *
 * Throws:
 *   'git_error' on git failures.
 */
export async function cleanupWorktree(moduleId: string, projectRoot: string = '.'): Promise<void> {
  const path = _worktreePath(moduleId, projectRoot);
  const branch = _branchName(moduleId);

  // Remove the worktree
  const removeResult = await runGit(['worktree', 'remove', '--force', path], projectRoot);
  if (removeResult.returncode !== 0) {
    throw new Error(`git_error: could not remove worktree: ${removeResult.stderr.trim()}`);
  }

  // Delete the branch
  const branchResult = await runGit(['branch', '-D', branch], projectRoot);
  if (branchResult.returncode !== 0) {
    throw new Error(`git_error: could not delete branch ${branch}: ${branchResult.stderr.trim()}`);
  }
}

/**
 * Mark worktree as preserved (do not delete).
 *
 * Returns PreserveResult: { preserved_path }
 */
export function preserveWorktree(moduleId: string, reason: string, projectRoot: string = '.'): PreserveResult {
  const path = _worktreePath(moduleId, projectRoot);
  return { preserved_path: path };
}

/**
 * Create a new worktree at .lash/worktrees/<moduleId>-conflict-resolve/.
 *
 * Returns WorktreeInfo: { worktree_path, branch_name }
 *
 * Throws:
 *   'git_error' on git failures.
 */
export async function createConflictResolutionWorktree(
  moduleId: string,
  sourceBranch: string,
  targetBranch: string,
  projectRoot: string = '.',
): Promise<WorktreeInfo> {
  const resolveModuleId = `${moduleId}-conflict-resolve`;
  const path = _worktreePath(resolveModuleId, projectRoot);
  const branch = _branchName(resolveModuleId);

  // Get sha of source branch HEAD
  const headResult = await runGit(['rev-parse', sourceBranch], projectRoot);
  if (headResult.returncode !== 0) {
    throw new Error(`git_error: could not resolve ${sourceBranch}: ${headResult.stderr.trim()}`);
  }
  const headSha = headResult.stdout.trim();

  // Create the conflict resolution worktree
  const result = await runGit(['worktree', 'add', '-b', branch, path, headSha], projectRoot);
  if (result.returncode !== 0) {
    throw new Error(`git_error: ${result.stderr.trim()}`);
  }

  // Symlink node_modules from main repo (#37)
  const srcModules = resolve(projectRoot, 'node_modules');
  const destModules = join(path, 'node_modules');
  if (existsSync(srcModules) && !existsSync(destModules)) {
    symlinkSync(srcModules, destModules, 'dir');
  }

  return { worktree_path: path, branch_name: branch };
}

/**
 * Check if Worker modified files outside owned_files.
 *
 * Returns UnexpectedFilesResult: { clean, unexpected_files }
 */
export async function checkUnexpectedFiles(
  moduleId: string,
  ownedFiles: string[],
  projectRoot: string = '.',
): Promise<UnexpectedFilesResult> {
  const worktree = _worktreePath(moduleId, projectRoot);

  // Get list of modified files in the worktree compared to its base
  const result = await runGit(['diff', '--name-only', 'HEAD'], worktree);

  if (result.returncode !== 0 || !result.stdout.trim()) {
    return { clean: true, unexpected_files: [] };
  }

  const modified = result.stdout
    .trim()
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  const ownedSet = new Set(ownedFiles);
  const unexpected = modified.filter((f) => !ownedSet.has(f));

  return {
    clean: unexpected.length === 0,
    unexpected_files: unexpected,
  };
}
