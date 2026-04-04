/**
 * MOD-008: env_setup — Environment readiness checks and auto-fix.
 *
 * Design philosophy: "humans are decision-makers, not executors."
 * Every check that can be auto-fixed MUST be auto-fixed.
 * Every failure message MUST include a fix_suggestion so AI agents can self-repair.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { EnvCheckResult, EnvIssue } from './types.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Package manager detection
// ---------------------------------------------------------------------------

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | null;

/**
 * Detect the package manager from lockfile presence.
 * Priority: bun > pnpm > yarn > npm (most specific lockfile wins).
 */
export function detectPackageManager(projectRoot: string): PackageManager {
  if (existsSync(join(projectRoot, 'bun.lockb')) || existsSync(join(projectRoot, 'bun.lock'))) return 'bun';
  if (existsSync(join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectRoot, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(projectRoot, 'package-lock.json'))) return 'npm';
  // Fallback: if package.json exists but no lockfile, default to npm
  if (existsSync(join(projectRoot, 'package.json'))) return 'npm';
  return null;
}

/** Return the install command for the detected package manager. */
export function installCommand(pm: PackageManager): string[] | null {
  switch (pm) {
    case 'npm': return ['npm', 'install'];
    case 'yarn': return ['yarn', 'install'];
    case 'pnpm': return ['pnpm', 'install'];
    case 'bun': return ['bun', 'install'];
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Dependency checks
// ---------------------------------------------------------------------------

/**
 * Check whether dependencies are installed.
 * For Node projects: checks node_modules/ exists and is non-empty.
 * For Python projects: checks venv/ or .venv/ exists.
 * For Go projects: checks go.sum exists.
 */
export function hasDepsInstalled(projectRoot: string): boolean {
  // Node.js
  const nodeModules = join(projectRoot, 'node_modules');
  if (existsSync(join(projectRoot, 'package.json'))) {
    if (!existsSync(nodeModules) || !statSync(nodeModules).isDirectory()) return false;
    try {
      const entries = readdirSync(nodeModules);
      return entries.length > 0;
    } catch {
      return false;
    }
  }

  // Python
  if (existsSync(join(projectRoot, 'pyproject.toml')) || existsSync(join(projectRoot, 'setup.py'))) {
    return existsSync(join(projectRoot, 'venv')) || existsSync(join(projectRoot, '.venv'));
  }

  // Go
  if (existsSync(join(projectRoot, 'go.mod'))) {
    return existsSync(join(projectRoot, 'go.sum'));
  }

  return true; // Unknown project type — assume OK
}

// ---------------------------------------------------------------------------
// Install dependencies
// ---------------------------------------------------------------------------

/**
 * Install dependencies in the given directory. Non-interactive.
 * Returns { success, stdout, stderr }.
 */
export async function installDeps(
  projectRoot: string,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const pm = detectPackageManager(projectRoot);
  const cmd = installCommand(pm);
  if (!cmd) {
    return { success: false, stdout: '', stderr: 'no package manager detected' };
  }

  const [bin, ...args] = cmd;
  try {
    const result = await execFileAsync(bin, args, {
      cwd: projectRoot,
      timeout: 120_000, // 2 min timeout
      env: { ...process.env, CI: 'true' }, // CI=true suppresses interactive prompts
    });
    return { success: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string };
    return { success: false, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

// ---------------------------------------------------------------------------
// Full environment check
// ---------------------------------------------------------------------------

/** Fix suggestion map for common issues. */
const FIX_SUGGESTIONS: Record<string, string> = {
  'node_not_found': 'Install Node.js: https://nodejs.org/ or use `nvm install --lts`',
  'node_version_low': 'Upgrade Node.js to v18+: `nvm install 18 && nvm use 18`',
  'git_not_found': 'Install git: https://git-scm.com/downloads',
  'no_package_json': 'Run `npm init -y` to create a package.json',
  'deps_not_installed': 'Run `{pm} install` to install dependencies',
  'claude_not_found': 'Install Claude Code: `npm install -g @anthropic-ai/claude-code`',
  'codex_not_found': 'Install Codex CLI: `npm install -g @openai/codex`',
  'opencode_not_found': 'Install OpenCode: see https://opencode.ai',
};

/**
 * Run a comprehensive environment check for the project.
 * Returns structured results with auto-fixable issues flagged.
 */
export async function checkEnv(projectRoot: string): Promise<EnvCheckResult> {
  const issues: EnvIssue[] = [];

  // 1. Check git
  try {
    await execFileAsync('git', ['--version'], { timeout: 5000 });
  } catch {
    issues.push({
      id: 'git_not_found',
      severity: 'error',
      message: 'git is not installed or not in PATH',
      fix_suggestion: FIX_SUGGESTIONS['git_not_found'],
      auto_fixable: false,
    });
  }

  // 2. Check Node.js
  try {
    const { stdout } = await execFileAsync('node', ['--version'], { timeout: 5000 });
    const versionMatch = stdout.trim().match(/^v(\d+)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1], 10);
      if (major < 18) {
        issues.push({
          id: 'node_version_low',
          severity: 'error',
          message: `Node.js ${stdout.trim()} is below minimum v18`,
          fix_suggestion: FIX_SUGGESTIONS['node_version_low'],
          auto_fixable: false,
        });
      }
    }
  } catch {
    issues.push({
      id: 'node_not_found',
      severity: 'error',
      message: 'Node.js is not installed or not in PATH',
      fix_suggestion: FIX_SUGGESTIONS['node_not_found'],
      auto_fixable: false,
    });
  }

  // 3. Check package.json exists (if Node project)
  const hasPackageJson = existsSync(join(projectRoot, 'package.json'));
  if (!hasPackageJson && !existsSync(join(projectRoot, 'go.mod')) && !existsSync(join(projectRoot, 'pyproject.toml'))) {
    issues.push({
      id: 'no_package_json',
      severity: 'warning',
      message: 'No package.json, go.mod, or pyproject.toml found',
      fix_suggestion: FIX_SUGGESTIONS['no_package_json'],
      auto_fixable: false,
    });
  }

  // 4. Check deps installed
  if (hasPackageJson && !hasDepsInstalled(projectRoot)) {
    const pm = detectPackageManager(projectRoot) ?? 'npm';
    issues.push({
      id: 'deps_not_installed',
      severity: 'error',
      message: 'Dependencies not installed (node_modules missing or empty)',
      fix_suggestion: FIX_SUGGESTIONS['deps_not_installed'].replace('{pm}', pm),
      auto_fixable: true,
    });
  }

  const ready = issues.every((i) => i.severity !== 'error');
  return { ready, issues };
}

// ---------------------------------------------------------------------------
// Platform fix suggestions for preflight
// ---------------------------------------------------------------------------

/**
 * Return a fix_suggestion for a platform preflight failure.
 */
export function platformFixSuggestion(platform: string, error: string): string {
  if (error.includes('not found')) {
    return FIX_SUGGESTIONS[`${platform.replace('-', '_')}_not_found`]
      ?? `Install ${platform} — check the platform documentation`;
  }
  if (error.includes('auth')) {
    return `Authenticate with ${platform} before running the build`;
  }
  return `Check ${platform} installation: ${error}`;
}
