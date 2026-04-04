/**
 * MOD-008: TokenExporter — export design tokens from DesignDNA.
 * Primary: W3C DTCG .tokens.json (2025.10 format).
 * Fallback: CSS custom properties.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DesignDNA } from './types.js';

// ---------------------------------------------------------------------------
// DTCG data types
// ---------------------------------------------------------------------------

export interface DTCGColorValue {
  colorSpace: 'srgb';
  components: [number, number, number];
  alpha?: number;
}

export interface DTCGDimensionValue {
  value: number;
  unit: string;
}

export interface DTCGTypographyValue {
  fontFamily: string;
  fontSize: DTCGDimensionValue;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: DTCGDimensionValue;
}

export interface DTCGShadowValue {
  color: DTCGColorValue;
  offsetX: DTCGDimensionValue;
  offsetY: DTCGDimensionValue;
  blur: DTCGDimensionValue;
  spread: DTCGDimensionValue;
}

export interface DTCGToken {
  $type: 'color' | 'dimension' | 'typography' | 'shadow';
  $value: DTCGColorValue | DTCGDimensionValue | DTCGTypographyValue | DTCGShadowValue;
  $description?: string;
}

export interface DTCGTokenFile {
  color: Record<string, DTCGToken>;
  typography: Record<string, DTCGToken>;
  spacing: Record<string, DTCGToken>;
  borderRadius: Record<string, DTCGToken>;
  shadow: Record<string, DTCGToken>;
}

// ---------------------------------------------------------------------------
// Hex color conversion
// ---------------------------------------------------------------------------

/**
 * Convert a hex color string (#RGB, #RRGGBB, #RRGGBBAA) to DTCG sRGB components.
 * Returns [r, g, b] normalized to 0-1 range.
 */
export function hexToSRGB(hex: string): [number, number, number] {
  let clean = hex.replace(/^#/, '');

  // Expand shorthand (#RGB → #RRGGBB)
  if (clean.length === 3 || clean.length === 4) {
    clean = clean
      .split('')
      .map((c, i) => (i < 3 ? c + c : ''))
      .join('');
    // Only take 6 chars for RGB
    clean = clean.slice(0, 6);
  }

  // Take only RGB portion (ignore alpha if present)
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return [0, 0, 0];
  }

  return [
    Math.round((r / 255) * 1000) / 1000,
    Math.round((g / 255) * 1000) / 1000,
    Math.round((b / 255) * 1000) / 1000,
  ];
}

// ---------------------------------------------------------------------------
// Shadow parsing
// ---------------------------------------------------------------------------

/**
 * Parse a CSS box-shadow string into DTCG shadow value.
 * Handles format: "offsetX offsetY blur spread color"
 */
function parseShadow(shadow: string): DTCGShadowValue {
  // Default values
  const defaultDim: DTCGDimensionValue = { value: 0, unit: 'px' };
  const defaultColor: DTCGColorValue = { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.1 };

  // Extract rgba/rgb color
  const rgbaMatch = shadow.match(/rgba?\(([^)]+)\)/);
  let color = defaultColor;
  let remaining = shadow;

  if (rgbaMatch) {
    remaining = shadow.replace(rgbaMatch[0], '').trim();
    const parts = rgbaMatch[1].split(',').map((s) => s.trim());
    const r = parseInt(parts[0], 10) / 255;
    const g = parseInt(parts[1], 10) / 255;
    const b = parseInt(parts[2], 10) / 255;
    const a = parts[3] ? parseFloat(parts[3]) : 1;
    color = {
      colorSpace: 'srgb',
      components: [
        Math.round(r * 1000) / 1000,
        Math.round(g * 1000) / 1000,
        Math.round(b * 1000) / 1000,
      ],
      alpha: a,
    };
  }

  // Extract hex color
  const hexMatch = remaining.match(/#[0-9a-fA-F]{3,8}/);
  if (hexMatch) {
    remaining = remaining.replace(hexMatch[0], '').trim();
    const components = hexToSRGB(hexMatch[0]);
    color = { colorSpace: 'srgb', components };
  }

  // Parse numeric values (offsetX, offsetY, blur, spread)
  // Matches numbers with optional px suffix (e.g., "0", "2px", "-1.5px")
  const numMatches = remaining.match(/-?[\d.]+(?:px)?/g) ?? [];
  const nums = numMatches.map((m) => parseFloat(m));

  return {
    color,
    offsetX: nums[0] !== undefined ? { value: nums[0], unit: 'px' } : defaultDim,
    offsetY: nums[1] !== undefined ? { value: nums[1], unit: 'px' } : defaultDim,
    blur: nums[2] !== undefined ? { value: nums[2], unit: 'px' } : defaultDim,
    spread: nums[3] !== undefined ? { value: nums[3], unit: 'px' } : defaultDim,
  };
}

