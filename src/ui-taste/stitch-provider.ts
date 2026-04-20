/**
 * MOD-002: StitchProvider — Stitch MCP adapter.
 * Implements DesignProvider interface using Google Stitch MCP.
 * For now, generates realistic mock HTML with correct structure.
 * Real Stitch MCP calls will be wired when running inside Claude Code.
 */
import type {
  DesignProvider,
  DesignVariant,
  DesignDNA,
  DesignSystemRef,
  GenerateScreenRequest,
  GenerateVariantsRequest,
} from './types.js';

// ---------------------------------------------------------------------------
// QuotaTracker
// ---------------------------------------------------------------------------

export interface QuotaStatus {
  callsMade: number;
  estimatedLimit: number | null;
  exhausted: boolean;
}

export class QuotaTracker {
  private callCount = 0;
  private estimatedLimit: number | null = null;
  private readonly warningThreshold = 0.8;

  increment(): void {
    this.callCount++;
  }

  setEstimatedLimit(limit: number): void {
    this.estimatedLimit = limit;
  }

  getStatus(): QuotaStatus {
    const exhausted =
      this.estimatedLimit !== null &&
      this.callCount >= this.estimatedLimit;
    return {
      callsMade: this.callCount,
      estimatedLimit: this.estimatedLimit,
      exhausted,
    };
  }

  isWarning(): boolean {
    if (this.estimatedLimit === null) return false;
    return this.callCount / this.estimatedLimit >= this.warningThreshold;
  }
}

// ---------------------------------------------------------------------------
// Color palettes for variant diversity
// ---------------------------------------------------------------------------

const STYLE_PALETTES = [
  { primary: '#3b82f6', secondary: '#10b981', accent: '#f59e0b', bg: '#ffffff', text: '#1f2937', name: 'Ocean Blue' },
  { primary: '#8b5cf6', secondary: '#ec4899', accent: '#f97316', bg: '#fafafa', text: '#18181b', name: 'Vivid Purple' },
  { primary: '#059669', secondary: '#0891b2', accent: '#d97706', bg: '#f0fdf4', text: '#14532d', name: 'Forest Green' },
  { primary: '#dc2626', secondary: '#ea580c', accent: '#ca8a04', bg: '#fff7ed', text: '#7c2d12', name: 'Warm Red' },
  { primary: '#0284c7', secondary: '#7c3aed', accent: '#16a34a', bg: '#f0f9ff', text: '#0c4a6e', name: 'Sky Blue' },
];

const LAYOUT_STYLES = ['centered', 'sidebar', 'hero-split', 'card-grid', 'stacked'];

// ---------------------------------------------------------------------------
// StitchProvider
// ---------------------------------------------------------------------------

export class StitchProvider implements DesignProvider {
  private quota = new QuotaTracker();
  private activeDesignSystemRef: DesignSystemRef | null = null;
  private projectId: string | null = null;

  name(): string {
    return 'stitch';
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.STITCH_API_KEY;
  }

  getQuotaStatus(): QuotaStatus {
    return this.quota.getStatus();
  }

  async generateScreen(request: GenerateScreenRequest): Promise<DesignVariant> {
    const status = this.quota.getStatus();
    if (status.exhausted) {
      throw new Error('QUOTA_EXHAUSTED: Stitch API quota has been exhausted');
    }

    this.quota.increment();

    const id = `stitch-screen-${Date.now()}`;
    if (!this.projectId) {
      this.projectId = `proj-${Date.now()}`;
    }

    const palette = STYLE_PALETTES[0];
    return {
      id,
      screenId: id,
      htmlCode: this.buildHtml(
        request.pageSpec.name,
        request.prompt,
        request.pageSpec.platform,
        request.language,
        request.fontStack,
        palette,
        'centered',
      ),
      screenshotUrl: null,
      metadata: {
        title: `${request.pageSpec.name} screen`,
        prompt: request.prompt,
        creativeRange: 'REFINE',
        modelId: 'GEMINI_3_1_PRO',
        generatedAt: new Date().toISOString(),
      },
      provider: 'stitch',
      deviceType: request.pageSpec.deviceType,
    };
  }

