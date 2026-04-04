/**
 * Tests for MOD-003: AgentHTMLProvider.
 * Covers: HTML generation quality, variant diversity, DNA extraction,
 * always available, design system lifecycle, quality checklist compliance.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type {
  GenerateScreenRequest,
  GenerateVariantsRequest,
  DesignVariant,
  PageSpec,
} from '../types.js';
import { AgentHTMLProvider, QUALITY_CHECKLIST } from '../agent-html-provider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePageSpec(overrides?: Partial<PageSpec>): PageSpec {
  return {
    name: 'dashboard',
    description: 'Main dashboard',
    platform: 'web',
    deviceType: 'DESKTOP',
    existingStyleConstraint: null,
    ...overrides,
  };
}

function makeScreenRequest(overrides?: Partial<GenerateScreenRequest>): GenerateScreenRequest {
  return {
    pageSpec: makePageSpec(),
    prompt: 'A modern dashboard with metrics',
    designSystemRef: null,
    language: 'en',
    fontStack: 'Inter, sans-serif',
    ...overrides,
  };
}

function makeMockVariant(id: string): DesignVariant {
  return {
    id,
    screenId: `screen-${id}`,
    htmlCode: '<html><body><h1>Test</h1></body></html>',
    screenshotUrl: null,
    metadata: {
      title: `Variant ${id}`,
      prompt: 'test',
      creativeRange: 'REFINE',
      modelId: null,
      generatedAt: new Date().toISOString(),
    },
    provider: 'agent-html',
    deviceType: 'DESKTOP',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentHTMLProvider', () => {
  let provider: AgentHTMLProvider;

  beforeEach(() => {
    provider = new AgentHTMLProvider();
  });

  // --- Name & Availability ---

  it('returns agent-html as name', () => {
    expect(provider.name()).toBe('agent-html');
  });

  it('isAvailable always returns true', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  // --- generateScreen ---

  it('generateScreen returns valid HTML with doctype', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    expect(variant.htmlCode).toContain('<!DOCTYPE html>');
    expect(variant.htmlCode).toContain('<html');
    expect(variant.htmlCode).toContain('</html>');
  });

  it('generateScreen includes page name', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    expect(variant.htmlCode).toContain('dashboard');
  });

  it('generateScreen respects language parameter', async () => {
    const variant = await provider.generateScreen(
      makeScreenRequest({ language: 'zh' }),
    );
    expect(variant.htmlCode).toContain('lang="zh-CN"');
  });

  it('generateScreen includes font stack', async () => {
    const variant = await provider.generateScreen(
      makeScreenRequest({ fontStack: '"SF Pro Display", sans-serif' }),
    );
    expect(variant.htmlCode).toContain('SF Pro Display');
  });

  it('generateScreen returns correct provider', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    expect(variant.provider).toBe('agent-html');
  });

  it('generateScreen returns correct deviceType', async () => {
    const variant = await provider.generateScreen(
      makeScreenRequest({
        pageSpec: makePageSpec({ deviceType: 'MOBILE' }),
      }),
    );
    expect(variant.deviceType).toBe('MOBILE');
  });

  // --- Quality checklist compliance ---

  it('generated HTML has correct base layout structure', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    expect(variant.htmlCode).toContain('<nav');
    expect(variant.htmlCode).toContain('container');
  });

  it('generated HTML has coordinated color scheme via CSS variables', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    expect(variant.htmlCode).toContain('--primary:');
    expect(variant.htmlCode).toContain('--secondary:');
    expect(variant.htmlCode).toContain('--accent:');
    expect(variant.htmlCode).toContain('--bg:');
    expect(variant.htmlCode).toContain('--text:');
  });

  it('generated HTML has basic animation effects', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    expect(variant.htmlCode).toContain('@keyframes');
    expect(variant.htmlCode).toContain('transition');
  });

  it('generated HTML has responsive breakpoints', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    expect(variant.htmlCode).toContain('@media');
    expect(variant.htmlCode).toContain('768px');
    expect(variant.htmlCode).toContain('480px');
  });

  it('generated HTML has typography hierarchy', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    expect(variant.htmlCode).toContain('h1 {');
    expect(variant.htmlCode).toContain('h2 {');
    expect(variant.htmlCode).toContain('h3 {');
    expect(variant.htmlCode).toContain('p {');
  });

  // --- generateVariants ---

  it('generateVariants returns requested count', async () => {
    const base = makeMockVariant('base');
    const request: GenerateVariantsRequest = {
      baseVariant: base,
      count: 5,
      creativeRange: 'REFINE',
      prompt: 'test variations',
      designConstraint: null,
    };
    const variants = await provider.generateVariants(request);
    expect(variants.length).toBe(5);
  });

  it('generateVariants returns minimum 3', async () => {
    const base = makeMockVariant('base');
    const variants = await provider.generateVariants({
      baseVariant: base,
      count: 1,
      creativeRange: 'REFINE',
      prompt: 'test',
      designConstraint: null,
    });
    expect(variants.length).toBeGreaterThanOrEqual(3);
  });

  it('generateVariants produces diverse color schemes', async () => {
    const base = makeMockVariant('base');
    const variants = await provider.generateVariants({
      baseVariant: base,
      count: 5,
      creativeRange: 'REIMAGINE',
      prompt: 'reimagine',
      designConstraint: null,
    });

    // Extract primary color from each variant
    const primaryColors = variants.map((v) => {
      const match = v.htmlCode.match(/--primary:\s*(#[0-9a-fA-F]+)/);
      return match?.[1];
    });
    const uniqueColors = new Set(primaryColors);
    expect(uniqueColors.size).toBe(5);
  });

  it('generateVariants produces diverse layouts', async () => {
    const base = makeMockVariant('base');
    const variants = await provider.generateVariants({
      baseVariant: base,
      count: 5,
      creativeRange: 'REFINE',
      prompt: 'test',
      designConstraint: null,
    });

    // Titles should be unique (different scheme + layout combos)
    const titles = variants.map((v) => v.metadata.title);
    const unique = new Set(titles);
    expect(unique.size).toBe(5);
  });

  it('all variants have valid HTML structure', async () => {
    const base = makeMockVariant('base');
    const variants = await provider.generateVariants({
      baseVariant: base,
      count: 5,
      creativeRange: 'REFINE',
      prompt: 'test',
      designConstraint: null,
    });

    for (const v of variants) {
      expect(v.htmlCode).toContain('<!DOCTYPE html>');
      expect(v.htmlCode).toContain('</html>');
      expect(v.htmlCode).toContain('@media');
      expect(v.provider).toBe('agent-html');
    }
  });

  // --- extractDesignContext ---

  it('extractDesignContext returns valid DesignDNA', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    const dna = await provider.extractDesignContext(variant);

    expect(Object.keys(dna.colorPalette).length).toBeGreaterThan(0);
    expect(dna.typography.display).toBeTruthy();
    expect(dna.typography.body).toBeTruthy();
    expect(dna.spacing.length).toBeGreaterThan(0);
    expect(Object.keys(dna.borderRadius).length).toBeGreaterThan(0);
    expect(dna.shadows.length).toBeGreaterThan(0);
    expect(dna.designMd).toBeTruthy();
  });

  it('extractDesignContext extracts colors from CSS custom properties', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    const dna = await provider.extractDesignContext(variant);

    expect(dna.colorPalette).toHaveProperty('primary');
    expect(dna.colorPalette).toHaveProperty('secondary');
  });

  it('extractDesignContext detects animation level', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    const dna = await provider.extractDesignContext(variant);

    // Generated HTML has @keyframes, so should detect moderate
    expect(dna.animationLevel).toBe('moderate');
  });

  it('extractDesignContext extracts border radius', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    const dna = await provider.extractDesignContext(variant);
    expect(Object.keys(dna.borderRadius).length).toBeGreaterThan(0);
  });

  // --- createDesignSystem ---

  it('createDesignSystem returns a DesignSystemRef', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    const dna = await provider.extractDesignContext(variant);
    const ref = await provider.createDesignSystem(dna);

    expect(ref.id).toContain('agent-ds-');
    expect(ref.provider).toBe('agent-html');
  });

  // --- applyDesignSystem ---

  it('applyDesignSystem stores the ref', async () => {
    const ref = { id: 'ds-test', provider: 'agent-html', projectId: null };
    await provider.applyDesignSystem('proj-1', ref);
    // Verify it affects subsequent extractDesignContext
    const variant = await provider.generateScreen(makeScreenRequest());
    const dna = await provider.extractDesignContext(variant);
    expect(dna.designMd).toContain('Applied design system');
  });

  // --- QUALITY_CHECKLIST export ---

  it('QUALITY_CHECKLIST contains expected items', () => {
    expect(QUALITY_CHECKLIST).toContain('correct base layout');
    expect(QUALITY_CHECKLIST).toContain('coordinated color scheme');
    expect(QUALITY_CHECKLIST).toContain('basic animation effects');
    expect(QUALITY_CHECKLIST).toContain('responsive breakpoints');
    expect(QUALITY_CHECKLIST).toContain('proper typography hierarchy');
    expect(QUALITY_CHECKLIST.length).toBe(5);
  });
});