// ---------------------------------------------------------------------------
// Dimension parsing
// ---------------------------------------------------------------------------

function parseDimension(value: string): DTCGDimensionValue {
  const match = value.match(/^([\d.]+)(px|rem|em|%)$/);
  if (match) {
    return { value: parseFloat(match[1]), unit: match[2] };
  }
  const num = parseFloat(value);
  return { value: isNaN(num) ? 0 : num, unit: 'px' };
}

// ---------------------------------------------------------------------------
// TokenExporter
// ---------------------------------------------------------------------------

export class TokenExporter {
  /**
   * Convert DesignDNA into W3C DTCG .tokens.json format (2025.10).
   */
  exportDTCG(dna: DesignDNA): { tokens: DTCGTokenFile; json: string } {
    const tokens: DTCGTokenFile = {
      color: {},
      typography: {},
      spacing: {},
      borderRadius: {},
      shadow: {},
    };

    // Color tokens
    for (const [name, hex] of Object.entries(dna.colorPalette)) {
      const components = hexToSRGB(hex);
      tokens.color[name] = {
        $type: 'color',
        $value: { colorSpace: 'srgb', components },
        $description: `Color: ${name}`,
      };
    }

    // Typography tokens
    const typographyEntries: Array<[string, string, number]> = [
      ['display', dna.typography.display, 700],
      ['headline', dna.typography.headline, 600],
      ['body', dna.typography.body, 400],
      ['label', dna.typography.label, 500],
    ];
    for (const [name, size, weight] of typographyEntries) {
      tokens.typography[name] = {
        $type: 'typography',
        $value: {
          fontFamily: 'Inter, sans-serif',
          fontSize: parseDimension(size),
          fontWeight: weight,
          lineHeight: 1.5,
          letterSpacing: { value: 0, unit: 'px' },
        } as DTCGTypographyValue,
        $description: `Typography: ${name}`,
      };
    }

    // Spacing tokens
    for (let i = 0; i < dna.spacing.length; i++) {
      const value = dna.spacing[i];
      const name = `space-${i + 1}`;
      tokens.spacing[name] = {
        $type: 'dimension',
        $value: { value, unit: 'px' } as DTCGDimensionValue,
        $description: `Spacing: ${value}px`,
      };
    }

    // Border radius tokens
    for (const [name, value] of Object.entries(dna.borderRadius)) {
      tokens.borderRadius[name] = {
        $type: 'dimension',
        $value: parseDimension(value),
        $description: `Border radius: ${name}`,
      };
    }

    // Shadow tokens
    for (let i = 0; i < dna.shadows.length; i++) {
      const name = `shadow-${i + 1}`;
      tokens.shadow[name] = {
        $type: 'shadow',
        $value: parseShadow(dna.shadows[i]),
        $description: `Shadow: ${name}`,
      };
    }

    const json = JSON.stringify(tokens, null, 2);
    return { tokens, json };
  }

  /**
   * Generate CSS custom properties from DesignDNA.
   */
  exportCSS(dna: DesignDNA): string {
    const lines: string[] = [':root {'];

    // Colors
    for (const [name, value] of Object.entries(dna.colorPalette)) {
      lines.push(`  --color-${name}: ${value};`);
    }

    // Typography
    lines.push(`  --font-display: ${dna.typography.display};`);
    lines.push(`  --font-headline: ${dna.typography.headline};`);
    lines.push(`  --font-body: ${dna.typography.body};`);
    lines.push(`  --font-label: ${dna.typography.label};`);

    // Spacing
    for (let i = 0; i < dna.spacing.length; i++) {
      lines.push(`  --space-${i + 1}: ${dna.spacing[i]}px;`);
    }

    // Border radius
    for (const [name, value] of Object.entries(dna.borderRadius)) {
      lines.push(`  --radius-${name}: ${value};`);
    }

    // Shadows
    for (let i = 0; i < dna.shadows.length; i++) {
      lines.push(`  --shadow-${i + 1}: ${dna.shadows[i]};`);
    }

    // Animation level
    lines.push(`  --animation-level: ${dna.animationLevel};`);

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Write tokens file to disk.
   * Format 'dtcg' writes JSON, format 'css' writes CSS.
   * Creates directory if needed.
   */
  writeToSpecs(
    tokens: DTCGTokenFile | string,
    format: 'dtcg' | 'css',
    outputDir: string,
  ): string {
    // Ensure directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    const filename = format === 'dtcg' ? 'tokens.json' : 'tokens.css';
    const filePath = path.join(outputDir, filename);

    const content =
      typeof tokens === 'string'
        ? tokens
        : JSON.stringify(tokens, null, 2);

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }
}
