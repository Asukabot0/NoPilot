/**
 * MOD-003: AgentHTMLProvider — Tier 2 fallback DesignProvider.
 * Generates HTML mockups using designMd template constraints.
 * Deterministic template-based HTML generation for testing.
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
// Quality checklist
// ---------------------------------------------------------------------------

export const QUALITY_CHECKLIST = [
  'correct base layout',
  'coordinated color scheme',
  'basic animation effects',
  'responsive breakpoints',
  'proper typography hierarchy',
] as const;

// ---------------------------------------------------------------------------
// Color schemes for variant diversity
// ---------------------------------------------------------------------------

const COLOR_SCHEMES = [
  { primary: '#2563eb', secondary: '#7c3aed', accent: '#f59e0b', bg: '#ffffff', text: '#111827', surface: '#f3f4f6', name: 'Professional Blue' },
  { primary: '#059669', secondary: '#0d9488', accent: '#eab308', bg: '#f0fdf4', text: '#064e3b', surface: '#ecfdf5', name: 'Nature Green' },
  { primary: '#dc2626', secondary: '#e11d48', accent: '#f97316', bg: '#fff1f2', text: '#7f1d1d', surface: '#ffe4e6', name: 'Bold Red' },
  { primary: '#7c3aed', secondary: '#a855f7', accent: '#06b6d4', bg: '#faf5ff', text: '#3b0764', surface: '#f3e8ff', name: 'Royal Purple' },
  { primary: '#0891b2', secondary: '#0284c7', accent: '#84cc16', bg: '#ecfeff', text: '#164e63', surface: '#cffafe', name: 'Calm Cyan' },
];

const LAYOUT_TEMPLATES = ['hero', 'dashboard', 'list', 'split', 'minimal'];

// ---------------------------------------------------------------------------
// AgentHTMLProvider
// ---------------------------------------------------------------------------

export class AgentHTMLProvider implements DesignProvider {
  private activeDesignMd: string | null = null;

  name(): string {
    return 'agent-html';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generateScreen(request: GenerateScreenRequest): Promise<DesignVariant> {
    const id = `agent-screen-${Date.now()}`;
    const scheme = COLOR_SCHEMES[0];
    const html = this.buildHtml(
      request.pageSpec.name,
      request.prompt,
      request.pageSpec.platform,
      request.language,
      request.fontStack,
      scheme,
      'hero',
    );

    return {
      id,
      screenId: id,
      htmlCode: html,
      screenshotUrl: null,
      metadata: {
        title: `${request.pageSpec.name} screen`,
        prompt: request.prompt,
        creativeRange: 'REFINE',
        modelId: null,
        generatedAt: new Date().toISOString(),
      },
      provider: 'agent-html',
      deviceType: request.pageSpec.deviceType,
    };
  }

  async generateVariants(
    request: GenerateVariantsRequest,
  ): Promise<DesignVariant[]> {
    const count = Math.max(request.count, 5);
    const variants: DesignVariant[] = [];

    for (let i = 0; i < count; i++) {
      const scheme = COLOR_SCHEMES[i % COLOR_SCHEMES.length];
      const layout = LAYOUT_TEMPLATES[i % LAYOUT_TEMPLATES.length];
      const id = `agent-variant-${Date.now()}-${i}`;

      variants.push({
        id,
        screenId: request.baseVariant.screenId,
        htmlCode: this.buildHtml(
          `variant-${i + 1}`,
          request.prompt,
          'web',
          'en',
          'Inter, sans-serif',
          scheme,
          layout,
        ),
        screenshotUrl: null,
        metadata: {
          title: `${scheme.name} - ${layout}`,
          prompt: request.prompt,
          creativeRange: request.creativeRange,
          modelId: null,
          generatedAt: new Date().toISOString(),
        },
        provider: 'agent-html',
        deviceType: request.baseVariant.deviceType,
      });
    }
    return variants;
  }

  async extractDesignContext(variant: DesignVariant): Promise<DesignDNA> {
    const colorPalette: Record<string, string> = {};

    // Regex extract colors from CSS custom properties
    const varMatches = variant.htmlCode.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})/g);
    for (const m of varMatches) {
      colorPalette[m[1]] = m[2];
    }
    if (Object.keys(colorPalette).length === 0) {
      colorPalette.primary = '#2563eb';
      colorPalette.background = '#ffffff';
    }

    // Extract fonts
    const fontMatch = variant.htmlCode.match(/font-family:\s*([^;}"']+)/);
    const fontStack = fontMatch ? fontMatch[1].trim() : 'Inter, sans-serif';

    // Extract spacing from padding/margin/gap values
    const spacingSet = new Set<number>();
    const spacingMatches = variant.htmlCode.matchAll(/(?:padding|margin|gap):\s*(\d+)px/g);
    for (const m of spacingMatches) {
      spacingSet.add(parseInt(m[1], 10));
    }
    const spacing = spacingSet.size > 0
      ? Array.from(spacingSet).sort((a, b) => a - b)
      : [4, 8, 16, 24, 32];

    // Extract border-radius
    const borderRadius: Record<string, string> = {};
    const radiusMatches = variant.htmlCode.matchAll(/border-radius:\s*([^;}"']+)/g);
    const sizes = ['sm', 'md', 'lg', 'xl'];
    let sizeIdx = 0;
    for (const m of radiusMatches) {
      const key = sizes[sizeIdx] ?? `r-${sizeIdx}`;
      borderRadius[key] = m[1].trim();
      sizeIdx++;
    }

    // Extract shadows
    const shadows: string[] = [];
    const shadowMatches = variant.htmlCode.matchAll(/box-shadow:\s*([^;}"']+)/g);
    for (const m of shadowMatches) {
      const val = m[1].trim();
      if (val !== 'none' && !shadows.includes(val)) {
        shadows.push(val);
      }
    }

    // Detect animation level
    const hasTransition = /transition/.test(variant.htmlCode);
    const hasAnimation = /@keyframes/.test(variant.htmlCode);
    let animationLevel: DesignDNA['animationLevel'] = 'none';
    if (hasAnimation) animationLevel = 'moderate';
    else if (hasTransition) animationLevel = 'subtle';

    return {
      colorPalette,
      typography: {
        display: '48px',
        headline: '28px',
        body: '16px',
        label: '12px',
      },
      spacing,
      borderRadius: Object.keys(borderRadius).length > 0 ? borderRadius : { sm: '4px', md: '8px', lg: '12px' },
      shadows: shadows.length > 0 ? shadows : ['0 1px 3px rgba(0,0,0,0.1)'],
      animationLevel,
      designMd: this.activeDesignMd ?? `# Design System\nExtracted from ${variant.id}\n\n## Colors\n${Object.entries(colorPalette).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\n## Typography\n- Font: ${fontStack}`,
      rawProviderData: null,
    };
  }

  async createDesignSystem(dna: DesignDNA): Promise<DesignSystemRef> {
    return {
      id: `agent-ds-${Date.now()}`,
      provider: 'agent-html',
      projectId: null,
    };
  }

  async applyDesignSystem(
    _projectId: string,
    ref: DesignSystemRef,
  ): Promise<void> {
    // Store the ref's designMd as active constraint
    this.activeDesignMd = `Applied design system: ${ref.id}`;
  }

  // -------------------------------------------------------------------------
  // HTML builder with quality checklist compliance
  // -------------------------------------------------------------------------

  private buildHtml(
    pageName: string,
    prompt: string,
    platform: string,
    language: string,
    fontStack: string,
    scheme: typeof COLOR_SCHEMES[number],
    layout: string,
  ): string {
    const lang = language === 'zh' ? 'zh-CN' : language;
    const bodyContent = this.layoutContent(pageName, prompt, platform, layout);

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageName}</title>
  <style>
    :root {
      --primary: ${scheme.primary};
      --secondary: ${scheme.secondary};
      --accent: ${scheme.accent};
      --bg: ${scheme.bg};
      --text: ${scheme.text};
      --surface: ${scheme.surface};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${fontStack};
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.6;
    }
    h1 { font-size: 48px; font-weight: 700; letter-spacing: -0.02em; }
    h2 { font-size: 28px; font-weight: 600; }
    h3 { font-size: 20px; font-weight: 500; }
    p { font-size: 16px; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .nav {
      background: var(--surface);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(0,0,0,0.08);
    }
    .nav-brand { font-weight: 600; color: var(--primary); font-size: 18px; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .card {
      background: var(--surface);
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s ease;
    }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-secondary { background: var(--secondary); color: #fff; }
    .btn:hover { opacity: 0.85; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate { animation: fadeIn 0.4s ease-out; }
    @media (max-width: 768px) {
      h1 { font-size: 32px; }
      .container { padding: 16px; }
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 480px) {
      h1 { font-size: 24px; }
      .nav { padding: 12px 16px; }
    }
  </style>
</head>
<body>
  <nav class="nav">
    <span class="nav-brand">${pageName}</span>
    <span class="label">${platform}</span>
  </nav>
  <div class="container animate">
${bodyContent}
  </div>
</body>
</html>`;
  }

  private layoutContent(
    pageName: string,
    prompt: string,
    platform: string,
    layout: string,
  ): string {
    switch (layout) {
      case 'hero':
        return `    <div style="text-align: center; padding: 48px 0;">
      <h1>${pageName}</h1>
      <p style="margin: 16px 0; max-width: 600px; margin-left: auto; margin-right: auto;">${prompt}</p>
      <button class="btn btn-primary">Get Started</button>
    </div>
    <div class="grid" style="margin-top: 32px;">
      <div class="card"><h3>Feature One</h3><p style="margin-top: 8px;">A concise description of the first feature.</p></div>
      <div class="card"><h3>Feature Two</h3><p style="margin-top: 8px;">A concise description of the second feature.</p></div>
      <div class="card"><h3>Feature Three</h3><p style="margin-top: 8px;">A concise description of the third feature.</p></div>
    </div>`;

      case 'dashboard':
        return `    <h2 style="margin-bottom: 24px;">Dashboard</h2>
    <div class="grid">
      <div class="card"><span class="label">Metric</span><h2 style="margin-top: 8px;">1,234</h2><p>Total Users</p></div>
      <div class="card"><span class="label">Metric</span><h2 style="margin-top: 8px;">56.7%</h2><p>Conversion Rate</p></div>
      <div class="card"><span class="label">Metric</span><h2 style="margin-top: 8px;">$12.4k</h2><p>Revenue</p></div>
    </div>
    <div class="card" style="margin-top: 24px;"><h3>Recent Activity</h3><p style="margin-top: 8px;">Generated from: ${prompt}</p></div>`;

      case 'list':
        return `    <h2 style="margin-bottom: 24px;">${pageName}</h2>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="card" style="display: flex; align-items: center; gap: 16px;">
        <div style="width: 48px; height: 48px; border-radius: 8px; background: var(--primary); opacity: 0.2;"></div>
        <div><h3>Item One</h3><p>Description of the first item</p></div>
      </div>
      <div class="card" style="display: flex; align-items: center; gap: 16px;">
        <div style="width: 48px; height: 48px; border-radius: 8px; background: var(--secondary); opacity: 0.2;"></div>
        <div><h3>Item Two</h3><p>Description of the second item</p></div>
      </div>
      <div class="card" style="display: flex; align-items: center; gap: 16px;">
        <div style="width: 48px; height: 48px; border-radius: 8px; background: var(--accent); opacity: 0.2;"></div>
        <div><h3>Item Three</h3><p>Description of the third item</p></div>
      </div>
    </div>`;

      case 'split':
        return `    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: center;">
      <div>
        <h1>${pageName}</h1>
        <p style="margin: 16px 0;">${prompt}</p>
        <button class="btn btn-primary" style="margin-right: 8px;">Primary Action</button>
        <button class="btn btn-secondary">Secondary</button>
      </div>
      <div class="card" style="min-height: 300px; display: flex; align-items: center; justify-content: center;">
        <p style="color: var(--primary);">Visual Content Area</p>
      </div>
    </div>`;

      case 'minimal':
      default:
        return `    <div style="max-width: 640px; margin: 48px auto;">
      <h1>${pageName}</h1>
      <p style="margin: 24px 0; line-height: 1.8;">${prompt}</p>
      <button class="btn btn-primary">Continue</button>
    </div>`;
    }
  }
}
