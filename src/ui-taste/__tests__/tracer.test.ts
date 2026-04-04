/**
 * Tracer Bullet tests for UI Taste system.
 * Validates the thinnest end-to-end slice: provider registry, stitch stub,
 * post-processor font patching, preview engine lifecycle, and orchestrator flow.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  DesignProvider,
  DesignVariant,
  DesignDNA,
  DesignSystemRef,
  PageSpec,
  GenerateScreenRequest,
  GenerateVariantsRequest,
  SelectionResult,
} from '../types.js';
import { ProviderRegistry } from '../design-provider.js';
import { StitchProvider } from '../stitch-provider.js';
import { PreviewEngine } from '../preview-engine.js';
import { PostProcessor } from '../post-processor.js';
import { TasteOrchestrator } from '../taste-orchestrator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockVariant(id: string, html?: string): DesignVariant {
  return {
    id,
    screenId: `screen-${id}`,
    htmlCode: html ?? `<html><body><h1>Variant ${id}</h1></body></html>`,
    screenshotUrl: null,
    metadata: {
      title: `Variant ${id}`,
      prompt: 'test prompt',
      creativeRange: 'REFINE',
      modelId: null,
      generatedAt: new Date().toISOString(),
    },
    provider: 'mock',
    deviceType: 'MOBILE',
  };
}

function makeMockProvider(
  providerName: string,
  available: boolean = true,
): DesignProvider {
  return {
    name(): string {
      return providerName;
    },
    async isAvailable(): Promise<boolean> {
      return available;
    },
    async generateScreen(
      _request: GenerateScreenRequest,
    ): Promise<DesignVariant> {
      return makeMockVariant('gen-1');
    },
    async generateVariants(
      _request: GenerateVariantsRequest,
    ): Promise<DesignVariant[]> {
      return [
        makeMockVariant('var-1'),
        makeMockVariant('var-2'),
        makeMockVariant('var-3'),
      ];
    },
    async extractDesignContext(_variant: DesignVariant): Promise<DesignDNA> {
      return {
        colorPalette: { primary: '#3b82f6' },
        typography: {
          display: '48px',
          headline: '32px',
          body: '16px',
          label: '12px',
        },
        spacing: [4, 8, 16, 24, 32],
        borderRadius: { sm: '4px', md: '8px', lg: '16px' },
        shadows: ['0 1px 3px rgba(0,0,0,0.1)'],
        animationLevel: 'subtle',
        designMd: '# Mock Design System',
        rawProviderData: null,
      };
    },
    async createDesignSystem(_dna: DesignDNA): Promise<DesignSystemRef> {
      return { id: 'ds-1', provider: providerName, projectId: null };
    },
    async applyDesignSystem(
      _projectId: string,
      _ref: DesignSystemRef,
    ): Promise<void> {},
  };
}

// ---------------------------------------------------------------------------
// ProviderRegistry
// ---------------------------------------------------------------------------

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  it('registers and returns a provider', () => {
    const provider = makeMockProvider('test-provider');
    registry.register(provider);
    const active = registry.getActive();
    expect(active).not.toBeNull();
    expect(active!.name()).toBe('test-provider');
  });

  it('returns null from getActive when no providers registered', () => {
    const active = registry.getActive();
    expect(active).toBeNull();
  });

  it('detectAndSelect returns first available provider', async () => {
    const unavailable = makeMockProvider('unavailable', false);
    const available = makeMockProvider('available', true);
    registry.register(unavailable);
    registry.register(available);

    const result = await registry.detectAndSelect();
    expect(result).not.toBeNull();
    expect(result!.provider.name()).toBe('available');
    // Tier reflects registration order: unavailable=1, available=2
    expect(result!.tier).toBe(2);
  });

  it('detectAndSelect returns null when all providers unavailable', async () => {
    const p1 = makeMockProvider('p1', false);
    const p2 = makeMockProvider('p2', false);
    registry.register(p1);
    registry.register(p2);

    const result = await registry.detectAndSelect();
    expect(result).toBeNull();
  });

  it('getActive returns the most recently selected provider after detectAndSelect', async () => {
    const provider = makeMockProvider('selected');
    registry.register(provider);
    await registry.detectAndSelect();

    const active = registry.getActive();
    expect(active).not.toBeNull();
    expect(active!.name()).toBe('selected');
  });
});

// ---------------------------------------------------------------------------
// StitchProvider (stub)
// ---------------------------------------------------------------------------

describe('StitchProvider', () => {
  it('returns stitch as name', () => {
    const provider = new StitchProvider();
    expect(provider.name()).toBe('stitch');
  });

  it('isAvailable returns true when STITCH_API_KEY is set', async () => {
    const original = process.env.STITCH_API_KEY;
    process.env.STITCH_API_KEY = 'test-key';
    try {
      const provider = new StitchProvider();
      expect(await provider.isAvailable()).toBe(true);
    } finally {
      if (original !== undefined) {
        process.env.STITCH_API_KEY = original;
      } else {
        delete process.env.STITCH_API_KEY;
      }
    }
  });

  it('generateScreen returns a mock DesignVariant', async () => {
    const provider = new StitchProvider();
    const request: GenerateScreenRequest = {
      pageSpec: {
        name: 'home',
        description: 'Home page',
        platform: 'ios',
        deviceType: 'MOBILE',
        existingStyleConstraint: null,
      },
      prompt: 'A clean mobile home screen',
      designSystemRef: null,
      language: 'en',
      fontStack: 'sans-serif',
    };
    const variant = await provider.generateScreen(request);
    expect(variant.id).toBeTruthy();
    expect(variant.htmlCode).toContain('<');
    expect(variant.provider).toBe('stitch');
  });

  it('generateVariants returns mock variants', async () => {
    const provider = new StitchProvider();
    const baseVariant = makeMockVariant('base');
    const request: GenerateVariantsRequest = {
      baseVariant,
      count: 5,
      creativeRange: 'REFINE',
      prompt: 'test',
      designConstraint: null,
    };
    const variants = await provider.generateVariants(request);
    expect(variants.length).toBeGreaterThanOrEqual(3);
    for (const v of variants) {
      expect(v.provider).toBe('stitch');
    }
  });
});

// ---------------------------------------------------------------------------
// PostProcessor.patchFonts
// ---------------------------------------------------------------------------

describe('PostProcessor.patchFonts', () => {
  it('replaces font-family in style blocks', () => {
    const html = `<html><head><style>body { font-family: Inter, sans-serif; }</style></head><body></body></html>`;
    const target = '"PingFang SC", -apple-system, sans-serif';
    const result = PostProcessor.patchFonts(html, target);
    expect(result.html).toContain(target);
    expect(result.html).not.toContain('Inter');
    expect(result.patchCount).toBeGreaterThanOrEqual(1);
  });

  it('replaces font-family in inline styles', () => {
    const html = `<div style="font-family: Roboto, Arial, sans-serif;">Hello</div>`;
    const target = '"SF Pro Display", sans-serif';
    const result = PostProcessor.patchFonts(html, target);
    expect(result.html).toContain(target);
    expect(result.html).not.toContain('Roboto');
    expect(result.patchCount).toBeGreaterThanOrEqual(1);
  });

  it('returns zero patchCount when no font-family found', () => {
    const html = `<html><body><p>No fonts here</p></body></html>`;
    const result = PostProcessor.patchFonts(html, 'sans-serif');
    expect(result.patchCount).toBe(0);
    expect(result.html).toBe(html);
  });

  it('handles multiple font-family declarations', () => {
    const html = `<style>
      h1 { font-family: "Google Sans", sans-serif; }
      p { font-family: Inter, Arial; }
    </style>`;
    const target = '"PingFang SC", sans-serif';
    const result = PostProcessor.patchFonts(html, target);
    expect(result.patchCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// PreviewEngine
// ---------------------------------------------------------------------------

describe('PreviewEngine', () => {
  let engine: PreviewEngine;

  beforeEach(() => {
    engine = new PreviewEngine();
  });

  afterEach(async () => {
    await engine.stop();
  });

  it('starts on an available port and stops cleanly', async () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2')];
    const pageSpec: PageSpec = {
      name: 'home',
      description: 'Home page',
      platform: 'web',
      deviceType: 'DESKTOP',
      existingStyleConstraint: null,
    };

    const session = await engine.start(variants, pageSpec);
    expect(session.port).toBeGreaterThan(0);
    expect(session.url).toContain('http://');

    // Verify server responds
    const response = await fetch(session.url);
    expect(response.ok).toBe(true);
    const html = await response.text();
    expect(html).toContain('Variant');

    await engine.stop();
  });

  it('resolves awaitSelection when POST /api/select is called', async () => {
    const variants = [makeMockVariant('v1')];
    const pageSpec: PageSpec = {
      name: 'test',
      description: 'Test page',
      platform: 'web',
      deviceType: 'DESKTOP',
      existingStyleConstraint: null,
    };

    const session = await engine.start(variants, pageSpec);

    const selectionPromise = engine.awaitSelection(session);

    // Simulate browser POST
    const selectResponse = await fetch(`${session.url}/api/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantId: 'v1',
        round: 1,
        feedback: null,
        action: 'select',
        hybridSelections: null,
        rollbackToRound: null,
        overrideDesignSystem: false,
      }),
    });
    expect(selectResponse.ok).toBe(true);

    const result = await selectionPromise;
    expect(result.action).toBe('select');
    expect(result.selectedVariantId).toBe('v1');
    expect(result.round).toBe(1);

    await engine.stop();
  });
});

// ---------------------------------------------------------------------------
// End-to-end orchestrator flow
// ---------------------------------------------------------------------------

describe('TasteOrchestrator end-to-end', () => {
  it('runs the full tracer flow with mock provider', async () => {
    const orchestrator = new TasteOrchestrator();

    const mockProvider = makeMockProvider('mock-e2e');
    orchestrator.registry.register(mockProvider);

    const pages: PageSpec[] = [
      {
        name: 'home',
        description: 'Home screen',
        platform: 'ios',
        deviceType: 'MOBILE',
        existingStyleConstraint: null,
      },
    ];

    // Run orchestrator with auto-select (simulate selection via callback)
    const resultPromise = orchestrator.run(pages, {
      projectRoot: '/tmp/test-project',
      screenshots: [],
      language: 'en',
      fontStack: 'sans-serif',
      liteMode: false,
      autoSelectVariantId: 'gen-1',
    });

    const result = await resultPromise;

    expect(result.tier).toBe(1);
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].selectedVariant).toBeTruthy();
    expect(result.pages[0].dna).toBeTruthy();
    expect(result.pages[0].dna.colorPalette).toBeTruthy();
  });
});
