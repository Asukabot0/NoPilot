/**
 * Tests for MOD-006: Style detector.
 * Covers: CSS parsing, Tailwind config parsing, file scanning, design tokens,
 * constraint synthesis, screenshot stub, merge profiles.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { StyleDetector } from '../style-detector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function createTmpProject(files: Record<string, string>): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nopilot-style-test-'));
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
  return tmpDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StyleDetector', () => {
  let detector: StyleDetector;

  beforeEach(() => {
    detector = new StyleDetector();
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // --- detect: no files ---

  it('returns detected=false when no style files found', async () => {
    const projectRoot = createTmpProject({ 'README.md': '# Hello' });
    const result = await detector.detect(projectRoot);
    expect(result.detected).toBe(false);
    expect(result.profile).toBeNull();
  });

  // --- detect: CSS files ---

  it('detects and parses CSS files', async () => {
    const css = `
      :root {
        --primary: #3b82f6;
        --secondary: #10b981;
      }
      body {
        font-family: "Inter", -apple-system, sans-serif;
        color: #333333;
        padding: 16px;
        margin: 24px;
      }
      .card {
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      }
      @media (min-width: 768px) {
        body { padding: 32px; }
      }
      @media (min-width: 1024px) {
        body { padding: 48px; }
      }
    `;
    const projectRoot = createTmpProject({ 'styles/main.css': css });
    const result = await detector.detect(projectRoot);

    expect(result.detected).toBe(true);
    expect(result.profile).not.toBeNull();
    const p = result.profile!;

    expect(p.source).toBe('css');
    expect(p.colors['primary']).toBe('#3b82f6');
    expect(p.colors['secondary']).toBe('#10b981');
    expect(p.fonts).toContain('Inter');
    expect(p.spacingScale.length).toBeGreaterThan(0);
    expect(Object.keys(p.borderRadius).length).toBeGreaterThan(0);
    expect(p.shadows.length).toBeGreaterThan(0);
    expect(p.breakpoints).not.toBeNull();
    expect(p.confidence).toBeGreaterThanOrEqual(0.5);
  });

  // --- detect: SCSS files ---

  it('detects and parses SCSS files', async () => {
    const scss = `
      $primary: #ff6b6b;
      body {
        font-family: "Nunito", Arial, sans-serif;
        color: #2d3436;
      }
      .dark {
        background-color: #0a0a0a;
      }
    `;
    const projectRoot = createTmpProject({ 'styles/app.scss': scss });
    const result = await detector.detect(projectRoot);

    expect(result.detected).toBe(true);
    expect(result.profile!.source).toBe('scss');
    expect(result.profile!.fonts).toContain('Nunito');
    expect(result.profile!.darkMode).toBe(true);
  });

  // --- detect: Tailwind config ---

  it('detects and parses tailwind.config.js', async () => {
    const twConfig = `
      /** @type {import('tailwindcss').Config} */
      module.exports = {
        darkMode: 'class',
        theme: {
          extend: {
            colors: {
              primary: '#007AFF',
              accent: '#FF6B35',
            },
            fontFamily: {
              sans: ['PingFang SC', '-apple-system', 'sans-serif'],
            },
            spacing: {
              '18': '4.5rem',
              '22': '5.5rem',
            },
            borderRadius: {
              lg: '12px',
              xl: '20px',
            },
            screens: {
              sm: '640px',
              md: '768px',
              lg: '1024px',
            },
          },
        },
      };
    `;
    const projectRoot = createTmpProject({ 'tailwind.config.js': twConfig });
    const result = await detector.detect(projectRoot);

    expect(result.detected).toBe(true);
    const p = result.profile!;

    expect(p.source).toBe('tailwind');
    expect(p.colors['primary']).toBe('#007AFF');
    expect(p.colors['accent']).toBe('#FF6B35');
    expect(p.fonts).toContain('PingFang SC');
    expect(p.borderRadius['lg']).toBe('12px');
    expect(p.darkMode).toBe(true);
    expect(p.breakpoints).not.toBeNull();
    expect(p.breakpoints!['sm']).toBe('640px');
    expect(p.confidence).toBe(0.9);
  });

  it('detects tailwind.config.ts', async () => {
    const twConfig = `
      import type { Config } from 'tailwindcss';
      export default {
        theme: {
          extend: {
            colors: {
              brand: '#FF0000',
            },
          },
        },
      } satisfies Config;
    `;
    const projectRoot = createTmpProject({ 'tailwind.config.ts': twConfig });
    const result = await detector.detect(projectRoot);

    expect(result.detected).toBe(true);
    expect(result.profile!.source).toBe('tailwind');
    expect(result.profile!.colors['brand']).toBe('#FF0000');
  });

  // --- detect: design-tokens.json ---

  it('detects and parses design-tokens.json', async () => {
    const tokens = JSON.stringify({
      colors: { primary: '#3b82f6', background: '#ffffff' },
      fonts: ['SF Pro Display', 'Helvetica Neue'],
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
      borderRadius: { sm: '4px', md: '8px', lg: '16px', full: '9999px' },
    });
    const projectRoot = createTmpProject({ 'design-tokens.json': tokens });
    const result = await detector.detect(projectRoot);

    expect(result.detected).toBe(true);
    const p = result.profile!;
    expect(p.source).toBe('design-tokens');
    expect(p.colors['primary']).toBe('#3b82f6');
    expect(p.fonts).toContain('SF Pro Display');
    expect(p.spacingScale).toEqual([4, 8, 16, 24, 32]);
    expect(p.borderRadius['full']).toBe('9999px');
    expect(p.confidence).toBe(0.8);
  });

  // --- detect: theme files ---

  it('detects theme.js', async () => {
    const theme = `
      export const theme = {
        primary: '#6366f1',
        secondary: '#a855f7',
      };
    `;
    const projectRoot = createTmpProject({ 'theme.js': theme });
    const result = await detector.detect(projectRoot);

    expect(result.detected).toBe(true);
    expect(result.profile!.colors['primary']).toBe('#6366f1');
  });

  // --- File priority ---

  it('prioritizes tailwind config over CSS when both exist', async () => {
    const twConfig = `module.exports = { theme: { extend: { colors: { tw: '#111' } } } };`;
    const css = `body { color: #999; font-family: Arial; }`;
    const projectRoot = createTmpProject({
      'tailwind.config.js': twConfig,
      'styles/main.css': css,
    });
    const result = await detector.detect(projectRoot);

    expect(result.detected).toBe(true);
    expect(result.profile!.source).toBe('tailwind');
    expect(result.profile!.colors['tw']).toBe('#111');
    // Fonts from CSS should be merged in
    expect(result.profile!.fonts).toContain('Arial');
  });

  // --- analyzeScreenshots (stub) ---

  it('analyzeScreenshots returns placeholder profile', async () => {
    const profile = await detector.analyzeScreenshots(['/path/to/screenshot.png']);
    expect(profile.source).toBe('screenshot');
    expect(profile.confidence).toBe(0.3);
    expect(profile.colors).toBeDefined();
    expect(profile.fonts.length).toBeGreaterThan(0);
  });

  // --- synthesizeConstraint ---

  it('synthesizes a markdown constraint from profile', () => {
    const md = detector.synthesizeConstraint({
      source: 'css',
      colors: { primary: '#3b82f6', background: '#fff' },
      fonts: ['Inter', 'sans-serif'],
      spacingScale: [4, 8, 16, 24],
      borderRadius: { sm: '4px', lg: '16px' },
      shadows: ['0 1px 3px rgba(0,0,0,0.1)'],
      breakpoints: { sm: '640px', lg: '1024px' },
      darkMode: true,
      componentLibrary: 'shadcn',
      confidence: 0.7,
    });

    expect(md).toContain('# Design System Constraints');
    expect(md).toContain('70%');
    expect(md).toContain('#3b82f6');
    expect(md).toContain('Inter');
    expect(md).toContain('4px, 8px, 16px, 24px');
    expect(md).toContain('sm');
    expect(md).toContain('640px');
    expect(md).toContain('Dark mode');
    expect(md).toContain('shadcn');
    expect(md).toContain('0 1px 3px rgba(0,0,0,0.1)');
  });

  it('synthesizeConstraint omits empty sections', () => {
    const md = detector.synthesizeConstraint({
      source: 'css',
      colors: {},
      fonts: [],
      spacingScale: [],
      borderRadius: {},
      shadows: [],
      breakpoints: null,
      darkMode: null,
      componentLibrary: null,
      confidence: 0.5,
    });

    expect(md).toContain('# Design System Constraints');
    expect(md).not.toContain('## Color Palette');
    expect(md).not.toContain('## Typography');
    expect(md).not.toContain('## Spacing');
  });

  // --- Component library detection ---

  it('detects shadcn component library in CSS', () => {
    const css = `/* shadcn/ui styles */ .cn\\(flex\\) { display: flex; }`;
    const profile = detector.parseCss(css, 'css');
    expect(profile.componentLibrary).toBe('shadcn');
  });

  it('detects antd component library', () => {
    const css = `/* @ant-design */ .ant-btn { color: blue; }`;
    const profile = detector.parseCss(css, 'css');
    expect(profile.componentLibrary).toBe('antd');
  });

  // --- Edge cases ---

  it('handles empty CSS file gracefully', () => {
    const profile = detector.parseCss('', 'css');
    expect(profile.colors).toEqual({});
    expect(profile.fonts).toEqual([]);
    expect(profile.spacingScale).toEqual([]);
  });

  it('handles malformed design-tokens.json', async () => {
    const projectRoot = createTmpProject({ 'design-tokens.json': 'not json {{{' });
    const result = await detector.detect(projectRoot);
    expect(result.detected).toBe(true);
    // Should still return a profile, just empty
    expect(result.profile).not.toBeNull();
  });
});
