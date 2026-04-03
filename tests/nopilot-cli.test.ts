/**
 * Tests for src/nopilot-cli.ts — init command and version command.
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
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package root is one level up from tests/
const PACKAGE_ROOT = resolve(__dirname, '..');
const CLI = resolve(PACKAGE_ROOT, 'dist', 'nopilot-cli.js');

/** Run the compiled CLI synchronously and return stdout. */
function runCli(args: string[], cwd?: string): string {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: cwd ?? PACKAGE_ROOT,
    encoding: 'utf-8',
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
}

describe('nopilot init', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nopilot-test-'));
    seedPackageAssets();
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('creates .claude/commands/ with md files', () => {
    runCli(['init', tmpDir]);

    const destCommands = join(tmpDir, '.claude', 'commands');
    expect(existsSync(destCommands)).toBe(true);

    const files = readdirSync(destCommands);
    expect(files.some((f) => f.endsWith('.md'))).toBe(true);
  });

  it('creates schemas/ with json files', () => {
    runCli(['init', tmpDir]);

    const destSchemas = join(tmpDir, 'schemas');
    expect(existsSync(destSchemas)).toBe(true);

    const files = readdirSync(destSchemas);
    expect(files.some((f) => f.endsWith('.json'))).toBe(true);
  });

  it('copies workflow.json', () => {
    runCli(['init', tmpDir]);

    const destWorkflow = join(tmpDir, 'workflow.json');
    expect(existsSync(destWorkflow)).toBe(true);

    const src = readFileSync(resolve(PACKAGE_ROOT, 'workflow.json'), 'utf-8');
    const dest = readFileSync(destWorkflow, 'utf-8');
    expect(dest).toBe(src);
  });

  it('appends Lash directive to CLAUDE.md', () => {
    const claudeMd = join(tmpDir, 'CLAUDE.md');
    writeFileSync(claudeMd, '# My Project\n', 'utf-8');

    runCli(['init', tmpDir]);

    const content = readFileSync(claudeMd, 'utf-8');
    expect(content).toContain('## Lash (Auto-triggered Multi-Agent Build Orchestrator)');
    expect(content).toContain('commands/lash-build.md');
  });

  it('is idempotent — running init twice does not duplicate the directive', () => {
    const claudeMd = join(tmpDir, 'CLAUDE.md');
    writeFileSync(claudeMd, '# My Project\n', 'utf-8');

    runCli(['init', tmpDir]);
    runCli(['init', tmpDir]);

    const content = readFileSync(claudeMd, 'utf-8');
    const occurrences = (content.match(/## Lash \(Auto-triggered Multi-Agent Build Orchestrator\)/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('--force overwrites existing files', () => {
    // Place an old workflow.json
    const destWorkflow = join(tmpDir, 'workflow.json');
    writeFileSync(destWorkflow, '{"old":true}', 'utf-8');

    runCli(['init', '--force', tmpDir]);

    const content = readFileSync(destWorkflow, 'utf-8');
    const src = readFileSync(resolve(PACKAGE_ROOT, 'workflow.json'), 'utf-8');
    expect(content).toBe(src);
  });

  it('without --force skips existing workflow.json', () => {
    const destWorkflow = join(tmpDir, 'workflow.json');
    const original = '{"old":true}';
    writeFileSync(destWorkflow, original, 'utf-8');

    runCli(['init', tmpDir]);

    const content = readFileSync(destWorkflow, 'utf-8');
    expect(content).toBe(original);
  });
});

describe('nopilot version', () => {
  it('outputs version string in expected format', () => {
    const output = runCli(['version']);
    expect(output.trim()).toMatch(/^nopilot v\d+\.\d+\.\d+/);
  });
});
