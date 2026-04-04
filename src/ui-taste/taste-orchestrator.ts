/**
 * MOD-009: Taste Orchestrator — main entry point for UI taste exploration.
 * Coordinates the full Phase 0-8 lifecycle: style detection, provider selection,
 * page-by-page variant generation, iteration, dark/light pairing, post-processing,
 * token export, and final save.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DesignProvider,
  DesignDNA,
  DesignSystemRef,
  DesignVariant,
  PageSpec,
  PageResult,
  TasteOrchestratorOptions,
  TasteExplorationResult,
  UITasteConstraint,
} from './types.js';
import { ProviderRegistry } from './design-provider.js';
import type { DetectResult } from './design-provider.js';
import { PreviewEngine } from './preview-engine.js';
import { PostProcessor } from './post-processor.js';
import { IterationEngine } from './iteration-engine.js';
import type { IterationOutcome } from './iteration-engine.js';
import { StyleDetector } from './style-detector.js';
import { TokenExporter } from './token-exporter.js';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type OrchestratorState =
  | 'idle'
  | 'detecting_style'
  | 'selecting_provider'
  | 'processing_page'
  | 'tier3_text'
  | 'saving_results'
  | 'complete'
  | 'failed';

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export type NotificationType = 'progress' | 'quota_warning' | 'tier_switch' | 'error';

// ---------------------------------------------------------------------------
// TasteOrchestrator
// ---------------------------------------------------------------------------

export class TasteOrchestrator {
  readonly registry: ProviderRegistry;
  private previewEngine: PreviewEngine;
  private styleDetector: StyleDetector;
  private tokenExporter: TokenExporter;
  private state: OrchestratorState = 'idle';
  private totalApiCalls = 0;

  constructor() {
    this.registry = new ProviderRegistry();
    this.previewEngine = new PreviewEngine();
    this.styleDetector = new StyleDetector();
    this.tokenExporter = new TokenExporter();
  }

  /** Current state (for testing). */
  getState(): OrchestratorState {
    return this.state;
  }

  // -------------------------------------------------------------------------
  // 1. run() — Main entry point
  // -------------------------------------------------------------------------

  async run(
    pages: PageSpec[],
    options: TasteOrchestratorOptions,
  ): Promise<TasteExplorationResult> {
    this.state = 'detecting_style';
    this.totalApiCalls = 0;

    const pagesToProcess = options.liteMode ? pages.slice(0, 1) : pages;

    try {
      // Phase 1: Detect existing style
      let styleConstraint: string | null = null;
      if (options.projectRoot) {
        styleConstraint = await this.detectExistingStyle(
          options.projectRoot,
          options.screenshots,
        );
      }

      // Phase 2: Select provider
      this.state = 'selecting_provider';
      const detection = await this.registry.detectAndSelect();

      if (!detection) {
        // Tier 3 fallback
        this.notifyUser('tier_switch', 'No providers available. Switching to Tier 3 text-based mode.');
        const result = await this.runTier3(pagesToProcess);
        return result;
      }

      let { provider, tier } = detection;

      // Apply existing style constraint to page specs
      if (styleConstraint) {
        for (const page of pagesToProcess) {
          if (!page.existingStyleConstraint) {
            page.existingStyleConstraint = styleConstraint;
          }
        }
      }

      // Phase 3: Process pages
      this.state = 'processing_page';
      const pageResults: PageResult[] = [];
      let designSystemRef: DesignSystemRef | null = null;

      for (let i = 0; i < pagesToProcess.length; i++) {
        const page = pagesToProcess[i];
        this.notifyUser('progress', `Processing page ${i + 1}/${pagesToProcess.length}: ${page.name}`);

        try {
          const result = await this.processPage(page, designSystemRef, provider, options);
          pageResults.push(result);

          // After first page: extract design context and create design system
          if (i === 0 && designSystemRef === null) {
            const dna = result.dna;
            designSystemRef = await provider.createDesignSystem(dna);
            this.totalApiCalls++;
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes('QUOTA_EXHAUSTED')) {
            this.notifyUser('quota_warning', 'Quota exhausted. Switching to next available provider.');

            // Re-detect: skip to next tier
            this.state = 'selecting_provider';
            const fallback = await this.registry.detectAndSelect();
            if (!fallback) {
              this.notifyUser('tier_switch', 'No fallback provider. Switching to Tier 3.');
              const tier3Result = await this.runTier3(pagesToProcess.slice(i));
              // Merge already-processed pages with tier3 results
              return {
                pages: [...pageResults, ...tier3Result.pages],
                tokensPath: tier3Result.tokensPath,
                mockupsDir: tier3Result.mockupsDir,
                designSystemRef,
                stitchProjectId: null,
                tier: 3,
                totalApiCalls: this.totalApiCalls,
              };
            }
            provider = fallback.provider;
            tier = fallback.tier;
            this.notifyUser('tier_switch', `Switched to ${provider.name()} (Tier ${tier})`);
            this.state = 'processing_page';
            // Retry current page with new provider
            i--;
            continue;
          }
          throw err;
        }
      }

      // Phase 4: Generate dark/light pairs
      for (const result of pageResults) {
        try {
          const pair = await this.generateDarkLightPair(result.selectedVariant, provider);
          if (pair.darkVariant) {
            result.darkVariant = pair.darkVariant;
          }
        } catch {
          // Dark/light generation is best-effort
        }
      }

      // Phase 5: Save results
      this.state = 'saving_results';
      const stitchProjectId = designSystemRef?.projectId ?? null;
      const dna = pageResults[0]?.dna ?? this.makeEmptyDNA();
      const savedPaths = await this.saveResults(pageResults, dna, stitchProjectId, options.projectRoot, tier);

      this.state = 'complete';

      return {
        pages: pageResults,
        tokensPath: savedPaths.find((p) => p.endsWith('tokens.json') || p.endsWith('tokens.css'))
          ?? (tier === 2 ? 'specs/mockups/tokens.css' : 'specs/mockups/tokens.json'),
        mockupsDir: 'specs/mockups/',
        designSystemRef,
        stitchProjectId,
        tier,
        totalApiCalls: this.totalApiCalls,
      };
    } catch (err) {
      this.state = 'failed';
      await this.cleanup();
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // 2. detectExistingStyle()
  // -------------------------------------------------------------------------

  async detectExistingStyle(
    projectRoot: string,
    screenshots: string[],
  ): Promise<string | null> {
    try {
      const { detected, profile } = await this.styleDetector.detect(projectRoot);

      if (detected && profile) {
        return this.styleDetector.synthesizeConstraint(profile);
      }

      // Try screenshots if no CSS/config found
      if (screenshots.length > 0) {
        const screenshotProfile = await this.styleDetector.analyzeScreenshots(screenshots);
        if (screenshotProfile.confidence > 0.2) {
          return this.styleDetector.synthesizeConstraint(screenshotProfile);
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // 3. processPage()
  // -------------------------------------------------------------------------

  async processPage(
    page: PageSpec,
    designSystemRef: DesignSystemRef | null,
    provider: DesignProvider,
    options: TasteOrchestratorOptions,
  ): Promise<PageResult> {
    // 1. Generate initial screen
    this.notifyUser('progress', `Generating base screen for ${page.name}...`);
    const baseVariant = await provider.generateScreen({
      pageSpec: page,
      prompt: `Generate a ${page.platform} ${page.name} screen: ${page.description}`,
      designSystemRef,
      language: options.language,
      fontStack: options.fontStack,
    });
    this.totalApiCalls++;

    // 2. Generate variants
    this.notifyUser('progress', `Generating 5 variants for ${page.name}...`);
    const creativeRange = page.existingStyleConstraint != null ? 'REFINE' : 'REIMAGINE';
    const variants = await provider.generateVariants({
      baseVariant,
      count: 5,
      creativeRange,
      prompt: `Create variations of ${page.name}: ${page.description}`,
      designConstraint: page.existingStyleConstraint,
    });
    this.totalApiCalls++;

    // 3. Post-process all HTML
    const allVariants = [baseVariant, ...variants];
    for (let i = 0; i < allVariants.length; i++) {
      this.notifyUser('progress', `Post-processing variant ${i + 1}/${allVariants.length}...`);
      const { html } = await PostProcessor.process(allVariants[i].htmlCode, {
        targetFontStack: options.fontStack,
        inlineAssets: true,
        verifyResponsive: true,
        assetDownloadTimeout: 10000,
      });
      allVariants[i].htmlCode = html;
    }

    // 4. Auto-select mode (testing) or preview mode
    if (options.autoSelectVariantId) {
      const selected = allVariants.find((v) => v.id === options.autoSelectVariantId) ?? baseVariant;
      const dna = await provider.extractDesignContext(selected);
      this.totalApiCalls++;
      return {
        page,
        selectedVariant: selected,
        darkVariant: null,
        dna,
        iterationRounds: 1,
      };
    }

    // 5. Start preview and iteration loop
    const iterationEngine = new IterationEngine();
    iterationEngine.setInitialVariants(allVariants);

    const session = await this.previewEngine.start(allVariants, page);
    this.previewEngine.openOrDisplay(session.url);

    let currentVariants = allVariants;
    let iterationRounds = 1;

    try {
      while (true) {
        const selection = await this.previewEngine.awaitSelection(session);

        // Handle regenerate_pair before routing to iteration engine
        if (selection.action === 'regenerate_pair') {
          const currentVariant = currentVariants.find((v) => v.id === selection.selectedVariantId) ?? baseVariant;
          const pair = await this.handleRegeneratePair(currentVariant, selection.feedback, provider);
          // Update preview with regenerated pair, keep current round
          const updatedVariants = [...currentVariants];
          if (pair.darkVariant) updatedVariants.push(pair.darkVariant);
          if (pair.lightVariant) updatedVariants.push(pair.lightVariant);
          currentVariants = updatedVariants;
          this.previewEngine.updateVariants(session, currentVariants, session.currentRound);
          continue;
        }

        // Handle overrideDesignSystem on select action
        if (selection.action === 'select' && selection.overrideDesignSystem === true) {
          await this.previewEngine.stop();
          return this.handleOverrideStyle(page, provider, options);
        }

        const outcome: IterationOutcome = await iterationEngine.processSelection(
          selection,
          provider,
          page,
          currentVariants,
        );

        if (outcome.type === 'selected') {
          const selectedVariant = outcome.selectedVariant ?? baseVariant;
          const dna = await provider.extractDesignContext(selectedVariant);
          this.totalApiCalls++;

          await this.previewEngine.stop();
          return {
            page,
            selectedVariant,
            darkVariant: null,
            dna,
            iterationRounds,
          };
        }

        if (outcome.type === 'new_round') {
          iterationRounds++;
          this.totalApiCalls++;
          currentVariants = outcome.newVariants!;

          // Post-process new variants
          for (const v of currentVariants) {
            const { html } = await PostProcessor.process(v.htmlCode, {
              targetFontStack: options.fontStack,
              inlineAssets: true,
              verifyResponsive: true,
              assetDownloadTimeout: 10000,
            });
            v.htmlCode = html;
          }

          this.previewEngine.updateVariants(session, currentVariants, outcome.round);
          this.notifyUser('progress', `Iteration round ${iterationRounds}: ${currentVariants.length} new variants`);
          continue;
        }

        if (outcome.type === 'rollback') {
          currentVariants = outcome.newVariants!;
          this.previewEngine.updateVariants(session, currentVariants, outcome.round);
          this.notifyUser('progress', `Rolled back to round ${outcome.round}`);
          continue;
        }
      }
    } catch (err: unknown) {
      await this.previewEngine.stop();
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // 4. generateDarkLightPair()
  // -------------------------------------------------------------------------

  async generateDarkLightPair(
    variant: DesignVariant,
    provider: DesignProvider,
  ): Promise<{ darkVariant: DesignVariant | null; lightVariant: DesignVariant | null }> {
    // Detect if variant is dark or light based on background color
    const isDark = this.detectIsDark(variant.htmlCode);

    const targetMode = isDark ? 'light' : 'dark';
    const prompt = `Generate the ${targetMode} mode counterpart of this design. Keep the same layout and structure.`;

    try {
      const counterpart = await provider.generateScreen({
        pageSpec: {
          name: `${variant.screenId}-${targetMode}`,
          description: `${targetMode} mode variant`,
          platform: 'web',
          deviceType: variant.deviceType,
          existingStyleConstraint: `Color mode: ${targetMode}. ${prompt}`,
        },
        prompt,
        designSystemRef: null,
        language: 'en',
        fontStack: 'Inter, sans-serif',
      });
      this.totalApiCalls++;

      if (isDark) {
        return { darkVariant: null, lightVariant: counterpart };
      } else {
        return { darkVariant: counterpart, lightVariant: null };
      }
    } catch {
      return { darkVariant: null, lightVariant: null };
    }
  }

  // -------------------------------------------------------------------------
  // 5. handleOverrideStyle()
  // -------------------------------------------------------------------------

  async handleOverrideStyle(
    page: PageSpec,
    provider: DesignProvider,
    options: TasteOrchestratorOptions,
  ): Promise<PageResult> {
    // Process page WITHOUT inherited designSystemRef (REIMAGINE mode)
    return this.processPage(page, null, provider, options);
  }

  // -------------------------------------------------------------------------
  // 6. handleRegeneratePair()
  // -------------------------------------------------------------------------

  async handleRegeneratePair(
    variant: DesignVariant,
    feedback: string | null,
    provider: DesignProvider,
  ): Promise<{ darkVariant: DesignVariant | null; lightVariant: DesignVariant | null }> {
    const isDark = this.detectIsDark(variant.htmlCode);
    const targetMode = isDark ? 'light' : 'dark';
    const feedbackConstraint = feedback ? ` User feedback: ${feedback}` : '';
    const prompt = `Regenerate the ${targetMode} mode counterpart.${feedbackConstraint}`;

    try {
      const counterpart = await provider.generateScreen({
        pageSpec: {
          name: `${variant.screenId}-${targetMode}-regen`,
          description: `Regenerated ${targetMode} mode variant`,
          platform: 'web',
          deviceType: variant.deviceType,
          existingStyleConstraint: `Color mode: ${targetMode}.${feedbackConstraint}`,
        },
        prompt,
        designSystemRef: null,
        language: 'en',
        fontStack: 'Inter, sans-serif',
      });
      this.totalApiCalls++;

      if (isDark) {
        return { darkVariant: null, lightVariant: counterpart };
      } else {
        return { darkVariant: counterpart, lightVariant: null };
      }
    } catch {
      return { darkVariant: null, lightVariant: null };
    }
  }

  // -------------------------------------------------------------------------
  // 7. saveResults()
  // -------------------------------------------------------------------------

  async saveResults(
    results: PageResult[],
    dna: DesignDNA,
    stitchProjectId: string | null,
    projectRoot?: string,
    tier?: 1 | 2 | 3,
  ): Promise<string[]> {
    const baseDir = projectRoot
      ? path.join(projectRoot, 'specs', 'mockups')
      : path.join(process.cwd(), 'specs', 'mockups');

    fs.mkdirSync(baseDir, { recursive: true });

    const savedPaths: string[] = [];

    // Save selected HTML for each page
    for (const result of results) {
      const pageName = result.page.name.replace(/[^a-zA-Z0-9_-]/g, '-');
      const htmlPath = path.join(baseDir, `${pageName}.html`);
      fs.writeFileSync(htmlPath, result.selectedVariant.htmlCode, 'utf-8');
      savedPaths.push(htmlPath);

      // Save dark variant if available
      if (result.darkVariant) {
        const darkPath = path.join(baseDir, `${pageName}-dark.html`);
        fs.writeFileSync(darkPath, result.darkVariant.htmlCode, 'utf-8');
        savedPaths.push(darkPath);
      }
    }

    // Generate index.html overview
    const indexPath = path.join(baseDir, 'index.html');
    const indexHtml = this.generateIndexHtml(results);
    fs.writeFileSync(indexPath, indexHtml, 'utf-8');
    savedPaths.push(indexPath);

    // Export tokens — Tier 2 exports CSS custom properties, others export DTCG JSON
    if (tier === 2) {
      const css = this.tokenExporter.exportCSS(dna);
      const tokensPath = path.join(baseDir, 'tokens.css');
      fs.writeFileSync(tokensPath, css, 'utf-8');
      savedPaths.push(tokensPath);
    } else {
      const { json } = this.tokenExporter.exportDTCG(dna);
      const tokensPath = path.join(baseDir, 'tokens.json');
      fs.writeFileSync(tokensPath, json, 'utf-8');
      savedPaths.push(tokensPath);
    }

    // Write UITasteConstraint to discover.json if projectRoot provided
    if (projectRoot) {
      this.saveUITasteConstraint(results, dna, stitchProjectId, projectRoot);
    }

    return savedPaths;
  }

  // -------------------------------------------------------------------------
  // 8. runTier3()
  // -------------------------------------------------------------------------

  async runTier3(pages: PageSpec[]): Promise<TasteExplorationResult> {
    this.state = 'tier3_text';
    this.notifyUser('progress', 'Running Tier 3 text-based taste exploration...');

    const pageResults: PageResult[] = [];

    for (const page of pages) {
      // Build a lightweight DesignDNA from page spec
      const dna: DesignDNA = {
        colorPalette: {},
        typography: {
          display: '48px',
          headline: '32px',
          body: '16px',
          label: '12px',
        },
        spacing: [4, 8, 16, 24, 32],
        borderRadius: { sm: '4px', md: '8px', lg: '16px' },
        shadows: [],
        animationLevel: 'subtle',
        designMd: this.buildTier3DesignMd(page),
        rawProviderData: null,
      };

      // Create a placeholder variant
      const variant: DesignVariant = {
        id: `tier3-${page.name}-${Date.now()}`,
        screenId: `tier3-screen-${page.name}`,
        htmlCode: `<!-- Tier 3: text-only placeholder for ${page.name} -->`,
        screenshotUrl: null,
        metadata: {
          title: `${page.name} (Tier 3)`,
          prompt: page.description,
          creativeRange: 'REFINE',
          modelId: null,
          generatedAt: new Date().toISOString(),
        },
        provider: 'tier3-text',
        deviceType: page.deviceType,
      };

      pageResults.push({
        page,
        selectedVariant: variant,
        darkVariant: null,
        dna,
        iterationRounds: 0,
      });
    }

    this.state = 'saving_results';

    return {
      pages: pageResults,
      tokensPath: 'specs/mockups/tokens.json',
      mockupsDir: 'specs/mockups/',
      designSystemRef: null,
      stitchProjectId: null,
      tier: 3,
      totalApiCalls: 0,
    };
  }

  // -------------------------------------------------------------------------
  // 9. notifyUser()
  // -------------------------------------------------------------------------

  notifyUser(type: NotificationType, message: string): void {
    const prefix = type === 'error' ? '[ERROR]'
      : type === 'quota_warning' ? '[QUOTA]'
      : type === 'tier_switch' ? '[TIER]'
      : '[INFO]';
    process.stderr.write(`${prefix} ${message}\n`);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private detectIsDark(html: string): boolean {
    // Check for dark background indicators
    const bgMatch = html.match(/--bg:\s*(#[0-9a-fA-F]{3,8})/);
    if (bgMatch) {
      const hex = bgMatch[1].replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
        return luminance < 128;
      }
    }
    return false;
  }

  private generateIndexHtml(results: PageResult[]): string {
    const links = results.map((r) => {
      const pageName = r.page.name.replace(/[^a-zA-Z0-9_-]/g, '-');
      let html = `      <li><a href="${pageName}.html">${r.page.name}</a> (${r.page.platform}, ${r.page.deviceType})`;
      if (r.darkVariant) {
        html += ` | <a href="${pageName}-dark.html">Dark</a>`;
      }
      html += `</li>`;
      return html;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NoPilot UI Mockups</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: #666; margin-bottom: 24px; }
    ul { list-style: none; padding: 0; }
    li { padding: 12px 16px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; }
    a { color: #3b82f6; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>UI Mockups</h1>
  <p>Generated by NoPilot UI Taste system</p>
  <ul>
${links}
  </ul>
  <p><a href="tokens.json">Design Tokens (DTCG)</a></p>
</body>
</html>`;
  }

  private buildTier3DesignMd(page: PageSpec): string {
    const sections = [
      '# Tier 3 Design Preferences',
      '',
      `## Page: ${page.name}`,
      `- Platform: ${page.platform}`,
      `- Device: ${page.deviceType}`,
      `- Description: ${page.description}`,
      '',
      '## Preferences (text-based)',
      '- UI Density: standard',
      '- Visual Complexity: moderate',
      '- Animation Level: subtle',
      '',
      '> Design tokens exported with placeholder values. Refine in build phase.',
    ];
    return sections.join('\n');
  }

  private saveUITasteConstraint(
    results: PageResult[],
    dna: DesignDNA,
    stitchProjectId: string | null,
    projectRoot: string,
  ): void {
    const discoverJsonPath = path.join(projectRoot, 'specs', 'discover', 'index.json');
    if (!fs.existsSync(discoverJsonPath)) return;

    try {
      const content = fs.readFileSync(discoverJsonPath, 'utf-8');
      const discover = JSON.parse(content);

      const constraint: UITasteConstraint = {
        designDNA: dna,
        tokensPath: 'specs/mockups/tokens.json',
        mockupsDir: 'specs/mockups/',
        stitchProjectId,
        tier: 1,
        selectedPages: results.map((r) => ({
          name: r.page.name,
          mockupFile: `${r.page.name.replace(/[^a-zA-Z0-9_-]/g, '-')}.html`,
          darkMockupFile: r.darkVariant
            ? `${r.page.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-dark.html`
            : null,
        })),
      };

      discover.ui_taste = constraint;
      fs.writeFileSync(discoverJsonPath, JSON.stringify(discover, null, 2), 'utf-8');
    } catch {
      // Best-effort: don't fail the whole flow for discover.json write issues
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await this.previewEngine.stop();
    } catch {
      // Ignore cleanup errors
    }
  }

  private makeEmptyDNA(): DesignDNA {
    return {
      colorPalette: {},
      typography: { display: '48px', headline: '32px', body: '16px', label: '12px' },
      spacing: [4, 8, 16, 24, 32],
      borderRadius: { sm: '4px', md: '8px', lg: '16px' },
      shadows: [],
      animationLevel: 'none',
      designMd: '',
      rawProviderData: null,
    };
  }
}
