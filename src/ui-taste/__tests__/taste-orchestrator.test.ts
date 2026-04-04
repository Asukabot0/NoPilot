/**
 * Tests for MOD-009: TasteOrchestrator.
 * Covers: full flow, style detection, tier switching, tier 3 fallback,
 * iteration loop, dark/light pairs, override style, save results,
 * progress notifications, cleanup on error.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  DesignProvider,
  DesignVariant,
  DesignDNA,
  DesignSystemRef,
  PageSpec,
  PageResult,
  TasteOrchestratorOptions,
  GenerateScreenRequest,
  GenerateVariantsRequest,
} from '../types.js';
import { TasteOrchestrator } from '../taste-orchestrator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let variantCounter = 0;

function makeMockVariant(id?: string, html?: string): DesignVariant {
  const vid = id ?? `mock-var-${++variantCounter}`;
  return {
    id: vid,
    screenId: `screen-${vid}`,
    htmlCode: html ?? `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${vid}</title><style>:root { --bg: #ffffff; --primary: #3b82f6; } body { font-family: Inter, sans-serif; background: var(--bg); }</style></head><body><h1>${vid}</h1></body></html>`,
    screenshotUrl: null,
    metadata: {
      title: `Variant ${vid}`,
      prompt: 'test prompt',
      creativeRange: 'REFINE',
      modelId: null,
      generatedAt: new Date().toISOString(),
    },
    provider: 'mock',
    deviceType: 'DESKTOP',
  };
}

function makeDarkVariant(id?: string): DesignVariant {
  const vid = id ?? `mock-dark-${++variantCounter}`;
  return makeMockVariant(vid, `<!DOCTYPE html><html><head><style>:root { --bg: #1a1a2e; --primary: #3b82f6; } body { font-family: Inter, sans-serif; background: var(--bg); }</style></head><body><h1>${vid}</h1></body></html>`);
}

function makeMockDNA(overrides?: Partial<DesignDNA>): DesignDNA {
  return {
    colorPalette: { primary: '#3b82f6', secondary: '#10b981', background: '#ffffff' },
    typography: { display: '48px', headline: '32px', body: '16px', label: '12px' },
    spacing: [4, 8, 16, 24, 32],
    borderRadius: { sm: '4px', md: '8px', lg: '16px' },
    shadows: ['0 1px 3px rgba(0,0,0,0.1)'],
    animationLevel: 'subtle',
    designMd: '# Mock Design System',
    rawProviderData: null,
    ...overrides,
  };
}

function makePageSpec(name?: string): PageSpec {
  return {
    name: name ?? 'home',
    description: 'Test page',
    platform: 'web',
    deviceType: 'DESKTOP',
    existingStyleConstraint: null,
  };
}

function makeOptions(overrides?: Partial<TasteOrchestratorOptions>): TasteOrchestratorOptions {
  return {
    projectRoot: '/tmp/nopilot-test-' + Date.now(),
    screenshots: [],
    language: 'en',
    fontStack: 'Inter, sans-serif',
    liteMode: false,
    autoSelectVariantId: 'gen-1',
    ...overrides,
  };
}

interface MockProviderOptions {
  name?: string;
  available?: boolean;
  generateScreenFn?: (r: GenerateScreenRequest) => Promise<DesignVariant>;
  generateVariantsFn?: (r: GenerateVariantsRequest) => Promise<DesignVariant[]>;
  extractDNAFn?: (v: DesignVariant) => Promise<DesignDNA>;
  throwOnGenerate?: string;
}

function makeMockProvider(opts: MockProviderOptions = {}): DesignProvider {
  const providerName = opts.name ?? 'mock';
  return {
    name: () => providerName,
    isAvailable: async () => opts.available !== false,
    generateScreen: opts.generateScreenFn ?? (async (_r: GenerateScreenRequest) => {
      if (opts.throwOnGenerate) throw new Error(opts.throwOnGenerate);
      return makeMockVariant('gen-1');
    }),
    generateVariants: opts.generateVariantsFn ?? (async (r: GenerateVariantsRequest) => {
      if (opts.throwOnGenerate) throw new Error(opts.throwOnGenerate);
      const count = Math.max(r.count, 3);
      return Array.from({ length: count }, (_, i) => makeMockVariant(`var-${i + 1}`));
    }),
    extractDesignContext: opts.extractDNAFn ?? (async (_v: DesignVariant) => makeMockDNA()),
    createDesignSystem: async (_d: DesignDNA) => ({
      id: `ds-${Date.now()}`,
      provider: providerName,
      projectId: `proj-${Date.now()}`,
    }),
    applyDesignSystem: async () => {},
  };
}

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nopilot-orch-test-'));
  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TasteOrchestrator', () => {
  let orchestrator: TasteOrchestrator;

  beforeEach(() => {
    variantCounter = 0;
    orchestrator = new TasteOrchestrator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Full flow with mock provider ---

  describe('run() full flow', () => {
    it('runs the full flow with mock provider and returns results', async () => {
      const provider = makeMockProvider();
      orchestrator.registry.register(provider);

      const pages = [makePageSpec('home')];
      const options = makeOptions();

      const result = await orchestrator.run(pages, options);

      expect(result.tier).toBe(1);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].selectedVariant).toBeTruthy();
      expect(result.pages[0].selectedVariant.id).toBe('gen-1');
      expect(result.pages[0].dna).toBeTruthy();
      expect(result.pages[0].dna.colorPalette).toBeTruthy();
      expect(result.totalApiCalls).toBeGreaterThan(0);
    });

    it('processes multiple pages sequentially', async () => {
      const provider = makeMockProvider();
      orchestrator.registry.register(provider);

      const pages = [makePageSpec('home'), makePageSpec('settings'), makePageSpec('profile')];
      const options = makeOptions();

      const result = await orchestrator.run(pages, options);

      expect(result.pages).toHaveLength(3);
      expect(result.pages[0].page.name).toBe('home');
      expect(result.pages[1].page.name).toBe('settings');
      expect(result.pages[2].page.name).toBe('profile');
    });

    it('respects liteMode by processing only first page', async () => {
      const provider = makeMockProvider();
      orchestrator.registry.register(provider);

      const pages = [makePageSpec('home'), makePageSpec('settings')];
      const options = makeOptions({ liteMode: true });

      const result = await orchestrator.run(pages, options);

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].page.name).toBe('home');
    });

    it('state transitions to complete on success', async () => {
      const provider = makeMockProvider();
      orchestrator.registry.register(provider);

      expect(orchestrator.getState()).toBe('idle');

      await orchestrator.run([makePageSpec()], makeOptions());

      expect(orchestrator.getState()).toBe('complete');
    });

    it('state transitions to failed on error', async () => {
      const provider = makeMockProvider({ throwOnGenerate: 'GENERATION_FAILED: test error' });
      orchestrator.registry.register(provider);

      await expect(
        orchestrator.run([makePageSpec()], makeOptions()),
      ).rejects.toThrow('GENERATION_FAILED');

      expect(orchestrator.getState()).toBe('failed');
    });
  });

  // --- Style detection integration ---

  describe('detectExistingStyle()', () => {
    it('detects CSS style from project root', async () => {
      const tmpDir = makeTmpDir();
      const cssContent = `
        :root {
          --primary: #3b82f6;
          --secondary: #10b981;
        }
        body {
          font-family: Inter, sans-serif;
          color: #1f2937;
          background-color: #ffffff;
        }
      `;
      fs.writeFileSync(path.join(tmpDir, 'styles.css'), cssContent, 'utf-8');

      const result = await orchestrator.detectExistingStyle(tmpDir, []);

      expect(result).not.toBeNull();
      expect(result).toContain('Design System Constraints');
      expect(result).toContain('#3b82f6');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns null when no style files found', async () => {
      const tmpDir = makeTmpDir();

      const result = await orchestrator.detectExistingStyle(tmpDir, []);

      expect(result).toBeNull();

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns null on invalid project root', async () => {
      const result = await orchestrator.detectExistingStyle('/nonexistent/path', []);
      expect(result).toBeNull();
    });

    it('falls back to screenshot analysis when no CSS found', async () => {
      const tmpDir = makeTmpDir();

      // Screenshots analysis returns a low-confidence stub profile
      const result = await orchestrator.detectExistingStyle(tmpDir, ['/fake/screenshot.png']);

      // The stub returns confidence 0.3, which is > 0.2 threshold
      expect(result).not.toBeNull();
      expect(result).toContain('Design System Constraints');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // --- Tier switching on provider failure ---

  describe('tier switching', () => {
    it('switches to next provider on QUOTA_EXHAUSTED', async () => {
      let stitchCallCount = 0;
      let stitchAvailableOnRedetect = true;
      const quotaProvider = makeMockProvider({
        name: 'stitch',
        generateScreenFn: async () => {
          stitchCallCount++;
          if (stitchCallCount <= 1) {
            // After first failure, make stitch report unavailable on re-detect
            stitchAvailableOnRedetect = false;
            throw new Error('QUOTA_EXHAUSTED: limit reached');
          }
          return makeMockVariant('gen-1');
        },
      });
      // Override isAvailable to be dynamic
      quotaProvider.isAvailable = async () => stitchAvailableOnRedetect;

      const fallbackProvider = makeMockProvider({ name: 'agent-html' });

      orchestrator.registry.register(quotaProvider);
      orchestrator.registry.register(fallbackProvider);

      const result = await orchestrator.run([makePageSpec()], makeOptions());

      // Should have switched to agent-html (tier 2)
      expect(result.tier).toBe(2);
      expect(result.pages).toHaveLength(1);
    });
  });

  // --- Tier 3 fallback ---

  describe('runTier3()', () => {
    it('returns tier 3 result when no providers available', async () => {
      // Register no providers → detectAndSelect returns null → tier 3
      const result = await orchestrator.run([makePageSpec('home')], makeOptions());

      expect(result.tier).toBe(3);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].selectedVariant.provider).toBe('tier3-text');
      expect(result.pages[0].dna.designMd).toContain('Tier 3');
      expect(result.pages[0].iterationRounds).toBe(0);
      expect(result.totalApiCalls).toBe(0);
    });

    it('runTier3 produces placeholder variants for all pages', async () => {
      const pages = [makePageSpec('home'), makePageSpec('settings')];
      const result = await orchestrator.runTier3(pages);

      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].selectedVariant.htmlCode).toContain('Tier 3');
      expect(result.pages[1].selectedVariant.htmlCode).toContain('settings');
      expect(result.tier).toBe(3);
    });

    it('runTier3 builds designMd from page spec', async () => {
      const page = makePageSpec('dashboard');
      page.platform = 'ios';
      page.deviceType = 'MOBILE';

      const result = await orchestrator.runTier3([page]);

      const dna = result.pages[0].dna;
      expect(dna.designMd).toContain('dashboard');
      expect(dna.designMd).toContain('ios');
      expect(dna.designMd).toContain('MOBILE');
    });
  });

  // --- Iteration loop ---

  describe('processPage() iteration', () => {
    it('auto-select bypasses preview and iteration', async () => {
      const provider = makeMockProvider();

      const result = await orchestrator.processPage(
        makePageSpec(),
        null,
        provider,
        makeOptions({ autoSelectVariantId: 'var-1' }),
      );

      expect(result.selectedVariant.id).toBe('var-1');
      expect(result.iterationRounds).toBe(1);
    });

    it('auto-select falls back to base variant for unknown id', async () => {
      const provider = makeMockProvider();

      const result = await orchestrator.processPage(
        makePageSpec(),
        null,
        provider,
        makeOptions({ autoSelectVariantId: 'nonexistent' }),
      );

      // Falls back to baseVariant (gen-1)
      expect(result.selectedVariant.id).toBe('gen-1');
    });

    it('applies design system ref to subsequent pages', async () => {
      const capturedRefs: Array<DesignSystemRef | null> = [];
      const trackingProvider = makeMockProvider({
        generateScreenFn: async (r: GenerateScreenRequest) => {
          capturedRefs.push(r.designSystemRef);
          return makeMockVariant('gen-1');
        },
      });
      orchestrator.registry.register(trackingProvider);

      const pages = [makePageSpec('home'), makePageSpec('settings')];
      const result = await orchestrator.run(pages, makeOptions());

      expect(result.pages).toHaveLength(2);
      // First page: no design system ref yet
      expect(capturedRefs[0]).toBeNull();
      // Second page: should have received the design system ref created after page 1
      expect(capturedRefs[1]).not.toBeNull();
      expect(capturedRefs[1]!.provider).toBe('mock');
    });
  });

  // --- Dark/light pair generation ---

  describe('generateDarkLightPair()', () => {
    it('generates dark variant for light source', async () => {
      const provider = makeMockProvider();
      const lightVariant = makeMockVariant('light-1');

      const pair = await orchestrator.generateDarkLightPair(lightVariant, provider);

      expect(pair.darkVariant).not.toBeNull();
      expect(pair.lightVariant).toBeNull();
    });

    it('generates light variant for dark source', async () => {
      const provider = makeMockProvider();
      const darkVariant = makeDarkVariant('dark-1');

      const pair = await orchestrator.generateDarkLightPair(darkVariant, provider);

      expect(pair.lightVariant).not.toBeNull();
      expect(pair.darkVariant).toBeNull();
    });

    it('returns nulls on generation failure', async () => {
      const provider = makeMockProvider({
        generateScreenFn: async () => { throw new Error('GENERATION_FAILED'); },
      });
      const variant = makeMockVariant('v1');

      const pair = await orchestrator.generateDarkLightPair(variant, provider);

      expect(pair.darkVariant).toBeNull();
      expect(pair.lightVariant).toBeNull();
    });
  });

  // --- Override style ---

  describe('handleOverrideStyle()', () => {
    it('processes page without design system ref', async () => {
      const provider = makeMockProvider();
      let capturedRef: DesignSystemRef | null = 'sentinel' as unknown as DesignSystemRef;

      const trackingProvider = makeMockProvider({
        generateScreenFn: async (r: GenerateScreenRequest) => {
          capturedRef = r.designSystemRef;
          return makeMockVariant('gen-1');
        },
      });

      const result = await orchestrator.handleOverrideStyle(
        makePageSpec(),
        trackingProvider,
        makeOptions(),
      );

      expect(result.selectedVariant).toBeTruthy();
      expect(capturedRef).toBeNull();
    });
  });

  // --- handleRegeneratePair ---

  describe('handleRegeneratePair()', () => {
    it('regenerates pair with feedback constraint', async () => {
      let capturedPrompt = '';
      const provider = makeMockProvider({
        generateScreenFn: async (r: GenerateScreenRequest) => {
          capturedPrompt = r.prompt;
          return makeMockVariant('regen-1');
        },
      });

      const variant = makeMockVariant('original');
      const pair = await orchestrator.handleRegeneratePair(variant, 'warmer colors', provider);

      expect(pair.darkVariant).not.toBeNull();
      expect(capturedPrompt).toContain('warmer colors');
    });

    it('regenerates pair without feedback', async () => {
      const provider = makeMockProvider();
      const variant = makeMockVariant('original');

      const pair = await orchestrator.handleRegeneratePair(variant, null, provider);

      expect(pair.darkVariant).not.toBeNull();
    });
  });

  // --- Save results ---

  describe('saveResults()', () => {
    it('writes mockup HTML files to specs/mockups/', async () => {
      const tmpDir = makeTmpDir();
      const pageResult: PageResult = {
        page: makePageSpec('home'),
        selectedVariant: makeMockVariant('selected-1'),
        darkVariant: null,
        dna: makeMockDNA(),
        iterationRounds: 1,
      };

      const paths = await orchestrator.saveResults([pageResult], makeMockDNA(), null, tmpDir);

      const mockupsDir = path.join(tmpDir, 'specs', 'mockups');
      expect(fs.existsSync(path.join(mockupsDir, 'home.html'))).toBe(true);
      expect(fs.existsSync(path.join(mockupsDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(mockupsDir, 'tokens.json'))).toBe(true);
      expect(paths.length).toBeGreaterThanOrEqual(3);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('writes dark variant HTML when present', async () => {
      const tmpDir = makeTmpDir();
      const pageResult: PageResult = {
        page: makePageSpec('home'),
        selectedVariant: makeMockVariant('selected-1'),
        darkVariant: makeDarkVariant('dark-1'),
        dna: makeMockDNA(),
        iterationRounds: 1,
      };

      const paths = await orchestrator.saveResults([pageResult], makeMockDNA(), null, tmpDir);

      const mockupsDir = path.join(tmpDir, 'specs', 'mockups');
      expect(fs.existsSync(path.join(mockupsDir, 'home-dark.html'))).toBe(true);
      expect(paths).toContain(path.join(mockupsDir, 'home-dark.html'));

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('generates index.html with links to all pages', async () => {
      const tmpDir = makeTmpDir();
      const results: PageResult[] = [
        { page: makePageSpec('home'), selectedVariant: makeMockVariant('s1'), darkVariant: null, dna: makeMockDNA(), iterationRounds: 1 },
        { page: makePageSpec('settings'), selectedVariant: makeMockVariant('s2'), darkVariant: null, dna: makeMockDNA(), iterationRounds: 1 },
      ];

      await orchestrator.saveResults(results, makeMockDNA(), null, tmpDir);

      const indexPath = path.join(tmpDir, 'specs', 'mockups', 'index.html');
      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      expect(indexContent).toContain('home.html');
      expect(indexContent).toContain('settings.html');
      expect(indexContent).toContain('tokens.json');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('exports DTCG tokens to tokens.json', async () => {
      const tmpDir = makeTmpDir();
      const pageResult: PageResult = {
        page: makePageSpec('home'),
        selectedVariant: makeMockVariant('s1'),
        darkVariant: null,
        dna: makeMockDNA(),
        iterationRounds: 1,
      };

      await orchestrator.saveResults([pageResult], makeMockDNA(), null, tmpDir);

      const tokensPath = path.join(tmpDir, 'specs', 'mockups', 'tokens.json');
      const tokensContent = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
      expect(tokensContent).toHaveProperty('color');
      expect(tokensContent).toHaveProperty('typography');
      expect(tokensContent).toHaveProperty('spacing');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('writes UITasteConstraint to discover.json when it exists', async () => {
      const tmpDir = makeTmpDir();
      const discoverDir = path.join(tmpDir, 'specs', 'discover');
      fs.mkdirSync(discoverDir, { recursive: true });
      fs.writeFileSync(
        path.join(discoverDir, 'index.json'),
        JSON.stringify({ phase: 'discover', version: '4.0' }),
        'utf-8',
      );

      const pageResult: PageResult = {
        page: makePageSpec('home'),
        selectedVariant: makeMockVariant('s1'),
        darkVariant: null,
        dna: makeMockDNA(),
        iterationRounds: 1,
      };

      await orchestrator.saveResults([pageResult], makeMockDNA(), 'proj-123', tmpDir);

      const discover = JSON.parse(
        fs.readFileSync(path.join(discoverDir, 'index.json'), 'utf-8'),
      );
      expect(discover.ui_taste).toBeTruthy();
      expect(discover.ui_taste.tokensPath).toBe('specs/mockups/tokens.json');
      expect(discover.ui_taste.stitchProjectId).toBe('proj-123');
      expect(discover.ui_taste.selectedPages).toHaveLength(1);
      expect(discover.ui_taste.selectedPages[0].name).toBe('home');
      // Backward compatible: original fields preserved
      expect(discover.phase).toBe('discover');
      expect(discover.version).toBe('4.0');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('skips discover.json write when file does not exist', async () => {
      const tmpDir = makeTmpDir();
      const pageResult: PageResult = {
        page: makePageSpec('home'),
        selectedVariant: makeMockVariant('s1'),
        darkVariant: null,
        dna: makeMockDNA(),
        iterationRounds: 1,
      };

      // Should not throw
      await orchestrator.saveResults([pageResult], makeMockDNA(), null, tmpDir);

      // discover.json should NOT be created
      expect(fs.existsSync(path.join(tmpDir, 'specs', 'discover', 'index.json'))).toBe(false);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // --- Progress notifications ---

  describe('notifyUser()', () => {
    it('writes progress messages to stderr', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      orchestrator.notifyUser('progress', 'Generating variant 3/5...');

      expect(stderrSpy).toHaveBeenCalledWith('[INFO] Generating variant 3/5...\n');
    });

    it('writes quota warning messages', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      orchestrator.notifyUser('quota_warning', 'Quota at 80%');

      expect(stderrSpy).toHaveBeenCalledWith('[QUOTA] Quota at 80%\n');
    });

    it('writes tier switch messages', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      orchestrator.notifyUser('tier_switch', 'Switching to Tier 2...');

      expect(stderrSpy).toHaveBeenCalledWith('[TIER] Switching to Tier 2...\n');
    });

    it('writes error messages', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      orchestrator.notifyUser('error', 'Generation failed');

      expect(stderrSpy).toHaveBeenCalledWith('[ERROR] Generation failed\n');
    });
  });

  // --- Cleanup on error ---

  describe('cleanup on error', () => {
    it('transitions to failed state and cleans up on error', async () => {
      const provider = makeMockProvider({
        generateScreenFn: async () => { throw new Error('GENERATION_FAILED: catastrophic'); },
      });
      orchestrator.registry.register(provider);

      await expect(
        orchestrator.run([makePageSpec()], makeOptions()),
      ).rejects.toThrow('GENERATION_FAILED');

      expect(orchestrator.getState()).toBe('failed');
    });
  });

  // --- Full flow with save results integration ---

  describe('run() with save results', () => {
    it('saves results to disk during full flow', async () => {
      const tmpDir = makeTmpDir();
      const provider = makeMockProvider();
      orchestrator.registry.register(provider);

      const result = await orchestrator.run(
        [makePageSpec('dashboard')],
        makeOptions({ projectRoot: tmpDir }),
      );

      const mockupsDir = path.join(tmpDir, 'specs', 'mockups');
      expect(fs.existsSync(path.join(mockupsDir, 'dashboard.html'))).toBe(true);
      expect(fs.existsSync(path.join(mockupsDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(mockupsDir, 'tokens.json'))).toBe(true);
      expect(result.mockupsDir).toBe('specs/mockups/');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // --- Page name sanitization ---

  describe('page name sanitization', () => {
    it('sanitizes special characters in page names for file paths', async () => {
      const tmpDir = makeTmpDir();
      const pageResult: PageResult = {
        page: makePageSpec('my page/test'),
        selectedVariant: makeMockVariant('s1'),
        darkVariant: null,
        dna: makeMockDNA(),
        iterationRounds: 1,
      };

      await orchestrator.saveResults([pageResult], makeMockDNA(), null, tmpDir);

      const mockupsDir = path.join(tmpDir, 'specs', 'mockups');
      expect(fs.existsSync(path.join(mockupsDir, 'my-page-test.html'))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // --- Fix 1: regenerate_pair action type is valid and handleRegeneratePair works ---

  describe('regenerate_pair action', () => {
    it('handleRegeneratePair is callable with regenerate_pair action type', async () => {
      let capturedPrompt = '';
      const provider = makeMockProvider({
        generateScreenFn: async (r: GenerateScreenRequest) => {
          capturedPrompt = r.prompt;
          return makeMockVariant('regen-1');
        },
      });

      const variant = makeMockVariant('original');
      const pair = await orchestrator.handleRegeneratePair(variant, 'better contrast', provider);

      expect(pair.darkVariant).not.toBeNull();
      expect(capturedPrompt).toContain('Regenerate');
      expect(capturedPrompt).toContain('better contrast');
    });

    it('SelectionResult accepts regenerate_pair action', () => {
      // Type-level test: if this compiles, the type is correct
      const result: import('../types.js').SelectionResult = {
        action: 'regenerate_pair',
        selectedVariantId: 'v1',
        feedback: null,
        hybridSelections: null,
        rollbackToRound: null,
        round: 1,
      };
      expect(result.action).toBe('regenerate_pair');
    });
  });

  // --- Fix 2: REIMAGINE for greenfield, REFINE for existing project ---

  describe('creativeRange selection', () => {
    it('uses REIMAGINE for greenfield pages (no existingStyleConstraint)', async () => {
      let capturedRange: string | null = null;
      const provider = makeMockProvider({
        generateVariantsFn: async (r: GenerateVariantsRequest) => {
          capturedRange = r.creativeRange;
          return Array.from({ length: r.count }, (_, i) => makeMockVariant(`var-${i + 1}`));
        },
      });

      const page = makePageSpec('home');
      page.existingStyleConstraint = null; // greenfield

      await orchestrator.processPage(page, null, provider, makeOptions());

      expect(capturedRange).toBe('REIMAGINE');
    });

    it('uses REFINE for pages with existingStyleConstraint', async () => {
      let capturedRange: string | null = null;
      const provider = makeMockProvider({
        generateVariantsFn: async (r: GenerateVariantsRequest) => {
          capturedRange = r.creativeRange;
          return Array.from({ length: r.count }, (_, i) => makeMockVariant(`var-${i + 1}`));
        },
      });

      const page = makePageSpec('home');
      page.existingStyleConstraint = '## Existing Style\n- primary: #3b82f6';

      await orchestrator.processPage(page, null, provider, makeOptions());

      expect(capturedRange).toBe('REFINE');
    });
  });

  // --- Fix 3: Tier-dependent token export ---

  describe('tier-dependent token export', () => {
    it('Tier 1 exports DTCG tokens to tokens.json', async () => {
      const tmpDir = makeTmpDir();
      const pageResult: PageResult = {
        page: makePageSpec('home'),
        selectedVariant: makeMockVariant('s1'),
        darkVariant: null,
        dna: makeMockDNA(),
        iterationRounds: 1,
      };

      await orchestrator.saveResults([pageResult], makeMockDNA(), null, tmpDir, 1);

      const mockupsDir = path.join(tmpDir, 'specs', 'mockups');
      expect(fs.existsSync(path.join(mockupsDir, 'tokens.json'))).toBe(true);
      expect(fs.existsSync(path.join(mockupsDir, 'tokens.css'))).toBe(false);

      const tokensContent = JSON.parse(fs.readFileSync(path.join(mockupsDir, 'tokens.json'), 'utf-8'));
      expect(tokensContent).toHaveProperty('color');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('Tier 2 exports CSS custom properties to tokens.css', async () => {
      const tmpDir = makeTmpDir();
      const pageResult: PageResult = {
        page: makePageSpec('home'),
        selectedVariant: makeMockVariant('s1'),
        darkVariant: null,
        dna: makeMockDNA(),
        iterationRounds: 1,
      };

      await orchestrator.saveResults([pageResult], makeMockDNA(), null, tmpDir, 2);

      const mockupsDir = path.join(tmpDir, 'specs', 'mockups');
      expect(fs.existsSync(path.join(mockupsDir, 'tokens.css'))).toBe(true);
      expect(fs.existsSync(path.join(mockupsDir, 'tokens.json'))).toBe(false);

      const cssContent = fs.readFileSync(path.join(mockupsDir, 'tokens.css'), 'utf-8');
      expect(cssContent).toContain(':root');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('no tier specified defaults to DTCG export', async () => {
      const tmpDir = makeTmpDir();
      const pageResult: PageResult = {
        page: makePageSpec('home'),
        selectedVariant: makeMockVariant('s1'),
        darkVariant: null,
        dna: makeMockDNA(),
        iterationRounds: 1,
      };

      await orchestrator.saveResults([pageResult], makeMockDNA(), null, tmpDir);

      const mockupsDir = path.join(tmpDir, 'specs', 'mockups');
      expect(fs.existsSync(path.join(mockupsDir, 'tokens.json'))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // --- Fix 4: overrideDesignSystem field on SelectionResult ---

  describe('overrideDesignSystem', () => {
    it('SelectionResult accepts overrideDesignSystem field', () => {
      const result: import('../types.js').SelectionResult = {
        action: 'select',
        selectedVariantId: 'v1',
        feedback: null,
        hybridSelections: null,
        rollbackToRound: null,
        round: 1,
        overrideDesignSystem: true,
      };
      expect(result.overrideDesignSystem).toBe(true);
    });

    it('handleOverrideStyle processes page without design system ref (REIMAGINE path)', async () => {
      let capturedRef: DesignSystemRef | null = 'sentinel' as unknown as DesignSystemRef;
      const provider = makeMockProvider({
        generateScreenFn: async (r: GenerateScreenRequest) => {
          capturedRef = r.designSystemRef;
          return makeMockVariant('gen-1');
        },
      });

      const result = await orchestrator.handleOverrideStyle(
        makePageSpec(),
        provider,
        makeOptions(),
      );

      expect(result.selectedVariant).toBeTruthy();
      // handleOverrideStyle passes null designSystemRef
      expect(capturedRef).toBeNull();
    });
  });
});
