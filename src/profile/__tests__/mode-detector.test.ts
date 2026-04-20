/**
 * Tests for MOD-004: mode-detector
 * Covers: detectMode, resolveFlowMode, handleStalenessResponse
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as child_process from 'node:child_process';

import { detectMode, resolveFlowMode, handleStalenessResponse } from '../mode-detector.js';
import { readLayer } from '../storage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function setup(files: Record<string, string> = {}): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nopilot-mode-test-'));
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

function validL3(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    updated_at: new Date().toISOString(),
    test_coverage: { total_tests: 10, framework: 'vitest' },
    domain_model: {
      entities: [{ name: 'User', description: 'Existing entity' }],
      relationships: [],
    },
    tech_debt: ['cleanup auth flow'],
    change_hotspots: ['src/auth'],
    recent_features: ['feat-auth'],
    ui_taste: {
      designDNA: { colorPalette: { brand: '#123456' } },
      tokensPath: 'specs/mockups/tokens.json',
      mockupsDir: 'specs/mockups/',
      stitchProjectId: null,
      tier: 1,
      selectedPages: [{ name: 'home', mockupFile: 'home.html', darkMockupFile: null }],
    },
    ...overrides,
  };
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// TEST-036: detectMode — pure_greenfield
// ---------------------------------------------------------------------------

describe('detectMode', () => {
  it('TEST-036: returns pure_greenfield when no code and no profile', () => {
    const root = setup();
    const result = detectMode(root);

    expect(result.hasProfile).toBe(false);
    expect(result.hasCode).toBe(false);
    expect(result.detectedPath).toBe('pure_greenfield');
  });

  it('TEST-037: returns first_time_onboarding when code exists but no profile', () => {
    const root = setup({
      'package.json': JSON.stringify({ name: 'test-project' }),
    });
    // Initialize git
    child_process.execSync('git init', { cwd: root, stdio: 'pipe' });

    const result = detectMode(root);

    expect(result.hasProfile).toBe(false);
    expect(result.hasCode).toBe(true);
    expect(result.detectedPath).toBe('first_time_onboarding');
    expect(result.codeIndicators).toContain('git_history');
    expect(result.codeIndicators).toContain('package.json');
  });

  it('TEST-038: returns returning_project when profile exists', () => {
    const root = setup({
      '.nopilot/profile/l0-infra.json': JSON.stringify(validL0()),
      'package.json': JSON.stringify({ name: 'test-project' }),
    });

    const result = detectMode(root);

    expect(result.hasProfile).toBe(true);
    expect(result.detectedPath).toBe('returning_project');
    expect(result.profileLayers?.l0).toBe(true);
  });

  it('TEST-072: handles corrupted profile (empty l0-infra.json) — treats as no profile', () => {
    const root = setup({
      '.nopilot/profile/l0-infra.json': '',
    });

    const result = detectMode(root);

    expect(result.hasProfile).toBe(false);
    // detectedPath depends on whether code exists
    expect(['pure_greenfield', 'first_time_onboarding']).toContain(result.detectedPath);
  });

  it('TEST-073: .git with zero commits counts as hasCode=true', () => {
    const root = setup();
    child_process.execSync('git init', { cwd: root, stdio: 'pipe' });

    const result = detectMode(root);

    expect(result.hasCode).toBe(true);
    expect(result.codeIndicators).toContain('git_history');
  });
});

// ---------------------------------------------------------------------------
// TEST-039 to TEST-041, TEST-074: resolveFlowMode
// ---------------------------------------------------------------------------

describe('resolveFlowMode', () => {
  it('TEST-039: auto-resolves pure_greenfield without user choice', () => {
    const result = resolveFlowMode('pure_greenfield', null);
    expect(result.mode).toBe('greenfield');
    expect(result.onboardingRequired).toBe(false);
  });

  it('TEST-040: sets onboardingRequired for first_time_onboarding', () => {
    const result = resolveFlowMode('first_time_onboarding', 'feature');
    expect(result.mode).toBe('feature');
    expect(result.onboardingRequired).toBe(true);
  });

  it('TEST-041: returns user choice for returning_project', () => {
    const result = resolveFlowMode('returning_project', 'feature');
    expect(result.mode).toBe('feature');
    expect(result.onboardingRequired).toBe(false);
  });

  it('TEST-041b: returns greenfield for returning_project when user chooses greenfield', () => {
    const result = resolveFlowMode('returning_project', 'greenfield');
    expect(result.mode).toBe('greenfield');
    expect(result.onboardingRequired).toBe(false);
  });

  it('TEST-074: throws or returns error state for returning_project with null userChoice', () => {
    expect(() => resolveFlowMode('returning_project', null)).toThrow();
  });

  it('PROP-006: pure_greenfield always resolves to greenfield regardless of userChoice', () => {
    const result1 = resolveFlowMode('pure_greenfield', null);
    expect(result1.mode).toBe('greenfield');
    // Even if somehow a userChoice is provided (shouldn't happen but defensive)
    const result2 = resolveFlowMode('pure_greenfield', 'feature');
    expect(result2.mode).toBe('greenfield');
  });
});

// ---------------------------------------------------------------------------
// TEST-042 / TEST-043: handleStalenessResponse
// ---------------------------------------------------------------------------

describe('handleStalenessResponse', () => {
  it('TEST-042: regenerate triggers scan and returns regenerated action', () => {
    const root = setup({
      '.nopilot/profile/l0-infra.json': JSON.stringify(validL0()),
      '.nopilot/profile/l3-status.json': JSON.stringify(validL3()),
      'package.json': JSON.stringify({ name: 'test' }),
      'src/index.ts': 'export const value = 1;\n',
      'src/index.test.ts': 'import { expect, it } from "vitest"; it("works", () => expect(1).toBe(1));\n',
    });
    child_process.execSync('git init', { cwd: root, stdio: 'pipe' });

    const stalenessResult = { stale: true, profileUpdatedAt: new Date().toISOString(), latestCommitAt: new Date().toISOString(), hoursApart: 48, thresholdHours: 24 };
    const result = handleStalenessResponse(root, stalenessResult, 'regenerate');

    expect(result.action).toBe('regenerated');
    expect(result.layersUpdated).toContain('l0');
    expect(result.layersUpdated).toContain('l3');
    expect(result.stalenessAcknowledged).toBe(false);

    const l3 = readLayer(root, 'l3');
    const data = l3.data as Record<string, unknown>;
    const domainModel = data.domain_model as { entities: Array<Record<string, unknown>> };
    expect(domainModel.entities[0].name).toBe('User');
    expect(data.recent_features).toEqual(['feat-auth']);
    expect((data.ui_taste as { designDNA: Record<string, unknown> }).designDNA).toEqual({
      colorPalette: { brand: '#123456' },
    });
    expect((data.test_coverage as { total_tests: number }).total_tests).toBe(1);
  });

  it('TEST-043: proceed records acknowledgment', () => {
    const root = setup();
    const stalenessResult = { stale: true, profileUpdatedAt: new Date().toISOString(), latestCommitAt: new Date().toISOString(), hoursApart: 48, thresholdHours: 24 };
    const result = handleStalenessResponse(root, stalenessResult, 'proceed');

    expect(result.action).toBe('acknowledged');
    expect(result.layersUpdated).toEqual([]);
    expect(result.stalenessAcknowledged).toBe(true);
  });
});
