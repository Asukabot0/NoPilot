/**
 * MOD-006: Style detector — detect and analyze existing frontend design language.
 * Parses CSS/SCSS/Tailwind config to extract style tokens.
 * Synthesizes findings into a designMd constraint document.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StyleProfile, StyleFileMatch } from './types.js';

// ---------------------------------------------------------------------------
// File priority constants
// ---------------------------------------------------------------------------

const FILE_PRIORITIES: Record<StyleFileMatch['type'], number> = {
  'tailwind-config': 50,
  'theme-file': 40,
  'design-tokens': 30,
  'css': 20,
  'scss': 10,
};

// ---------------------------------------------------------------------------
// Regex patterns for CSS/Tailwind parsing
// ---------------------------------------------------------------------------

/** Match CSS color declarations: color, background-color, border-color, etc. */
const COLOR_PROPERTY_RE = /(?:color|background-color|border-color|fill|stroke)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\))/g;

/** Match CSS custom properties that look like colors. */
const CSS_VAR_COLOR_RE = /--([a-zA-Z0-9_-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g;

/** Match font-family declarations (captures value including quoted strings). */
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}]+)/g;

/** Match spacing/padding/margin values. */
const SPACING_RE = /(?:padding|margin|gap)\s*:\s*([\d.]+(?:px|rem))/g;

