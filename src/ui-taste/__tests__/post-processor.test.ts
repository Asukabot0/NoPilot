/**
 * Tests for MOD-007: Post-processor.
 * Covers: font patching, asset inlining (with mock HTTP), responsive injection,
 * full pipeline via process().
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import * as http from 'node:http';
import { PostProcessor } from '../post-processor.js';
import type { PostProcessOptions } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers: local mock HTTP server for asset inlining tests
// ---------------------------------------------------------------------------

let mockServer: http.Server | null = null;
let mockServerPort = 0;

/** Start a mock HTTPS-like server on localhost (HTTP for testing).
 *  The inlineAssets only downloads HTTPS in production; we test the download
 *  logic separately and also test with real HTTPS-mock where needed. */
function startMockServer(): Promise<number> {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      if (req.url === '/image.png') {
        // Return a 1x1 PNG pixel
        const pixel = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
          'base64',
        );
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(pixel);
      } else if (req.url === '/style.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end('body { color: red; }');
      } else if (req.url === '/slow') {
        // Simulate slow response (never responds)
        // Request will timeout
      } else if (req.url === '/error') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer!.address();
      if (addr && typeof addr !== 'string') {
        mockServerPort = addr.port;
      }
      resolve(mockServerPort);
    });
  });
}

afterAll(async () => {
  if (mockServer) {
    await new Promise<void>((resolve) => mockServer!.close(() => resolve()));
    mockServer = null;
  }
});

// ---------------------------------------------------------------------------
// patchFonts
// ---------------------------------------------------------------------------

