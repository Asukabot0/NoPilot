/**
 * Tests for MOD-008: TokenExporter.
 * Covers: DTCG format validation, CSS export, hex-to-sRGB conversion,
 * file writing, shadow parsing, dimension parsing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DesignDNA } from '../types.js';
import { TokenExporter, hexToSRGB } from '../token-exporter.js';
import type { DTCGTokenFile, DTCGColorValue, DTCGDimensionValue, DTCGTypographyValue, DTCGShadowValue } from '../token-exporter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDNA(overrides?: Partial<DesignDNA>): DesignDNA {
  return {
    colorPalette: { primary: '#3b82f6', secondary: '#10b981', background: '#ffffff' },
    typography: { display: '48px', headline: '32px', body: '16px', label: '12px' },
    spacing: [4, 8, 16, 24, 32],
    borderRadius: { sm: '4px', md: '8px', lg: '16px' },
    shadows: ['0 1px 3px rgba(0,0,0,0.1)', '0 4px 6px rgba(0,0,0,0.15)'],
    animationLevel: 'subtle',
    designMd: '# Design System',
    rawProviderData: null,
    ...overrides,
  };
}

const TEST_DIR = '/tmp/nopilot-token-exporter-test';

// ---------------------------------------------------------------------------
// hexToSRGB
// ---------------------------------------------------------------------------

describe('hexToSRGB', () => {
  it('converts 6-digit hex to sRGB components', () => {
    const [r, g, b] = hexToSRGB('#ff0000');
    expect(r).toBe(1);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('converts black correctly', () => {
    const [r, g, b] = hexToSRGB('#000000');
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('converts white correctly', () => {
    const [r, g, b] = hexToSRGB('#ffffff');
    expect(r).toBe(1);
    expect(g).toBe(1);
    expect(b).toBe(1);
  });

  it('converts 3-digit shorthand hex', () => {
    const [r, g, b] = hexToSRGB('#f00');
    expect(r).toBe(1);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('handles hex without # prefix', () => {
    const [r, g, b] = hexToSRGB('3b82f6');
    expect(r).toBeCloseTo(0.231, 2);
    expect(g).toBeCloseTo(0.510, 2);
    expect(b).toBeCloseTo(0.965, 2);
  });

  it('handles 8-digit hex (with alpha) by ignoring alpha', () => {
    const [r, g, b] = hexToSRGB('#ff000080');
    expect(r).toBe(1);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('returns [0,0,0] for invalid hex', () => {
    const [r, g, b] = hexToSRGB('#xyz');
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('normalizes to 3 decimal places', () => {
    const [r, g, b] = hexToSRGB('#3b82f6');
    // 59/255 ≈ 0.231, 130/255 ≈ 0.510, 246/255 ≈ 0.965
    expect(r).toBe(Math.round((0x3b / 255) * 1000) / 1000);
    expect(g).toBe(Math.round((0x82 / 255) * 1000) / 1000);
    expect(b).toBe(Math.round((0xf6 / 255) * 1000) / 1000);
  });
});

// ---------------------------------------------------------------------------
// TokenExporter.exportDTCG
// ---------------------------------------------------------------------------

describe('TokenExporter.exportDTCG', () => {
  let exporter: TokenExporter;

  beforeEach(() => {
    exporter = new TokenExporter();
  });

  it('returns tokens and json string', () => {
    const { tokens, json } = exporter.exportDTCG(makeDNA());
    expect(tokens).toBeTruthy();
    expect(typeof json).toBe('string');
    expect(JSON.parse(json)).toEqual(tokens);
  });

  // --- Color tokens ---

  it('exports color tokens with DTCG structure', () => {
    const { tokens } = exporter.exportDTCG(makeDNA());
    expect(tokens.color).toHaveProperty('primary');

    const primary = tokens.color.primary;
    expect(primary.$type).toBe('color');

    const value = primary.$value as DTCGColorValue;
    expect(value.colorSpace).toBe('srgb');
    expect(value.components).toHaveLength(3);
    expect(value.components[0]).toBeGreaterThanOrEqual(0);
    expect(value.components[0]).toBeLessThanOrEqual(1);
  });

  it('exports all colors from palette', () => {
    const dna = makeDNA({
      colorPalette: { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff' },
    });
    const { tokens } = exporter.exportDTCG(dna);
    expect(Object.keys(tokens.color)).toHaveLength(3);
    expect(tokens.color).toHaveProperty('primary');
    expect(tokens.color).toHaveProperty('secondary');
    expect(tokens.color).toHaveProperty('accent');
  });

  // --- Typography tokens ---

  it('exports typography tokens with DTCG structure', () => {
    const { tokens } = exporter.exportDTCG(makeDNA());
    expect(tokens.typography).toHaveProperty('display');
    expect(tokens.typography).toHaveProperty('headline');
    expect(tokens.typography).toHaveProperty('body');
    expect(tokens.typography).toHaveProperty('label');

    const display = tokens.typography.display;
    expect(display.$type).toBe('typography');

    const value = display.$value as DTCGTypographyValue;
    expect(value.fontFamily).toBeTruthy();
    expect(value.fontSize).toHaveProperty('value');
    expect(value.fontSize).toHaveProperty('unit');
    expect(value.fontWeight).toBeGreaterThan(0);
    expect(value.lineHeight).toBeGreaterThan(0);
  });

  it('display typography has correct font size', () => {
    const { tokens } = exporter.exportDTCG(makeDNA());
    const value = tokens.typography.display.$value as DTCGTypographyValue;
    expect(value.fontSize.value).toBe(48);
    expect(value.fontSize.unit).toBe('px');
  });

  // --- Spacing tokens ---

  it('exports spacing tokens as dimension type', () => {
    const { tokens } = exporter.exportDTCG(makeDNA());
    const spacingKeys = Object.keys(tokens.spacing);
    expect(spacingKeys.length).toBe(5); // [4, 8, 16, 24, 32]

    const first = tokens.spacing[spacingKeys[0]];
    expect(first.$type).toBe('dimension');

    const value = first.$value as DTCGDimensionValue;
    expect(value.value).toBe(4);
    expect(value.unit).toBe('px');
  });

  // --- Border radius tokens ---

  it('exports border radius tokens as dimension type', () => {
    const { tokens } = exporter.exportDTCG(makeDNA());
    expect(tokens.borderRadius).toHaveProperty('sm');
    expect(tokens.borderRadius).toHaveProperty('md');
    expect(tokens.borderRadius).toHaveProperty('lg');

    const sm = tokens.borderRadius.sm;
    expect(sm.$type).toBe('dimension');

    const value = sm.$value as DTCGDimensionValue;
    expect(value.value).toBe(4);
    expect(value.unit).toBe('px');
  });

  // --- Shadow tokens ---

  it('exports shadow tokens with DTCG structure', () => {
    const { tokens } = exporter.exportDTCG(makeDNA());
    const shadowKeys = Object.keys(tokens.shadow);
    expect(shadowKeys.length).toBe(2);

    const shadow = tokens.shadow[shadowKeys[0]];
    expect(shadow.$type).toBe('shadow');

    const value = shadow.$value as DTCGShadowValue;
    expect(value.color).toHaveProperty('colorSpace');
    expect(value.color.colorSpace).toBe('srgb');
    expect(value.offsetX).toHaveProperty('value');
    expect(value.offsetY).toHaveProperty('value');
    expect(value.blur).toHaveProperty('value');
    expect(value.spread).toHaveProperty('value');
  });

  it('parses rgba shadow colors correctly', () => {
    const dna = makeDNA({ shadows: ['0 2px 4px rgba(0,0,0,0.25)'] });
    const { tokens } = exporter.exportDTCG(dna);
    const shadow = tokens.shadow['shadow-1'].$value as DTCGShadowValue;
    expect(shadow.color.components).toEqual([0, 0, 0]);
    expect(shadow.color.alpha).toBe(0.25);
    expect(shadow.offsetX.value).toBe(0);
    expect(shadow.offsetY.value).toBe(2);
    expect(shadow.blur.value).toBe(4);
  });

  // --- Descriptions ---

  it('all tokens have $description', () => {
    const { tokens } = exporter.exportDTCG(makeDNA());

    for (const token of Object.values(tokens.color)) {
      expect(token.$description).toBeTruthy();
    }
    for (const token of Object.values(tokens.typography)) {
      expect(token.$description).toBeTruthy();
    }
    for (const token of Object.values(tokens.spacing)) {
      expect(token.$description).toBeTruthy();
    }
  });

  // --- Empty inputs ---

  it('handles empty color palette', () => {
    const dna = makeDNA({ colorPalette: {} });
    const { tokens } = exporter.exportDTCG(dna);
    expect(Object.keys(tokens.color)).toHaveLength(0);
  });

  it('handles empty spacing', () => {
    const dna = makeDNA({ spacing: [] });
    const { tokens } = exporter.exportDTCG(dna);
    expect(Object.keys(tokens.spacing)).toHaveLength(0);
  });

  it('handles empty shadows', () => {
    const dna = makeDNA({ shadows: [] });
    const { tokens } = exporter.exportDTCG(dna);
    expect(Object.keys(tokens.shadow)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TokenExporter.exportCSS
// ---------------------------------------------------------------------------

describe('TokenExporter.exportCSS', () => {
  let exporter: TokenExporter;

  beforeEach(() => {
    exporter = new TokenExporter();
  });

  it('generates CSS custom properties wrapped in :root', () => {
    const css = exporter.exportCSS(makeDNA());
    expect(css).toContain(':root {');
    expect(css).toContain('}');
  });

  it('exports color custom properties', () => {
    const css = exporter.exportCSS(makeDNA());
    expect(css).toContain('--color-primary: #3b82f6;');
    expect(css).toContain('--color-secondary: #10b981;');
    expect(css).toContain('--color-background: #ffffff;');
  });

  it('exports typography custom properties', () => {
    const css = exporter.exportCSS(makeDNA());
    expect(css).toContain('--font-display: 48px;');
    expect(css).toContain('--font-headline: 32px;');
    expect(css).toContain('--font-body: 16px;');
    expect(css).toContain('--font-label: 12px;');
  });

  it('exports spacing custom properties', () => {
    const css = exporter.exportCSS(makeDNA());
    expect(css).toContain('--space-1: 4px;');
    expect(css).toContain('--space-2: 8px;');
    expect(css).toContain('--space-5: 32px;');
  });

  it('exports border radius custom properties', () => {
    const css = exporter.exportCSS(makeDNA());
    expect(css).toContain('--radius-sm: 4px;');
    expect(css).toContain('--radius-md: 8px;');
    expect(css).toContain('--radius-lg: 16px;');
  });

  it('exports shadow custom properties', () => {
    const css = exporter.exportCSS(makeDNA());
    expect(css).toContain('--shadow-1:');
    expect(css).toContain('--shadow-2:');
  });

  it('exports animation level', () => {
    const css = exporter.exportCSS(makeDNA());
    expect(css).toContain('--animation-level: subtle;');
  });
});

// ---------------------------------------------------------------------------
// TokenExporter.writeToSpecs
// ---------------------------------------------------------------------------

describe('TokenExporter.writeToSpecs', () => {
  let exporter: TokenExporter;

  beforeEach(() => {
    exporter = new TokenExporter();
    // Clean up test dir
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('writes DTCG tokens to tokens.json', () => {
    const { tokens } = exporter.exportDTCG(makeDNA());
    const filePath = exporter.writeToSpecs(tokens, 'dtcg', TEST_DIR);

    expect(filePath).toBe(path.join(TEST_DIR, 'tokens.json'));
    expect(fs.existsSync(filePath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content).toHaveProperty('color');
    expect(content).toHaveProperty('typography');
  });

  it('writes CSS to tokens.css', () => {
    const css = exporter.exportCSS(makeDNA());
    const filePath = exporter.writeToSpecs(css, 'css', TEST_DIR);

    expect(filePath).toBe(path.join(TEST_DIR, 'tokens.css'));
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain(':root {');
  });

  it('creates directory if it does not exist', () => {
    const nestedDir = path.join(TEST_DIR, 'nested', 'deep');
    expect(fs.existsSync(nestedDir)).toBe(false);

    exporter.writeToSpecs('test content', 'css', nestedDir);
    expect(fs.existsSync(nestedDir)).toBe(true);
  });

  it('overwrites existing file', () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const filePath = path.join(TEST_DIR, 'tokens.css');
    fs.writeFileSync(filePath, 'old content', 'utf-8');

    exporter.writeToSpecs('new content', 'css', TEST_DIR);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toBe('new content');
  });

  it('returns the full file path', () => {
    const filePath = exporter.writeToSpecs('{}', 'dtcg', TEST_DIR);
    expect(path.isAbsolute(filePath)).toBe(true);
    expect(filePath).toContain('tokens.json');
  });
});
