/**
 * MOD-007: Post-processor — HTML post-processing for self-containment.
 * Three operations: font patching, external asset inlining, responsive verification.
 */
import * as https from 'node:https';
import * as http from 'node:http';
import type { PostProcessOptions, PostProcessReport } from './types.js';

const DEFAULT_ASSET_TIMEOUT = 10000;

export interface PatchFontsResult {
  html: string;
  patchCount: number;
}

export interface InlineAssetsResult {
  html: string;
  inlinedCount: number;
  failedUrls: string[];
}

export interface VerifyResponsiveResult {
  html: string;
  injected: boolean;
}

// ---------------------------------------------------------------------------
// Responsive breakpoint CSS to inject when none detected
// ---------------------------------------------------------------------------

const RESPONSIVE_CSS = `
<style data-nopilot-responsive="injected">
  @media (max-width: 768px) {
    body { padding: 16px !important; }
    img { max-width: 100% !important; height: auto !important; }
    table { width: 100% !important; overflow-x: auto; display: block; }
  }
  @media (max-width: 480px) {
    body { padding: 8px !important; font-size: 14px !important; }
    h1 { font-size: 24px !important; }
    h2 { font-size: 20px !important; }
  }
</style>`;

const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';

// ---------------------------------------------------------------------------
// PostProcessor
// ---------------------------------------------------------------------------

export class PostProcessor {
  /**
   * Run all three post-processing operations in sequence:
   * patchFonts -> inlineAssets -> verifyResponsive
   */
  static async process(
    html: string,
    options: PostProcessOptions,
  ): Promise<{ html: string; report: PostProcessReport }> {
    let current = html;
    let fontPatchCount = 0;
    let assetsInlined = 0;
    let assetsFailed: string[] = [];
    let responsiveInjected = false;

    // 1. Patch fonts
    const fontResult = PostProcessor.patchFonts(current, options.targetFontStack);
    current = fontResult.html;
    fontPatchCount = fontResult.patchCount;

    // 2. Inline assets (if enabled)
    if (options.inlineAssets !== false) {
      const assetResult = await PostProcessor.inlineAssets(current, options.assetDownloadTimeout);
      current = assetResult.html;
      assetsInlined = assetResult.inlinedCount;
      assetsFailed = assetResult.failedUrls;
    }

    // 3. Verify responsive (if enabled)
    if (options.verifyResponsive !== false) {
      const responsiveResult = PostProcessor.verifyResponsive(current);
      current = responsiveResult.html;
      responsiveInjected = responsiveResult.injected;
    }

    return {
      html: current,
      report: {
        fontPatchCount,
        assetsInlined,
        assetsFailed,
        responsiveInjected,
      },
    };
  }

  /**
   * Replace all font-family declarations in HTML with the target font stack.
   * Matches font-family in both <style> blocks and inline style attributes.
   */
  static patchFonts(html: string, targetFontStack: string): PatchFontsResult {
    let patchCount = 0;
    const fontFamilyRegex = /font-family\s*:\s*([^;}"']+)/g;

    const patched = html.replace(fontFamilyRegex, (_match, _existing) => {
      patchCount++;
      return `font-family: ${targetFontStack}`;
    });

    return { html: patched, patchCount };
  }

  /**
   * Find all external image/asset URLs in HTML and convert to base64 data URIs.
   * Only downloads from HTTPS URLs.
   */
  static async inlineAssets(
    html: string,
    timeout: number = DEFAULT_ASSET_TIMEOUT,
  ): Promise<InlineAssetsResult> {
    // Collect all external URLs from img src and url()
    const urlPatterns = [
      // <img src="https://...">
      /(<img[^>]+src\s*=\s*["'])(https?:\/\/[^"']+)(["'])/g,
      // url('https://...')  or  url("https://...")  or  url(https://...)
      /(url\s*\(\s*["']?)(https?:\/\/[^"')]+)(["']?\s*\))/g,
    ];

    const urlsToDownload: Array<{ fullMatch: string; prefix: string; url: string; suffix: string }> = [];

    for (const pattern of urlPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        urlsToDownload.push({
          fullMatch: match[0],
          prefix: match[1],
          url: match[2],
          suffix: match[3],
        });
      }
    }

    if (urlsToDownload.length === 0) {
      return { html, inlinedCount: 0, failedUrls: [] };
    }

    let inlinedCount = 0;
    const failedUrls: string[] = [];
    let result = html;

    // Download and replace each URL
    for (const entry of urlsToDownload) {
      // Only download HTTPS URLs
      if (!entry.url.startsWith('https://')) {
        failedUrls.push(entry.url);
        continue;
      }

      try {
        const { data, contentType } = await PostProcessor.downloadAsset(entry.url, timeout);
        const base64 = data.toString('base64');
        const mimeType = contentType || PostProcessor.guessMimeType(entry.url);
        const dataUri = `data:${mimeType};base64,${base64}`;

        result = result.replace(entry.fullMatch, `${entry.prefix}${dataUri}${entry.suffix}`);
        inlinedCount++;
      } catch {
        failedUrls.push(entry.url);
      }
    }

    return { html: result, inlinedCount, failedUrls };
  }

  /**
   * Check if HTML contains responsive CSS. Inject basic breakpoints if missing.
   */
  static verifyResponsive(html: string): VerifyResponsiveResult {
    const hasMedia = /@media\s/.test(html);
    const hasContainer = /@container\s/.test(html);

    if (hasMedia || hasContainer) {
      return { html, injected: false };
    }

    let result = html;

    // Inject viewport meta if missing
    if (!result.includes('name="viewport"') && !result.includes("name='viewport'")) {
      result = result.replace(/<head([^>]*)>/i, `<head$1>\n  ${VIEWPORT_META}`);
    }

    // Inject responsive CSS before </head>
    if (result.includes('</head>')) {
      result = result.replace('</head>', `${RESPONSIVE_CSS}\n</head>`);
    } else if (result.includes('</body>')) {
      // No <head>, inject before </body>
      result = result.replace('</body>', `${RESPONSIVE_CSS}\n</body>`);
    } else {
      // Append at end
      result += RESPONSIVE_CSS;
    }

    return { html: result, injected: true };
  }

  // -------------------------------------------------------------------------
  // Asset download helpers
  // -------------------------------------------------------------------------

  /**
   * Download a URL and return its Buffer and content type.
   * Only supports HTTPS. Rejects on timeout or error.
   */
  private static downloadAsset(
    url: string,
    timeout: number,
  ): Promise<{ data: Buffer; contentType: string }> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https://') ? https : http;
      const req = client.get(url, { timeout }, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] ?? '';
          resolve({ data, contentType: contentType.split(';')[0].trim() });
        });
        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout downloading ${url}`));
      });
      req.on('error', reject);
    });
  }

  /**
   * Guess MIME type from URL file extension.
   */
  private static guessMimeType(url: string): string {
    const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    switch (ext) {
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'svg': return 'image/svg+xml';
      case 'webp': return 'image/webp';
      case 'ico': return 'image/x-icon';
      case 'woff': return 'font/woff';
      case 'woff2': return 'font/woff2';
      case 'ttf': return 'font/ttf';
      default: return 'application/octet-stream';
    }
  }
}
