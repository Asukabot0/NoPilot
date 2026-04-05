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

  it('installs commands to Claude and Codex global prompt directories', () => {
    runCli(['init', tmpDir], undefined, { HOME: tmpHome });

    const claudeCommands = join(tmpHome, '.claude', 'commands');
    const codexPrompts = join(tmpHome, '.codex', 'prompts');
    const srcDiscover = readFileSync(join(PACKAGE_ROOT, 'commands', 'discover.md'), 'utf-8');
    const srcCodexDiscover = readFileSync(join(PACKAGE_ROOT, 'prompts', 'codex', 'discover.md'), 'utf-8');

    expect(existsSync(claudeCommands)).toBe(true);
    expect(existsSync(codexPrompts)).toBe(true);
    expect(readdirSync(claudeCommands).some((f) => f.endsWith('.md'))).toBe(true);
    expect(readdirSync(codexPrompts).some((f) => f.endsWith('.md'))).toBe(true);
    expect(readFileSync(join(claudeCommands, 'discover.md'), 'utf-8')).toBe(srcDiscover);
    expect(readFileSync(join(codexPrompts, 'discover.md'), 'utf-8')).toBe(srcCodexDiscover);
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
    expect(paths).toHaveProperty('source_prompt_locations');
    expect(paths).toHaveProperty('schemas');
    expect(paths).toHaveProperty('workflow');
    expect(paths).toHaveProperty('installed_commands');
    expect(paths).toHaveProperty('installed_command_locations');
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

  it('reports Claude and Codex install locations', () => {
    const output = runCli(['paths']);
    const paths = JSON.parse(output);
    expect(paths.source_prompt_locations).toEqual({
      claude: resolve(PACKAGE_ROOT, 'commands'),
      codex: resolve(PACKAGE_ROOT, 'prompts', 'codex'),
    });
    expect(paths.installed_command_locations).toEqual({
      claude: join(homedir(), '.claude', 'commands'),
      codex: join(homedir(), '.codex', 'prompts'),
    });
  });

  it('ships a Codex prompt mirror without Claude-only references', () => {
    const claudeFiles = readdirSync(resolve(PACKAGE_ROOT, 'commands')).filter((f) => f.endsWith('.md')).sort();
    const codexFiles = readdirSync(resolve(PACKAGE_ROOT, 'prompts', 'codex')).filter((f) => f.endsWith('.md')).sort();

    expect(codexFiles).toEqual(claudeFiles);

    for (const file of codexFiles) {
      const content = readFileSync(resolve(PACKAGE_ROOT, 'prompts', 'codex', file), 'utf-8');
      expect(content).not.toContain('.claude/commands');
      expect(content).not.toContain('Agent(');
      expect(content).not.toMatch(/commands\/[A-Za-z0-9._/-]+\.md/);
    }
  });
});

describe('nopilot version', () => {
  it('outputs version string in expected format', () => {
    const output = runCli(['version']);
    expect(output.trim()).toMatch(/^nopilot v\d+\.\d+\.\d+/);
  });
});