/** Match border-radius declarations. */
const BORDER_RADIUS_RE = /border-radius\s*:\s*([^;}"']+)/g;

/** Match box-shadow declarations. */
const BOX_SHADOW_RE = /box-shadow\s*:\s*([^;}"']+)/g;

/** Match @media breakpoints. */
const BREAKPOINT_RE = /@media[^{]*\(\s*(?:min|max)-width\s*:\s*(\d+(?:px|em|rem))\s*\)/g;

/** Match dark mode indicators. */
const DARK_MODE_RE = /(?:\.dark|prefers-color-scheme\s*:\s*dark|dark-mode|data-theme\s*=\s*['"]dark['"])/;

// ---------------------------------------------------------------------------
// Component library detection patterns
// ---------------------------------------------------------------------------

const COMPONENT_LIB_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /(?:@shadcn|shadcn\/ui|cn\()/i, name: 'shadcn' },
  { pattern: /(?:antd|ant-design|@ant-design)/i, name: 'antd' },
  { pattern: /(?:@mui|material-ui|@material)/i, name: 'material-ui' },
  { pattern: /(?:chakra-ui|@chakra-ui)/i, name: 'chakra-ui' },
  { pattern: /(?:@radix-ui)/i, name: 'radix' },
];

// ---------------------------------------------------------------------------
// StyleDetector
// ---------------------------------------------------------------------------

export class StyleDetector {
  /**
   * Scan projectRoot for style-related files and extract a StyleProfile.
   * Returns detected=false if no style files found.
   */
  async detect(projectRoot: string): Promise<{ detected: boolean; profile: StyleProfile | null }> {
    const files = this.scanForStyleFiles(projectRoot);
    if (files.length === 0) {
      return { detected: false, profile: null };
    }

    // Sort by priority descending (highest priority first)
    files.sort((a, b) => b.priority - a.priority);

    // Read and parse the highest priority file
    const primary = files[0];
    const fullPath = path.join(projectRoot, primary.path);
    const content = fs.readFileSync(fullPath, 'utf-8');

    let profile: StyleProfile;

    switch (primary.type) {
      case 'tailwind-config':
        profile = this.parseTailwindConfig(content);
        break;
      case 'theme-file':
        profile = this.parseThemeFile(content);
        break;
      case 'design-tokens':
        profile = this.parseDesignTokens(content);
        break;
      case 'css':
        profile = this.parseCss(content, 'css');
        break;
      case 'scss':
        profile = this.parseCss(content, 'scss');
        break;
      default:
        profile = this.parseCss(content, 'css');
    }

    // Merge data from secondary files to fill gaps
    for (let i = 1; i < files.length; i++) {
      const secondaryPath = path.join(projectRoot, files[i].path);
      try {
        const secondaryContent = fs.readFileSync(secondaryPath, 'utf-8');
        const secondaryProfile = this.parseCss(secondaryContent, files[i].type === 'scss' ? 'scss' : 'css');
        this.mergeProfiles(profile, secondaryProfile);
      } catch {
        // Skip unreadable files
      }
    }

    return { detected: true, profile };
  }

  /**
   * Stub for LLM vision analysis of screenshots.
   * Returns a placeholder StyleProfile. Actual LLM integration deferred.
   */
  async analyzeScreenshots(screenshots: string[]): Promise<StyleProfile> {
    return {
      source: 'screenshot',
      colors: { primary: '#007AFF', background: '#ffffff', text: '#000000' },
      fonts: ['SF Pro Display', 'sans-serif'],
      spacingScale: [4, 8, 16, 24, 32],
      borderRadius: { sm: '4px', md: '8px', lg: '16px' },
      shadows: ['0 1px 3px rgba(0,0,0,0.1)'],
      breakpoints: null,
      darkMode: null,
      componentLibrary: null,
      confidence: 0.3,
    };
  }

  /**
   * Convert StyleProfile into a designMd markdown constraint string.
   */
  synthesizeConstraint(profile: StyleProfile): string {
    const sections: string[] = [];

    sections.push('# Design System Constraints');
    sections.push(`> Auto-detected from ${profile.source} (confidence: ${(profile.confidence * 100).toFixed(0)}%)`);
    sections.push('');

    // Colors
    if (Object.keys(profile.colors).length > 0) {
      sections.push('## Color Palette');
      for (const [name, value] of Object.entries(profile.colors)) {
        sections.push(`- **${name}**: \`${value}\``);
      }
      sections.push('');
    }

    // Typography
    if (profile.fonts.length > 0) {
      sections.push('## Typography');
      sections.push(`- Font stack: \`${profile.fonts.join(', ')}\``);
      sections.push('');
    }

    // Spacing
    if (profile.spacingScale.length > 0) {
      sections.push('## Spacing Scale');
      sections.push(`- Values: ${profile.spacingScale.map((s) => `${s}px`).join(', ')}`);
      sections.push('');
    }

    // Border Radius
    if (Object.keys(profile.borderRadius).length > 0) {
      sections.push('## Border Radius');
      for (const [name, value] of Object.entries(profile.borderRadius)) {
        sections.push(`- **${name}**: \`${value}\``);
      }
      sections.push('');
    }

    // Shadows
    if (profile.shadows.length > 0) {
      sections.push('## Shadows');
      for (const shadow of profile.shadows) {
        sections.push(`- \`${shadow}\``);
      }
      sections.push('');
    }

    // Breakpoints
    if (profile.breakpoints && Object.keys(profile.breakpoints).length > 0) {
      sections.push('## Breakpoints');
      for (const [name, value] of Object.entries(profile.breakpoints)) {
        sections.push(`- **${name}**: \`${value}\``);
      }
      sections.push('');
    }

    // Dark Mode
    if (profile.darkMode !== null) {
      sections.push('## Dark Mode');
      sections.push(`- ${profile.darkMode ? 'Dark mode detected/supported' : 'Light mode only'}`);
      sections.push('');
    }

    // Component Library
    if (profile.componentLibrary) {
      sections.push('## Component Library');
      sections.push(`- Detected: **${profile.componentLibrary}**`);
      sections.push('');
    }

    return sections.join('\n');
  }

  // -------------------------------------------------------------------------
  // File scanning
  // -------------------------------------------------------------------------

  private scanForStyleFiles(projectRoot: string): StyleFileMatch[] {
    const matches: StyleFileMatch[] = [];

    // Check for specific config files
    const configPatterns: Array<{ glob: string; type: StyleFileMatch['type'] }> = [
      { glob: 'tailwind.config.js', type: 'tailwind-config' },
      { glob: 'tailwind.config.ts', type: 'tailwind-config' },
      { glob: 'tailwind.config.mjs', type: 'tailwind-config' },
      { glob: 'design-tokens.json', type: 'design-tokens' },
      { glob: 'theme.js', type: 'theme-file' },
      { glob: 'theme.ts', type: 'theme-file' },
    ];

    for (const cp of configPatterns) {
      const filePath = path.join(projectRoot, cp.glob);
      if (fs.existsSync(filePath)) {
        matches.push({
          path: cp.glob,
          type: cp.type,
          priority: FILE_PRIORITIES[cp.type],
        });
      }
    }

    // Scan for CSS/SCSS files (only top-level src/ or styles/ directories)
    const scanDirs = ['src', 'styles', 'css', 'app', '.'];
    for (const dir of scanDirs) {
      const dirPath = path.join(projectRoot, dir);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;

      try {
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
          const ext = path.extname(entry).toLowerCase();
          if (ext === '.css') {
            matches.push({
              path: path.join(dir, entry),
              type: 'css',
              priority: FILE_PRIORITIES['css'],
            });
          } else if (ext === '.scss') {
            matches.push({
              path: path.join(dir, entry),
              type: 'scss',
              priority: FILE_PRIORITIES['scss'],
            });
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    return matches;
  }

  // -------------------------------------------------------------------------
  // Parsers
  // -------------------------------------------------------------------------

  private parseTailwindConfig(content: string): StyleProfile {
    const colors: Record<string, string> = {};
    const fonts: string[] = [];
    const spacingScale: number[] = [];
    const borderRadius: Record<string, string> = {};
    let breakpoints: Record<string, string> | null = null;
    let darkMode: boolean | null = null;

    // Extract colors from theme.extend.colors or theme.colors
    const colorBlockMatch = content.match(/colors\s*:\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
    if (colorBlockMatch) {
      const colorBlock = colorBlockMatch[1];
      const colorEntries = colorBlock.matchAll(/['"]?(\w+)['"]?\s*:\s*['"]([#\w]+)['"]/g);
      for (const m of colorEntries) {
        colors[m[1]] = m[2];
      }
    }

    // Extract fontFamily
    const fontMatch = content.match(/fontFamily\s*:\s*\{[^}]*sans\s*:\s*\[([^\]]+)\]/);
    if (fontMatch) {
      const fontEntries = fontMatch[1].matchAll(/['"]([^'"]+)['"]/g);
      for (const m of fontEntries) {
        fonts.push(m[1]);
      }
    }

    // Extract spacing
    const spacingMatch = content.match(/spacing\s*:\s*\{([^}]+)\}/);
    if (spacingMatch) {
      const spacingEntries = spacingMatch[1].matchAll(/['"]?\w+['"]?\s*:\s*['"]?([\d.]+)(?:px|rem)?['"]?/g);
      for (const m of spacingEntries) {
        const val = parseFloat(m[1]);
        if (!isNaN(val) && !spacingScale.includes(val)) {
          spacingScale.push(val);
        }
      }
    }

    // Extract borderRadius
    const radiusMatch = content.match(/borderRadius\s*:\s*\{([^}]+)\}/);
    if (radiusMatch) {
      const radiusEntries = radiusMatch[1].matchAll(/['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]/g);
      for (const m of radiusEntries) {
        borderRadius[m[1]] = m[2];
      }
    }

    // Extract screens (breakpoints)
    const screensMatch = content.match(/screens\s*:\s*\{([^}]+)\}/);
    if (screensMatch) {
      breakpoints = {};
      const screenEntries = screensMatch[1].matchAll(/['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]/g);
      for (const m of screenEntries) {
        breakpoints[m[1]] = m[2];
      }
    }

    // Dark mode detection
    if (content.includes("darkMode")) {
      darkMode = true;
    }

    // Component library detection
    let componentLibrary: string | null = null;
    for (const lib of COMPONENT_LIB_PATTERNS) {
      if (lib.pattern.test(content)) {
        componentLibrary = lib.name;
        break;
      }
    }

    spacingScale.sort((a, b) => a - b);

    return {
      source: 'tailwind',
      colors,
      fonts,
      spacingScale,
      borderRadius,
      shadows: [],
      breakpoints,
      darkMode,
      componentLibrary,
      confidence: 0.9,
    };
  }

  private parseThemeFile(content: string): StyleProfile {
    // Theme files are JS/TS, parse as text for tokens
    return this.parseGenericJs(content, 'design-tokens');
  }

  private parseDesignTokens(content: string): StyleProfile {
    const colors: Record<string, string> = {};
    const fonts: string[] = [];
    const spacingScale: number[] = [];
    const borderRadius: Record<string, string> = {};

    try {
      const tokens = JSON.parse(content);

      // Extract colors
      if (tokens.colors && typeof tokens.colors === 'object') {
        for (const [k, v] of Object.entries(tokens.colors)) {
          if (typeof v === 'string') colors[k] = v;
        }
      }

      // Extract fonts
      if (tokens.fonts && Array.isArray(tokens.fonts)) {
        fonts.push(...tokens.fonts.filter((f: unknown) => typeof f === 'string'));
      } else if (tokens.fontFamily && typeof tokens.fontFamily === 'object') {
        for (const v of Object.values(tokens.fontFamily)) {
          if (typeof v === 'string') fonts.push(v);
        }
      }

      // Extract spacing
      if (tokens.spacing && typeof tokens.spacing === 'object') {
        for (const v of Object.values(tokens.spacing)) {
          const num = typeof v === 'number' ? v : parseFloat(String(v));
          if (!isNaN(num)) spacingScale.push(num);
        }
      }

      // Extract border radius
      if (tokens.borderRadius && typeof tokens.borderRadius === 'object') {
        for (const [k, v] of Object.entries(tokens.borderRadius)) {
          if (typeof v === 'string') borderRadius[k] = v;
        }
      }
    } catch {
      // Invalid JSON, treat as empty
    }

    spacingScale.sort((a, b) => a - b);

    return {
      source: 'design-tokens',
      colors,
      fonts,
      spacingScale,
      borderRadius,
      shadows: [],
      breakpoints: null,
      darkMode: null,
      componentLibrary: null,
      confidence: 0.8,
    };
  }

  parseCss(content: string, source: 'css' | 'scss'): StyleProfile {
    const colors: Record<string, string> = {};
    const fonts: string[] = [];
    const spacingValues = new Set<number>();
    const borderRadius: Record<string, string> = {};
    const shadows: string[] = [];
    const breakpointValues = new Set<string>();
    let darkMode: boolean | null = null;
    let componentLibrary: string | null = null;

    // Extract colors from properties
    let match: RegExpExecArray | null;
    while ((match = COLOR_PROPERTY_RE.exec(content)) !== null) {
      const value = match[1].trim();
      // Use property context as key if possible
      colors[`color-${Object.keys(colors).length}`] = value;
    }

    // Extract CSS custom property colors
    while ((match = CSS_VAR_COLOR_RE.exec(content)) !== null) {
      colors[match[1]] = match[2];
    }

    // Extract fonts
    while ((match = FONT_FAMILY_RE.exec(content)) !== null) {
      const fontValue = match[1].trim();
      const fontParts = fontValue.split(',').map((f) => f.trim().replace(/['"]/g, ''));
      for (const part of fontParts) {
        if (part && !fonts.includes(part)) {
          fonts.push(part);
        }
      }
    }

    // Extract spacing values
    while ((match = SPACING_RE.exec(content)) !== null) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) spacingValues.add(val);
    }

    // Extract border-radius
    while ((match = BORDER_RADIUS_RE.exec(content)) !== null) {
      const value = match[1].trim();
      const size = borderRadius['sm'] ? (borderRadius['md'] ? (borderRadius['lg'] ? 'xl' : 'lg') : 'md') : 'sm';
      borderRadius[size] = value;
    }

    // Extract box-shadows
    while ((match = BOX_SHADOW_RE.exec(content)) !== null) {
      const value = match[1].trim();
      if (value !== 'none' && !shadows.includes(value)) {
        shadows.push(value);
      }
    }

    // Extract breakpoints
    while ((match = BREAKPOINT_RE.exec(content)) !== null) {
      breakpointValues.add(match[1]);
    }

    // Dark mode detection
    if (DARK_MODE_RE.test(content)) {
      darkMode = true;
    }

    // Component library detection
    for (const lib of COMPONENT_LIB_PATTERNS) {
      if (lib.pattern.test(content)) {
        componentLibrary = lib.name;
        break;
      }
    }

    const spacingScale = Array.from(spacingValues).sort((a, b) => a - b);

    let breakpoints: Record<string, string> | null = null;
    if (breakpointValues.size > 0) {
      breakpoints = {};
      const sortedBp = Array.from(breakpointValues).sort(
        (a, b) => parseFloat(a) - parseFloat(b),
      );
      const bpNames = ['sm', 'md', 'lg', 'xl', '2xl'];
      sortedBp.forEach((v, i) => {
        breakpoints![bpNames[i] ?? `bp-${i}`] = v;
      });
    }

    return {
      source: source,
      colors,
      fonts,
      spacingScale,
      borderRadius,
      shadows,
      breakpoints,
      darkMode,
      componentLibrary,
      confidence: source === 'css' ? 0.7 : 0.6,
    };
  }

  private parseGenericJs(content: string, _type: string): StyleProfile {
    // For JS/TS theme files, extract what we can via regex
    const profile = this.parseCss(content, 'css');
    profile.source = 'design-tokens';
    profile.confidence = 0.7;

    // Also try to find JSON-like color definitions
    const jsonColorMatch = content.matchAll(/['"]?(\w+)['"]?\s*:\s*['"]#([0-9a-fA-F]{3,8})['"]/g);
    for (const m of jsonColorMatch) {
      if (!profile.colors[m[1]]) {
        profile.colors[m[1]] = `#${m[2]}`;
      }
    }

    return profile;
  }

  /**
   * Merge secondary profile data into primary profile (fill gaps only).
   */
  private mergeProfiles(primary: StyleProfile, secondary: StyleProfile): void {
    // Merge colors (don't overwrite existing)
    for (const [k, v] of Object.entries(secondary.colors)) {
      if (!primary.colors[k]) {
        primary.colors[k] = v;
      }
    }

    // Merge fonts
    for (const font of secondary.fonts) {
      if (!primary.fonts.includes(font)) {
        primary.fonts.push(font);
      }
    }

    // Merge spacing
    for (const val of secondary.spacingScale) {
      if (!primary.spacingScale.includes(val)) {
        primary.spacingScale.push(val);
      }
    }
    primary.spacingScale.sort((a, b) => a - b);

    // Merge shadows
    for (const shadow of secondary.shadows) {
      if (!primary.shadows.includes(shadow)) {
        primary.shadows.push(shadow);
      }
    }

    // Fill breakpoints if missing
    if (!primary.breakpoints && secondary.breakpoints) {
      primary.breakpoints = secondary.breakpoints;
    }

    // Fill dark mode if not detected
    if (primary.darkMode === null && secondary.darkMode !== null) {
      primary.darkMode = secondary.darkMode;
    }

    // Fill component library if not detected
    if (!primary.componentLibrary && secondary.componentLibrary) {
      primary.componentLibrary = secondary.componentLibrary;
    }
  }
}
