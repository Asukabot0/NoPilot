/**
 * Tests for MOD-001: profile-storage
 * Covers: readLayer, writeLayer, profileExists, checkStaleness, readConfig, ensureGitignore
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as child_process from 'node:child_process';

import { readLayer, writeLayer, profileExists, checkStaleness, ensureGitignore } from '../storage.js';
import { readConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function setup(files: Record<string, string> = {}): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nopilot-profile-test-'));
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(tmpDir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return tmpDir;
}

function validL0(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    updated_at: new Date().toISOString(),
    languages: ['TypeScript'],
    frameworks: [],
    package_manager: null,
    runtime: null,
    build_tools: [],
    ci: null,
    test_framework: null,
    ...overrides,
  };
}

function validL1(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    updated_at: new Date().toISOString(),
    directory_structure: {},
    modules: [],
    dependency_directions: [],
    communication_patterns: [],
    design_patterns: [],
    ...overrides,
  };
}

function validL2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    updated_at: new Date().toISOString(),
    design_philosophy: [],
    architecture_decisions: [],
    constraints: [],
    ...overrides,
  };
}

function validL3(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    updated_at: new Date().toISOString(),
    test_coverage: { total_tests: 10, framework: 'vitest' },
    domain_model: { entities: [], relationships: [] },
    tech_debt: [],
    change_hotspots: [],
    recent_features: [],
    ...overrides,
  };
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// readLayer
// ---------------------------------------------------------------------------

describe('readLayer', () => {
  it('TEST-001: returns parsed JSON for existing L0 file', () => {
    const data = validL0();
    setup({
      '.nopilot/profile/l0-infra.json': JSON.stringify(data),
    });

    const result = readLayer(tmpDir, 'l0');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data).not.toBeNull();
    expect((result.data as { languages: string[] }).languages).toEqual(['TypeScript']);
  });

  it('TEST-002: returns null data for non-existent file', () => {
    setup();
    const result = readLayer(tmpDir, 'l0');
    expect(result.data).toBeNull();
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('FILE_NOT_FOUND');
  });

  it('TEST-003: returns validation errors for schema-invalid JSON (missing updated_at)', () => {
    setup({
      '.nopilot/profile/l0-infra.json': JSON.stringify({ languages: ['TypeScript'] }),
    });

    const result = readLayer(tmpDir, 'l0');
    expect(result.valid).toBe(false);
    expect(result.data).not.toBeNull();
    expect(result.errors.some((e) => e.includes('updated_at'))).toBe(true);
  });

  it('TEST-017: reads all four layer types correctly', () => {
    setup({
      '.nopilot/profile/l0-infra.json': JSON.stringify(validL0()),
      '.nopilot/profile/l1-arch.json': JSON.stringify(validL1()),
      '.nopilot/profile/l2-decisions.json': JSON.stringify(validL2()),
      '.nopilot/profile/l3-status.json': JSON.stringify(validL3()),
    });

    for (const layer of ['l0', 'l1', 'l2', 'l3'] as const) {
      const result = readLayer(tmpDir, layer);
      expect(result.valid).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.errors).toEqual([]);
    }
  });

  it('TEST-016: completes within 2 seconds for typical profile', () => {
    const largeData = validL0({
      languages: Array.from({ length: 100 }, (_, i) => `lang-${i}`),
    });
    setup({
      '.nopilot/profile/l0-infra.json': JSON.stringify(largeData),
    });

    const start = Date.now();
    readLayer(tmpDir, 'l0');
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

// ---------------------------------------------------------------------------
// writeLayer
// ---------------------------------------------------------------------------

describe('writeLayer', () => {
  it('TEST-004: creates file with auto-injected updated_at', () => {
    setup();
    const before = Date.now();
    const result = writeLayer(tmpDir, 'l0', { languages: ['TypeScript'] });
    const after = Date.now();

    expect(result.success).toBe(true);
    expect(result.path).toContain('l0-infra.json');

    const written = JSON.parse(fs.readFileSync(result.path, 'utf-8')) as { updated_at: string };
    const writtenTs = new Date(written.updated_at).getTime();
    expect(writtenTs).toBeGreaterThanOrEqual(before);
    expect(writtenTs).toBeLessThanOrEqual(after);
  });

  it('TEST-005: returns L2_DISABLED error when config has l2_enabled=false', () => {
    setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
    });

    expect(() => writeLayer(tmpDir, 'l2', { design_philosophy: [] })).toThrow('L2_DISABLED');
  });

  it('TEST-006: rejects data that fails schema validation', () => {
    setup();
    expect(() =>
      writeLayer(tmpDir, 'l0', { languages: 'not-an-array' as unknown as string[] })
    ).toThrow('SCHEMA_VALIDATION_FAILED');
  });

  it('TEST-007: creates .nopilot/profile/ directory if not exists', () => {
    setup();
    expect(fs.existsSync(path.join(tmpDir, '.nopilot', 'profile'))).toBe(false);

    const result = writeLayer(tmpDir, 'l0', { languages: ['TypeScript'] });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.nopilot', 'profile'))).toBe(true);
  });

  it('PROP-001: writeLayer to l0/l1/l3 succeeds regardless of l2_enabled', () => {
    setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
    });

    for (const layer of ['l0', 'l1', 'l3'] as const) {
      let data: Record<string, unknown>;
      if (layer === 'l0') data = { languages: ['TypeScript'] };
      else if (layer === 'l1') data = { directory_structure: {} };
      else data = { test_coverage: { total_tests: 0, framework: 'vitest' } };

      expect(() => writeLayer(tmpDir, layer, data)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// profileExists
// ---------------------------------------------------------------------------

describe('profileExists', () => {
  it('TEST-008: returns correct per-layer status when l0 and l1 exist', () => {
    setup({
      '.nopilot/profile/l0-infra.json': JSON.stringify(validL0()),
      '.nopilot/profile/l1-arch.json': JSON.stringify(validL1()),
    });

    const result = profileExists(tmpDir);
    expect(result.exists).toBe(true);
    expect(result.layers.l0).toBe(true);
    expect(result.layers.l1).toBe(true);
    expect(result.layers.l2).toBe(false);
    expect(result.layers.l3).toBe(false);
  });

  it('TEST-009: returns false when no profile directory', () => {
    setup();
    const result = profileExists(tmpDir);
    expect(result.exists).toBe(false);
    expect(result.layers).toEqual({ l0: false, l1: false, l2: false, l3: false });
  });
});

// ---------------------------------------------------------------------------
// checkStaleness
// ---------------------------------------------------------------------------

describe('checkStaleness', () => {
  function initGitRepo(dir: string): void {
    child_process.execSync('git init', { cwd: dir, stdio: 'pipe' });
    child_process.execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    child_process.execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
    fs.writeFileSync(path.join(dir, 'README.md'), '# test');
    child_process.execSync('git add .', { cwd: dir, stdio: 'pipe' });
    child_process.execSync('git commit -m "init"', { cwd: dir, stdio: 'pipe' });
  }

  it('TEST-010: detects profile older than threshold', () => {
    setup();
    initGitRepo(tmpDir);

    // Write l0 with old timestamp (48 hours ago)
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const dir = path.join(tmpDir, '.nopilot', 'profile');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'l0-infra.json'),
      JSON.stringify(validL0({ updated_at: oldDate })),
      'utf-8'
    );

    // Set config with 24h threshold
    fs.mkdirSync(path.join(tmpDir, '.nopilot'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.nopilot', 'config.json'),
      JSON.stringify({ staleness_threshold_hours: 24 }),
      'utf-8'
    );

    const result = checkStaleness(tmpDir);
    expect(result.stale).toBe(true);
    expect(result.thresholdHours).toBe(24);
    expect(result.hoursApart).toBeGreaterThan(24);
  });

  it('TEST-011: returns not stale for fresh profile', () => {
    setup();
    initGitRepo(tmpDir);

    // Write l0 with recent timestamp (2 hours ago — after the commit)
    const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // The commit was just made, so profile is "after" the commit — not stale
    // Actually profile is 2h before "now" but commit is also recent
    // We want: profile more recent than commit => hoursApart negative or 0, stale=false
    // Simplest: use current time for profile
    const nowDate = new Date().toISOString();
    const dir = path.join(tmpDir, '.nopilot', 'profile');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'l0-infra.json'),
      JSON.stringify(validL0({ updated_at: nowDate })),
      'utf-8'
    );

    fs.mkdirSync(path.join(tmpDir, '.nopilot'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.nopilot', 'config.json'),
      JSON.stringify({ staleness_threshold_hours: 24 }),
      'utf-8'
    );

    const result = checkStaleness(tmpDir);
    expect(result.stale).toBe(false);
    expect(result.thresholdHours).toBe(24);
  });

  it('throws NO_PROFILE when l0 does not exist', () => {
    setup();
    initGitRepo(tmpDir);
    expect(() => checkStaleness(tmpDir)).toThrow('NO_PROFILE');
  });
});

// ---------------------------------------------------------------------------
// readConfig
// ---------------------------------------------------------------------------

describe('readConfig', () => {
  it('TEST-012: returns defaults when config file missing', () => {
    setup();
    const config = readConfig(tmpDir);
    expect(config.l2Enabled).toBe(true);
    expect(config.scanThresholdFiles).toBe(500);
    expect(config.stalenessThresholdHours).toBe(24);
  });

  it('TEST-013: merges partial config with defaults', () => {
    setup({
      '.nopilot/config.json': JSON.stringify({ l2_enabled: false }),
    });
    const config = readConfig(tmpDir);
    expect(config.l2Enabled).toBe(false);
    expect(config.scanThresholdFiles).toBe(500);
    expect(config.stalenessThresholdHours).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// ensureGitignore
// ---------------------------------------------------------------------------

describe('ensureGitignore', () => {
  it('TEST-014: adds .nopilot/ to existing .gitignore', () => {
    setup({
      '.gitignore': 'node_modules/\ndist/\n',
    });

    const result = ensureGitignore(tmpDir);
    expect(result.added).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.nopilot/');
  });

  it('TEST-015: is idempotent when .nopilot/ already present', () => {
    setup({
      '.gitignore': 'node_modules/\n.nopilot/\n',
    });

    const result = ensureGitignore(tmpDir);
    expect(result.added).toBe(false);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    const occurrences = content.split('.nopilot/').length - 1;
    expect(occurrences).toBe(1);
  });

  it('creates .gitignore when it does not exist', () => {
    setup();
    const result = ensureGitignore(tmpDir);
    expect(result.added).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toContain('.nopilot/');
  });
});
