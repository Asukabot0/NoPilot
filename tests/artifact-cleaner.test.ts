/**
 * Tests for MOD-001: artifact-cleaner
 * Covers TC-001 through TC-006, PC-001, PC-002.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { cleanupArtifacts } from '../src/lash/artifact-cleaner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function specsDir(): string {
  return path.join(tmpDir, 'specs');
}

function createFile(relativePath: string, content = '{}'): void {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

function createDir(relativePath: string): void {
  fs.mkdirSync(path.join(tmpDir, relativePath), { recursive: true });
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(tmpDir, relativePath));
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-cleaner-'));
  createDir('specs');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-001: cleanupArtifacts removes root-level JSON files
// ---------------------------------------------------------------------------

describe('cleanupArtifacts (root mode)', () => {
  it('TC-001: removes root-level JSON files from specs/', () => {
    createFile('specs/spec.json');
    createFile('specs/discover.json');
    createFile('specs/build-state.json');
    createFile('specs/build_report.json');
    createFile('specs/.gitkeep', '');

    const result = cleanupArtifacts({ projectRoot: tmpDir });

    expect(exists('specs/spec.json')).toBe(false);
    expect(exists('specs/discover.json')).toBe(false);
    expect(exists('specs/build-state.json')).toBe(false);
    expect(exists('specs/build_report.json')).toBe(false);
    expect(result.removedPaths.length).toBe(4);
    // .gitkeep preserved
    expect(exists('specs/.gitkeep')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // TC-002: cleanupArtifacts removes split directories
  // ---------------------------------------------------------------------------

  it('TC-002: removes discover/, spec/, views/, mockups/ directories', () => {
    createFile('specs/discover/index.json');
    createFile('specs/spec/index.json');
    createFile('specs/views/main.json');
    createFile('specs/mockups/home.json');

    const result = cleanupArtifacts({ projectRoot: tmpDir });

    expect(exists('specs/discover')).toBe(false);
    expect(exists('specs/spec')).toBe(false);
    expect(exists('specs/views')).toBe(false);
    expect(exists('specs/mockups')).toBe(false);
    expect(result.removedPaths.length).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // TC-003: cleanupArtifacts preserves .gitkeep
  // ---------------------------------------------------------------------------

  it('TC-003: preserves specs/.gitkeep', () => {
    createFile('specs/.gitkeep', '');
    createFile('specs/spec.json');

    const result = cleanupArtifacts({ projectRoot: tmpDir });

    expect(exists('specs/.gitkeep')).toBe(true);
    expect(result.preservedPaths).toContain(path.join(tmpDir, 'specs', '.gitkeep'));
  });

  // ---------------------------------------------------------------------------
  // TC-006: idempotent on empty specs/
  // ---------------------------------------------------------------------------

  it('TC-006: idempotent when specs/ contains only .gitkeep', () => {
    createFile('specs/.gitkeep', '');

    const result = cleanupArtifacts({ projectRoot: tmpDir });

    expect(result.removedPaths).toEqual([]);
    expect(result.preservedPaths).toContain(path.join(tmpDir, 'specs', '.gitkeep'));
    expect(exists('specs/.gitkeep')).toBe(true);
  });

  it('idempotent when specs/ is completely empty', () => {
    const result = cleanupArtifacts({ projectRoot: tmpDir });

    expect(result.removedPaths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-004 / TC-005: feature mode
// ---------------------------------------------------------------------------

describe('cleanupArtifacts (feature mode)', () => {
  it('TC-004: removes feature directory entirely', () => {
    createFile('specs/features/feat-foo/spec/index.json');
    createFile('specs/features/feat-foo/discover/index.json');

    const result = cleanupArtifacts({ projectRoot: tmpDir, featureName: 'feat-foo' });

    expect(exists('specs/features/feat-foo')).toBe(false);
    expect(result.removedPaths).toContain(path.join(tmpDir, 'specs', 'features', 'feat-foo'));
  });

  it('TC-005: does not affect other features', () => {
    createFile('specs/features/feat-foo/spec/index.json');
    createFile('specs/features/feat-bar/spec/index.json');

    const result = cleanupArtifacts({ projectRoot: tmpDir, featureName: 'feat-foo' });

    expect(exists('specs/features/feat-foo')).toBe(false);
    expect(exists('specs/features/feat-bar/spec/index.json')).toBe(true);
    expect(result.removedPaths).not.toContain(path.join(tmpDir, 'specs', 'features', 'feat-bar'));
  });

  it('preserves specs/features/ directory itself', () => {
    createFile('specs/features/feat-foo/spec/index.json');

    cleanupArtifacts({ projectRoot: tmpDir, featureName: 'feat-foo' });

    expect(exists('specs/features')).toBe(true);
  });

  it('idempotent when feature does not exist', () => {
    createDir('specs/features');

    const result = cleanupArtifacts({ projectRoot: tmpDir, featureName: 'nonexistent' });

    expect(result.removedPaths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PC-001: cleanup never removes files outside specs/
// ---------------------------------------------------------------------------

describe('property: paths stay within specs/', () => {
  it('PC-001: all removedPaths are under specs/', () => {
    createFile('specs/spec.json');
    createFile('specs/discover/index.json');
    createFile('src/main.ts', '// code');

    const result = cleanupArtifacts({ projectRoot: tmpDir });

    const specsPrefix = path.join(tmpDir, 'specs');
    for (const p of result.removedPaths) {
      expect(p.startsWith(specsPrefix)).toBe(true);
    }
    // src/ untouched
    expect(exists('src/main.ts')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PC-002: cleanup never removes .gitkeep
// ---------------------------------------------------------------------------

describe('property: .gitkeep never removed', () => {
  it('PC-002: no removedPath ends with .gitkeep', () => {
    createFile('specs/.gitkeep', '');
    createFile('specs/spec.json');
    createFile('specs/discover/index.json');

    const result = cleanupArtifacts({ projectRoot: tmpDir });

    for (const p of result.removedPaths) {
      expect(p.endsWith('.gitkeep')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('throws PROJECT_ROOT_NOT_FOUND for nonexistent projectRoot', () => {
    expect(() =>
      cleanupArtifacts({ projectRoot: '/nonexistent/path/xyz' }),
    ).toThrow('PROJECT_ROOT_NOT_FOUND');
  });
});
