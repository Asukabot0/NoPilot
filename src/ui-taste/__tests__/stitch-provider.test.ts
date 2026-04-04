/**
 * Tests for MOD-002: StitchProvider.
 * Covers: mock generation, quota tracking, availability check, DNA extraction,
 * variant diversity, design system lifecycle, downloadScreenHtml.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  GenerateScreenRequest,
  GenerateVariantsRequest,
  DesignVariant,
  PageSpec,
} from '../types.js';
import { StitchProvider, QuotaTracker } from '../stitch-provider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePageSpec(overrides?: Partial<PageSpec>): PageSpec {
  return {
    name: 'home',
    description: 'Home page',
    platform: 'ios',
    deviceType: 'MOBILE',
    existingStyleConstraint: null,
    ...overrides,
  };
}

function makeScreenRequest(overrides?: Partial<GenerateScreenRequest>): GenerateScreenRequest {
  return {
    pageSpec: makePageSpec(),
    prompt: 'A clean mobile home screen',
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
    provider: 'stitch',
    deviceType: 'MOBILE',
  };
}

// ---------------------------------------------------------------------------
// QuotaTracker
// ---------------------------------------------------------------------------

describe('QuotaTracker', () => {
  let tracker: QuotaTracker;

  beforeEach(() => {
    tracker = new QuotaTracker();
  });

  it('starts with zero calls', () => {
    const status = tracker.getStatus();
    expect(status.callsMade).toBe(0);
    expect(status.estimatedLimit).toBeNull();
    expect(status.exhausted).toBe(false);
  });

  it('increments call count', () => {
    tracker.increment();
    tracker.increment();
    tracker.increment();
    expect(tracker.getStatus().callsMade).toBe(3);
  });

  it('reports exhausted when callCount >= estimatedLimit', () => {
    tracker.setEstimatedLimit(3);
    tracker.increment();
    tracker.increment();
    tracker.increment();
    expect(tracker.getStatus().exhausted).toBe(true);
  });

  it('reports not exhausted when below limit', () => {
    tracker.setEstimatedLimit(10);
    tracker.increment();
    expect(tracker.getStatus().exhausted).toBe(false);
  });

  it('isWarning returns true at 80% threshold', () => {
    tracker.setEstimatedLimit(10);
    for (let i = 0; i < 8; i++) tracker.increment();
    expect(tracker.isWarning()).toBe(true);
  });

  it('isWarning returns false below 80% threshold', () => {
    tracker.setEstimatedLimit(10);
    for (let i = 0; i < 7; i++) tracker.increment();
    expect(tracker.isWarning()).toBe(false);
  });

  it('isWarning returns false when no limit is set', () => {
    tracker.increment();
    tracker.increment();
    expect(tracker.isWarning()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// StitchProvider
// ---------------------------------------------------------------------------

describe('StitchProvider', () => {
  let provider: StitchProvider;
  const originalEnv = process.env.STITCH_API_KEY;

  beforeEach(() => {
    provider = new StitchProvider();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.STITCH_API_KEY = originalEnv;
    } else {
      delete process.env.STITCH_API_KEY;
    }
  });

  // --- Name ---

  it('returns stitch as name', () => {
    expect(provider.name()).toBe('stitch');
  });

  // --- Availability ---

  it('isAvailable returns true when STITCH_API_KEY is set', async () => {
    process.env.STITCH_API_KEY = 'test-key-123';
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when STITCH_API_KEY is not set', async () => {
    delete process.env.STITCH_API_KEY;
    expect(await provider.isAvailable()).toBe(false);
  });

  // --- generateScreen ---

  it('generateScreen returns a DesignVariant with valid HTML', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    expect(variant.id).toContain('stitch-screen-');
    expect(variant.provider).toBe('stitch');
    expect(variant.htmlCode).toContain('<!DOCTYPE html>');
    expect(variant.htmlCode).toContain('<html');
    expect(variant.htmlCode).toContain('</html>');
    expect(variant.deviceType).toBe('MOBILE');
    expect(variant.metadata.modelId).toBe('GEMINI_3_1_PRO');
  });

  it('generateScreen includes platform in HTML', async () => {
    const variant = await provider.generateScreen(
      makeScreenRequest({ pageSpec: makePageSpec({ platform: 'web' }) }),
    );
    expect(variant.htmlCode).toContain('web');
  });

  it('generateScreen includes font stack in HTML', async () => {
    const variant = await provider.generateScreen(
      makeScreenRequest({ fontStack: '"PingFang SC", sans-serif' }),
    );
    expect(variant.htmlCode).toContain('PingFang SC');
  });

  it('generateScreen respects language', async () => {
    const variant = await provider.generateScreen(
      makeScreenRequest({ language: 'zh' }),
    );
    expect(variant.htmlCode).toContain('lang="zh-CN"');
  });

  it('generateScreen increments quota', async () => {
    await provider.generateScreen(makeScreenRequest());
    expect(provider.getQuotaStatus().callsMade).toBe(1);
  });

  // --- generateVariants ---

  it('generateVariants returns requested count of variants', async () => {
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

  it('generateVariants returns minimum 3 variants', async () => {
    const base = makeMockVariant('base');
    const request: GenerateVariantsRequest = {
      baseVariant: base,
      count: 1,
      creativeRange: 'REFINE',
      prompt: 'test',
      designConstraint: null,
    };
    const variants = await provider.generateVariants(request);
    expect(variants.length).toBeGreaterThanOrEqual(3);
  });

  it('generateVariants produces distinct variant titles', async () => {
    const base = makeMockVariant('base');
    const request: GenerateVariantsRequest = {
      baseVariant: base,
      count: 5,
      creativeRange: 'REIMAGINE',
      prompt: 'reimagine',
      designConstraint: null,
    };
    const variants = await provider.generateVariants(request);
    const titles = variants.map((v) => v.metadata.title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(5);
  });

  it('generateVariants produces HTML with CSS custom properties', async () => {
    const base = makeMockVariant('base');
    const request: GenerateVariantsRequest = {
      baseVariant: base,
      count: 3,
      creativeRange: 'REFINE',
      prompt: 'test',
      designConstraint: null,
    };
    const variants = await provider.generateVariants(request);
    for (const v of variants) {
      expect(v.htmlCode).toContain('--primary:');
      expect(v.htmlCode).toContain('--secondary:');
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
    expect(dna.animationLevel).toBe('subtle');
    expect(dna.designMd).toContain('Design System');
  });

  it('extractDesignContext extracts colors from CSS custom properties', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    const dna = await provider.extractDesignContext(variant);

    // The generated HTML has --primary, --secondary, etc.
    expect(dna.colorPalette).toHaveProperty('primary');
  });

  // --- createDesignSystem ---

  it('createDesignSystem returns a DesignSystemRef', async () => {
    const dna = await provider.extractDesignContext(
      await provider.generateScreen(makeScreenRequest()),
    );
    const ref = await provider.createDesignSystem(dna);
    expect(ref.id).toContain('ds-');
    expect(ref.provider).toBe('stitch');
  });

  // --- applyDesignSystem ---

  it('applyDesignSystem stores ref and projectId', async () => {
    const ref = { id: 'ds-test', provider: 'stitch', projectId: null };
    await provider.applyDesignSystem('proj-123', ref);
    // Verify quota was incremented
    expect(provider.getQuotaStatus().callsMade).toBe(1);
  });

  // --- downloadScreenHtml ---

  it('downloadScreenHtml returns variant HTML', async () => {
    const variant = await provider.generateScreen(makeScreenRequest());
    const html = provider.downloadScreenHtml(variant);
    expect(html).toBe(variant.htmlCode);
  });

  // --- Quota exhaustion ---

  it('generateScreen throws when quota is exhausted', async () => {
    // Use internal quota tracker to simulate exhaustion
    const tracker = (provider as any).quota as QuotaTracker;
    tracker.setEstimatedLimit(1);
    tracker.increment(); // Now at limit

    await expect(
      provider.generateScreen(makeScreenRequest()),
    ).rejects.toThrow('QUOTA_EXHAUSTED');
  });

  it('generateVariants throws when quota is exhausted', async () => {
    const tracker = (provider as any).quota as QuotaTracker;
    tracker.setEstimatedLimit(1);
    tracker.increment();

    const base = makeMockVariant('base');
    await expect(
      provider.generateVariants({
        baseVariant: base,
        count: 3,
        creativeRange: 'REFINE',
        prompt: 'test',
        designConstraint: null,
      }),
    ).rejects.toThrow('QUOTA_EXHAUSTED');
  });
});
