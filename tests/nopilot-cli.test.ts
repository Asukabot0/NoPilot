/**
 * Tests for src/nopilot-cli.ts — init, paths, and version commands.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package root is one level up from tests/
const PACKAGE_ROOT = resolve(__dirname, '..');
const CLI = resolve(PACKAGE_ROOT, 'dist', 'nopilot-cli.js');

/** Run the compiled CLI synchronously and return stdout. */
function runCli(args: string[], cwd?: string, env?: NodeJS.ProcessEnv): string {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: cwd ?? PACKAGE_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

/** Seed a temp directory with the assets init expects to copy from the package root. */
function seedPackageAssets(): void {
  // commands/*.md
  const cmdDir = resolve(PACKAGE_ROOT, 'commands');
  if (!existsSync(cmdDir)) {
    mkdirSync(cmdDir, { recursive: true });
    writeFileSync(join(cmdDir, 'lash-build.md'), '# lash-build', 'utf-8');
    writeFileSync(join(cmdDir, 'discover.md'), '# discover', 'utf-8');
  }

  // prompts/codex/*.md
  const codexDir = resolve(PACKAGE_ROOT, 'prompts', 'codex');
  if (!existsSync(codexDir)) {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, 'lash-build.md'), '# lash-build codex', 'utf-8');
    writeFileSync(join(codexDir, 'discover.md'), '# discover codex', 'utf-8');
  }
}

describe('nopilot init', () => {
  let tmpDir: string;
  let tmpHome: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nopilot-test-'));
    tmpHome = join(tmpDir, 'home');
    mkdirSync(tmpHome, { recursive: true });
    seedPackageAssets();
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('installs skills to Claude, Codex, and OpenCode (shared)', () => {
    runCli(['init', tmpDir], undefined, { HOME: tmpHome });

    const claudeSkills = join(tmpHome, '.claude', 'skills');
    const codexSkills = join(tmpHome, '.agents', 'skills');

    expect(existsSync(claudeSkills)).toBe(true);
    expect(existsSync(codexSkills)).toBe(true);
    // Each skill should be installed as a subdirectory with SKILL.md
    expect(readdirSync(claudeSkills).length).toBeGreaterThan(0);
    expect(readdirSync(codexSkills).length).toBeGreaterThan(0);
  });

  it('does NOT copy schemas to project', () => {
    runCli(['init', tmpDir], undefined, { HOME: tmpHome });

    const destSchemas = join(tmpDir, 'schemas');
    expect(existsSync(destSchemas)).toBe(false);
  });

  it('does NOT copy workflow.json to project', () => {
    runCli(['init', tmpDir], undefined, { HOME: tmpHome });

    const destWorkflow = join(tmpDir, 'workflow.json');
    expect(existsSync(destWorkflow)).toBe(false);
  });

  it('creates specs/ directory with .gitkeep', () => {
    runCli(['init', tmpDir], undefined, { HOME: tmpHome });

    const specsDir = join(tmpDir, 'specs');
    expect(existsSync(specsDir)).toBe(true);
    expect(existsSync(join(specsDir, '.gitkeep'))).toBe(true);
  });

  it('appends Lash directive to CLAUDE.md', () => {
    const claudeMd = join(tmpDir, 'CLAUDE.md');
    writeFileSync(claudeMd, '# My Project\n', 'utf-8');

    runCli(['init', tmpDir], undefined, { HOME: tmpHome });

    const content = readFileSync(claudeMd, 'utf-8');
    expect(content).toContain('## Lash (Auto-triggered Multi-Agent Build Orchestrator)');
    expect(content).toContain('nopilot paths');
  });

  it('is idempotent — running init twice does not duplicate the directive', () => {
    const claudeMd = join(tmpDir, 'CLAUDE.md');
    writeFileSync(claudeMd, '# My Project\n', 'utf-8');

    runCli(['init', tmpDir], undefined, { HOME: tmpHome });
    runCli(['init', tmpDir], undefined, { HOME: tmpHome });

    const content = readFileSync(claudeMd, 'utf-8');
    const occurrences = (content.match(/## Lash \(Auto-triggered Multi-Agent Build Orchestrator\)/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('--force updates existing Lash directive', () => {
    const claudeMd = join(tmpDir, 'CLAUDE.md');
    writeFileSync(claudeMd, '# My Project\n\n## Lash (Auto-triggered Multi-Agent Build Orchestrator)\nOld content here.\n', 'utf-8');

    runCli(['init', '--force', tmpDir], undefined, { HOME: tmpHome });

    const content = readFileSync(claudeMd, 'utf-8');
    expect(content).toContain('nopilot paths');
    const occurrences = (content.match(/## Lash \(Auto-triggered Multi-Agent Build Orchestrator\)/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

describe('nopilot paths', () => {
  it('outputs JSON with package asset locations', () => {
    const output = runCli(['paths']);
    const paths = JSON.parse(output);
    expect(paths).toHaveProperty('package_root');
    expect(paths).toHaveProperty('commands');
    expect(paths).toHaveProperty('codex_prompts');
    expect(paths).toHaveProperty('source_skill_location');
    expect(paths).toHaveProperty('schemas');
    expect(paths).toHaveProperty('workflow');
    expect(paths).toHaveProperty('installed_skills');
    expect(paths).toHaveProperty('legacy_dirs');
  });

  it('schemas path points to existing directory', () => {
    const output = runCli(['paths']);
    const paths = JSON.parse(output);
    expect(existsSync(paths.schemas)).toBe(true);
  });

  it('workflow path points to existing file', () => {
    const output = runCli(['paths']);
    const paths = JSON.parse(output);
    expect(existsSync(paths.workflow)).toBe(true);
  });

  it('reports Claude, Codex, and OpenCode skill install locations', () => {
    const output = runCli(['paths']);
    const paths = JSON.parse(output);
    expect(paths.source_skill_location).toEqual(resolve(PACKAGE_ROOT, 'commands'));
    expect(paths.installed_skills).toEqual({
      claude: join(homedir(), '.claude', 'skills/'),
      codex: join(homedir(), '.agents', 'skills/'),
      opencode: join(homedir(), '.agents', 'skills/'),
    });
    expect(paths.legacy_dirs).toEqual({
      claude: join(homedir(), '.claude', 'commands/'),
      codex: join(homedir(), '.codex', 'prompts/'),
    });
  });

});

describe('nopilot version', () => {
  it('outputs version string in expected format', () => {
    const output = runCli(['version']);
    expect(output.trim()).toMatch(/^nopilot v\d+\.\d+\.\d+/);
  });
});