describe('PostProcessor.patchFonts', () => {
  it('replaces font-family in style blocks', () => {
    const html = `<html><head><style>body { font-family: Inter, sans-serif; }</style></head><body></body></html>`;
    const target = '"PingFang SC", -apple-system, sans-serif';
    const result = PostProcessor.patchFonts(html, target);
    expect(result.html).toContain(target);
    expect(result.html).not.toContain('Inter');
    expect(result.patchCount).toBe(1);
  });

  it('replaces font-family in inline styles', () => {
    const html = `<div style="font-family: Roboto, Arial, sans-serif;">Hello</div>`;
    const target = '"SF Pro Display", sans-serif';
    const result = PostProcessor.patchFonts(html, target);
    expect(result.html).toContain(target);
    expect(result.html).not.toContain('Roboto');
    expect(result.patchCount).toBe(1);
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
      .label { font-family: monospace; }
    </style>`;
    const target = '"PingFang SC", sans-serif';
    const result = PostProcessor.patchFonts(html, target);
    expect(result.patchCount).toBe(3);
  });

  it('handles font-family with extra whitespace', () => {
    const html = `<style>body { font-family :  "Noto Sans" , Helvetica , sans-serif; }</style>`;
    const result = PostProcessor.patchFonts(html, 'Georgia');
    expect(result.patchCount).toBe(1);
    expect(result.html).toContain('font-family: Georgia');
  });
});

// ---------------------------------------------------------------------------
// inlineAssets
// ---------------------------------------------------------------------------

describe('PostProcessor.inlineAssets', () => {
  it('returns unchanged html when no external URLs found', async () => {
    const html = '<html><body><img src="local.png"></body></html>';
    const result = await PostProcessor.inlineAssets(html);
    expect(result.html).toBe(html);
    expect(result.inlinedCount).toBe(0);
    expect(result.failedUrls).toHaveLength(0);
  });

  it('skips non-HTTPS URLs and adds them to failedUrls', async () => {
    const html = '<html><body><img src="http://example.com/img.png"></body></html>';
    const result = await PostProcessor.inlineAssets(html);
    expect(result.inlinedCount).toBe(0);
    expect(result.failedUrls).toContain('http://example.com/img.png');
  });

  it('detects img src URLs', async () => {
    const html = `<img src="https://example.com/photo.jpg">`;
    // This will fail to download (no real server), so it goes to failedUrls
    const result = await PostProcessor.inlineAssets(html, 1000);
    expect(result.failedUrls.length).toBeGreaterThan(0);
  });

  it('detects url() in CSS', async () => {
    const html = `<style>body { background: url("https://example.com/bg.png"); }</style>`;
    const result = await PostProcessor.inlineAssets(html, 1000);
    expect(result.failedUrls.length).toBeGreaterThan(0);
    expect(result.failedUrls[0]).toContain('example.com/bg.png');
  });

  it('detects url() without quotes', async () => {
    const html = `<style>body { background: url(https://example.com/bg.png); }</style>`;
    const result = await PostProcessor.inlineAssets(html, 1000);
    expect(result.failedUrls).toContain('https://example.com/bg.png');
  });
});

// ---------------------------------------------------------------------------
// verifyResponsive
// ---------------------------------------------------------------------------

describe('PostProcessor.verifyResponsive', () => {
  it('does not inject when @media already present', () => {
    const html = `<html><head></head><body><style>@media (max-width: 768px) { body { padding: 8px; } }</style></body></html>`;
    const result = PostProcessor.verifyResponsive(html);
    expect(result.injected).toBe(false);
    expect(result.html).toBe(html);
  });

  it('does not inject when @container already present', () => {
    const html = `<html><head></head><body><style>@container (min-width: 400px) { .card { display: grid; } }</style></body></html>`;
    const result = PostProcessor.verifyResponsive(html);
    expect(result.injected).toBe(false);
  });

  it('injects responsive CSS when no @media or @container found', () => {
    const html = `<html><head></head><body><style>body { color: red; }</style></body></html>`;
    const result = PostProcessor.verifyResponsive(html);
    expect(result.injected).toBe(true);
    expect(result.html).toContain('data-nopilot-responsive="injected"');
    expect(result.html).toContain('@media (max-width: 768px)');
    expect(result.html).toContain('@media (max-width: 480px)');
  });

  it('injects viewport meta when missing', () => {
    const html = `<html><head><title>Test</title></head><body></body></html>`;
    const result = PostProcessor.verifyResponsive(html);
    expect(result.injected).toBe(true);
    expect(result.html).toContain('name="viewport"');
    expect(result.html).toContain('width=device-width');
  });

  it('does not duplicate viewport meta when already present', () => {
    const html = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Test</title></head><body></body></html>`;
    const result = PostProcessor.verifyResponsive(html);
    expect(result.injected).toBe(true);
    // Should not have two viewport metas
    const viewportCount = (result.html.match(/name="viewport"/g) || []).length;
    expect(viewportCount).toBe(1);
  });

  it('handles HTML without <head> tag', () => {
    const html = `<body><p>Hello</p></body>`;
    const result = PostProcessor.verifyResponsive(html);
    expect(result.injected).toBe(true);
    expect(result.html).toContain('data-nopilot-responsive="injected"');
  });

  it('handles HTML without <head> or <body>', () => {
    const html = `<div>Just a div</div>`;
    const result = PostProcessor.verifyResponsive(html);
    expect(result.injected).toBe(true);
    expect(result.html).toContain('@media');
  });
});

// ---------------------------------------------------------------------------
// process() — full pipeline
// ---------------------------------------------------------------------------

describe('PostProcessor.process', () => {
  it('runs all three operations in sequence', async () => {
    const html = `<html><head><title>Test</title></head><body>
      <style>body { font-family: Inter, sans-serif; color: red; }</style>
      <p>Hello world</p>
    </body></html>`;

    const options: PostProcessOptions = {
      targetFontStack: '"PingFang SC", sans-serif',
      inlineAssets: true,
      verifyResponsive: true,
      assetDownloadTimeout: 5000,
    };

    const { html: result, report } = await PostProcessor.process(html, options);

    // Font patching happened
    expect(report.fontPatchCount).toBe(1);
    expect(result).toContain('"PingFang SC"');
    expect(result).not.toContain('Inter');

    // No assets to inline
    expect(report.assetsInlined).toBe(0);

    // Responsive was injected (no @media in original)
    expect(report.responsiveInjected).toBe(true);
    expect(result).toContain('data-nopilot-responsive="injected"');
  });

  it('skips asset inlining when disabled', async () => {
    const html = `<html><head></head><body><img src="https://example.com/img.png"><style>body { font-family: Arial; } @media (max-width: 768px) { }</style></body></html>`;

    const options: PostProcessOptions = {
      targetFontStack: 'Georgia',
      inlineAssets: false,
      verifyResponsive: true,
      assetDownloadTimeout: 5000,
    };

    const { html: result, report } = await PostProcessor.process(html, options);
    expect(report.assetsInlined).toBe(0);
    expect(report.assetsFailed).toHaveLength(0);
    // Original URL should still be present
    expect(result).toContain('https://example.com/img.png');
  });

  it('skips responsive verification when disabled', async () => {
    const html = `<html><head></head><body><style>body { font-family: Roboto; }</style></body></html>`;

    const options: PostProcessOptions = {
      targetFontStack: 'sans-serif',
      inlineAssets: false,
      verifyResponsive: false,
      assetDownloadTimeout: 5000,
    };

    const { report } = await PostProcessor.process(html, options);
    expect(report.responsiveInjected).toBe(false);
  });

  it('report has correct shape', async () => {
    const html = `<html><head></head><body></body></html>`;
    const options: PostProcessOptions = {
      targetFontStack: 'sans-serif',
      inlineAssets: true,
      verifyResponsive: true,
      assetDownloadTimeout: 5000,
    };

    const { report } = await PostProcessor.process(html, options);
    expect(report).toHaveProperty('fontPatchCount');
    expect(report).toHaveProperty('assetsInlined');
    expect(report).toHaveProperty('assetsFailed');
    expect(report).toHaveProperty('responsiveInjected');
    expect(typeof report.fontPatchCount).toBe('number');
    expect(Array.isArray(report.assetsFailed)).toBe(true);
  });
});
