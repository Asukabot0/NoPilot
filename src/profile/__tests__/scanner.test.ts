/**
 * Tests for MOD-003: codebase-scanner
 * Covers: scanCodebase, detectTechStack, detectStructure, hasExistingCode
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as child_process from 'node:child_process';

import { scanCodebase, detectTechStack, detectStructure, hasExistingCode } from '../scanner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function setup(files: Record<string, string> = {}): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nopilot-scanner-test-'));
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(tmpDir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return tmpDir;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// hasExistingCode
// ---------------------------------------------------------------------------

describe('hasExistingCode', () => {
  it('TEST-032: returns true for project with git history', () => {
    setup();
    child_process.execSync('git init', { cwd: tmpDir, stdio: 'pipe' });

    const result = hasExistingCode(tmpDir);
    expect(result.hasCode).toBe(true);
    expect(result.indicators).toContain('git_history');
  });

  it('TEST-033: returns true for project with package.json only', () => {
    setup({ 'package.json': '{"name": "test"}' });

    const result = hasExistingCode(tmpDir);
    expect(result.hasCode).toBe(true);
    expect(result.indicators).toContain('package.json');
  });

  it('TEST-034: returns false for empty directory', () => {
    setup();
    const result = hasExistingCode(tmpDir);
    expect(result.hasCode).toBe(false);
    expect(result.indicators).toEqual([]);
  });

  it('detects go.mod', () => {
    setup({ 'go.mod': 'module example.com/hello\n\ngo 1.21\n' });
    const result = hasExistingCode(tmpDir);
    expect(result.hasCode).toBe(true);
    expect(result.indicators).toContain('go.mod');
  });

  it('detects Cargo.toml', () => {
    setup({ 'Cargo.toml': '[package]\nname = "hello"\nversion = "0.1.0"\n' });
    const result = hasExistingCode(tmpDir);
    expect(result.hasCode).toBe(true);
    expect(result.indicators).toContain('Cargo.toml');
  });
});

// ---------------------------------------------------------------------------
// detectTechStack
// ---------------------------------------------------------------------------

describe('detectTechStack', () => {
  it('TEST-028: detects TypeScript project with vitest', () => {
    setup({
      'tsconfig.json': '{"compilerOptions": {"target": "ES2022"}}',
      'package.json': JSON.stringify({
        name: 'test',
        devDependencies: { vitest: '^3.0.0', typescript: '^5.0.0' },
      }),
      'pnpm-lock.yaml': '',
    });

    const result = detectTechStack(tmpDir);
    expect(result.languages).toContain('TypeScript');
    expect(result.test_framework).toBe('vitest');
    expect(result.package_manager).toBe('pnpm');
  });

  it('detects npm package manager', () => {
    setup({
      'package.json': '{"name": "test"}',
      'package-lock.json': '{}',
    });
    const result = detectTechStack(tmpDir);
    expect(result.package_manager).toBe('npm');
  });

  it('detects yarn package manager', () => {
    setup({
      'package.json': '{"name": "test"}',
      'yarn.lock': '',
    });
    const result = detectTechStack(tmpDir);
    expect(result.package_manager).toBe('yarn');
  });

  it('detects React framework', () => {
    setup({
      'package.json': JSON.stringify({
        dependencies: { react: '^18.0.0' },
      }),
    });
    const result = detectTechStack(tmpDir);
    expect(result.frameworks).toContain('React');
  });

  it('detects Go language', () => {
    setup({ 'go.mod': 'module example.com/hello\n\ngo 1.21\n' });
    const result = detectTechStack(tmpDir);
    expect(result.languages).toContain('Go');
  });

  it('detects GitHub Actions CI', () => {
    setup({
      '.github/workflows/ci.yml': 'name: CI\non: push\njobs: {}',
    });
    const result = detectTechStack(tmpDir);
    expect(result.ci).not.toBeNull();
    expect(result.ci?.provider).toBe('github-actions');
  });

  it('detects jest test framework', () => {
    setup({
      'package.json': JSON.stringify({
        devDependencies: { jest: '^29.0.0' },
      }),
    });
    const result = detectTechStack(tmpDir);
    expect(result.test_framework).toBe('jest');
  });
});

// ---------------------------------------------------------------------------
// detectStructure
// ---------------------------------------------------------------------------

describe('detectStructure', () => {
  it('TEST-029: extracts directory structure', () => {
    setup({
      'src/index.ts': '',
      'tests/foo.test.ts': '',
      'docs/readme.md': '',
    });

    const result = detectStructure(tmpDir);
    expect(result.directory_structure).toBeDefined();
    expect(result.directory_structure!['src/']).toBeDefined();
    expect(result.directory_structure!['tests/']).toBeDefined();
    expect(result.directory_structure!['docs/']).toBeDefined();
  });

  it('detects modules from src/ subdirectories', () => {
    setup({
      'src/profile/types.ts': '',
      'src/lash/cli.ts': '',
    });

    const result = detectStructure(tmpDir);
    expect(result.modules).toBeDefined();
    const names = result.modules!.map((m) => m.name);
    expect(names).toContain('profile');
    expect(names).toContain('lash');
  });
});

// ---------------------------------------------------------------------------
// scanCodebase
// ---------------------------------------------------------------------------

describe('scanCodebase', () => {
  it('TEST-031: does not parallelize below threshold', () => {
    // Create ~10 files
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      files[`src/file${i}.ts`] = `export const x${i} = ${i};`;
    }
    setup(files);

    const result = scanCodebase(tmpDir, { scanThresholdFiles: 500 });
    expect(result.parallelized).toBe(false);
    expect(result.fileCount).toBeGreaterThan(0);
  });

  it('TEST-030: sets parallelized=true when file count exceeds threshold', () => {
    // Create 20 files with threshold of 5
    const files: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      files[`src/file${i}.ts`] = `export const x${i} = ${i};`;
    }
    setup(files);

    const result = scanCodebase(tmpDir, { scanThresholdFiles: 5 });
    expect(result.parallelized).toBe(true);
    expect(result.fileCount).toBeGreaterThan(5);
  });

  it('TEST-028+029 combined: scan extracts l0Partial and l1Partial', () => {
    setup({
      'tsconfig.json': '{"compilerOptions": {}}',
      'package.json': JSON.stringify({
        devDependencies: { vitest: '^3.0.0' },
      }),
      'pnpm-lock.yaml': '',
      'src/index.ts': 'export {};',
      'tests/foo.test.ts': 'import { test } from "vitest"; test("x", () => {});',
      'docs/README.md': '# docs',
    });

    const result = scanCodebase(tmpDir);
    expect(result.l0Partial.languages).toContain('TypeScript');
    expect(result.l0Partial.test_framework).toBe('vitest');
    expect(result.l1Partial.directory_structure).toBeDefined();
    expect(result.l3Partial.test_coverage).toBeDefined();
  });

  it('TEST-035: detects test coverage from test files', () => {
    setup({
      'package.json': JSON.stringify({ devDependencies: { vitest: '^3.0.0' } }),
      'src/__tests__/a.test.ts': '',
      'src/__tests__/b.test.ts': '',
      'src/__tests__/c.test.ts': '',
      'src/__tests__/d.test.ts': '',
      'src/__tests__/e.test.ts': '',
    });

    const result = scanCodebase(tmpDir);
    expect(result.l3Partial.test_coverage).toBeDefined();
    expect(result.l3Partial.test_coverage!.total_tests).toBeGreaterThan(0);
  });
});