  async generateVariants(
    request: GenerateVariantsRequest,
  ): Promise<DesignVariant[]> {
    const status = this.quota.getStatus();
    if (status.exhausted) {
      throw new Error('QUOTA_EXHAUSTED: Stitch API quota has been exhausted');
    }

    this.quota.increment();

    const count = Math.max(request.count, 5);
    const variants: DesignVariant[] = [];
    for (let i = 0; i < count; i++) {
      const palette = STYLE_PALETTES[i % STYLE_PALETTES.length];
      const layout = LAYOUT_STYLES[i % LAYOUT_STYLES.length];
      const id = `stitch-variant-${Date.now()}-${i}`;
      variants.push({
        id,
        screenId: request.baseVariant.screenId,
        htmlCode: this.buildHtml(
          `variant-${i + 1}`,
          request.prompt,
          'web',
          'en',
          'Inter, sans-serif',
          palette,
          layout,
        ),
        screenshotUrl: null,
        metadata: {
          title: `${palette.name} - ${layout}`,
          prompt: request.prompt,
          creativeRange: request.creativeRange,
          modelId: 'GEMINI_3_1_PRO',
          generatedAt: new Date().toISOString(),
        },
        provider: 'stitch',
        deviceType: request.baseVariant.deviceType,
      });
    }
    return variants;
  }

  async extractDesignContext(variant: DesignVariant): Promise<DesignDNA> {
    this.quota.increment();

    // Parse colors from the variant HTML
    const colorPalette: Record<string, string> = {};
    const colorMatches = variant.htmlCode.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g);
    for (const m of colorMatches) {
      colorPalette[m[1]] = m[2];
    }
    if (Object.keys(colorPalette).length === 0) {
      colorPalette.primary = '#3b82f6';
      colorPalette.secondary = '#10b981';
      colorPalette.background = '#ffffff';
    }

    // Parse font info
    const fontMatch = variant.htmlCode.match(/font-family:\s*([^;}"']+)/);
    const fontStack = fontMatch ? fontMatch[1].trim() : 'Inter, sans-serif';

    return {
      colorPalette,
      typography: {
        display: '48px',
        headline: '32px',
        body: '16px',
        label: '12px',
      },
      spacing: [4, 8, 12, 16, 24, 32, 48],
      borderRadius: { sm: '4px', md: '8px', lg: '16px', xl: '24px', full: '9999px' },
      shadows: ['0 1px 2px rgba(0,0,0,0.05)', '0 4px 6px rgba(0,0,0,0.1)'],
      animationLevel: 'subtle',
      designMd: `# Design System\nExtracted from variant ${variant.id}\n\n## Colors\n${Object.entries(colorPalette).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\n## Typography\n- Font: ${fontStack}\n- Display: 48px\n- Headline: 32px\n- Body: 16px\n- Label: 12px`,
      rawProviderData: null,
    };
  }

  async createDesignSystem(dna: DesignDNA): Promise<DesignSystemRef> {
    this.quota.increment();
    return {
      id: `ds-${Date.now()}`,
      provider: 'stitch',
      projectId: this.projectId,
    };
  }

  async applyDesignSystem(
    projectId: string,
    ref: DesignSystemRef,
  ): Promise<void> {
    this.quota.increment();
    this.activeDesignSystemRef = ref;
    this.projectId = projectId;
  }

  downloadScreenHtml(variant: DesignVariant): string {
    return variant.htmlCode;
  }

  // -------------------------------------------------------------------------
  // HTML builder
  // -------------------------------------------------------------------------

  private buildHtml(
    pageName: string,
    prompt: string,
    platform: string,
    language: string,
    fontStack: string,
    palette: typeof STYLE_PALETTES[number],
    layout: string,
  ): string {
    const lang = language === 'zh' ? 'zh-CN' : language;
    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageName}</title>
  <style>
    :root {
      --primary: ${palette.primary};
      --secondary: ${palette.secondary};
      --accent: ${palette.accent};
      --bg: ${palette.bg};
      --text: ${palette.text};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontStack};
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .header {
      background: var(--primary);
      color: #fff;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header h1 { font-size: 20px; font-weight: 600; }
    .main { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .card {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .card h2 { color: var(--primary); margin-bottom: 8px; }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
    .btn-secondary { background: var(--secondary); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
      .main { padding: 16px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${pageName}</h1>
    <span style="font-size: 13px; opacity: 0.8;">${platform}</span>
  </div>
  <div class="main">
    <div class="grid">
      <div class="card">
        <h2>Welcome</h2>
        <p style="margin-bottom: 16px;">Generated from: ${prompt}</p>
        <button class="btn">Get Started</button>
      </div>
      <div class="card">
        <h2>Features</h2>
        <p style="margin-bottom: 16px;">Explore the key features of this application.</p>
        <button class="btn btn-secondary">Learn More</button>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}
