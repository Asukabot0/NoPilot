/**
 * MOD-004: Preview engine — local HTTP server for design variant selection.
 * Full spec: state machine, device presets, SSH detection, round history,
 * hot-reload, timeout, temp file management.
 */
import * as http from 'node:http';
import * as net from 'node:net';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DesignVariant,
  PageSpec,
  PreviewSession,
  SelectionResult,
  DevicePreset,
} from './types.js';

const DEFAULT_PORT = 8900;
const DEFAULT_TIMEOUT_MS = 1800000; // 30 minutes

// ---------------------------------------------------------------------------
// Device presets (10 from spec)
// ---------------------------------------------------------------------------

export const DEVICE_PRESETS: readonly DevicePreset[] = [
  { name: 'iPhone SE', width: 375, height: 667, hasBezel: true, category: 'phone' },
  { name: 'iPhone 16 Pro', width: 393, height: 852, hasBezel: true, category: 'phone' },
  { name: 'iPhone 16 Pro Max', width: 430, height: 932, hasBezel: true, category: 'phone' },
  { name: 'iPad mini', width: 744, height: 1133, hasBezel: true, category: 'tablet' },
  { name: 'iPad Pro 11"', width: 834, height: 1194, hasBezel: true, category: 'tablet' },
  { name: 'iPad Pro 13"', width: 1024, height: 1366, hasBezel: true, category: 'tablet' },
  { name: 'iPad Split View', width: 507, height: 1194, hasBezel: true, category: 'special' },
  { name: 'Slide Over', width: 320, height: 1194, hasBezel: true, category: 'special' },
  { name: 'Desktop', width: 1440, height: 900, hasBezel: true, category: 'desktop' },
  { name: 'Full Screen', width: 0, height: 0, hasBezel: false, category: 'special' },
] as const;

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type PreviewState = 'idle' | 'serving' | 'awaiting_selection' | 'updating' | 'closing';

// ---------------------------------------------------------------------------
// PreviewEngine
// ---------------------------------------------------------------------------

export class PreviewEngine {
  private server: http.Server | null = null;
  private selectionResolve: ((result: SelectionResult) => void) | null = null;
  private selectionReject: ((err: Error) => void) | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private currentVariants: DesignVariant[] = [];
  private roundHistory: Map<number, DesignVariant[]> = new Map();
  private currentRound = 1;
  private state: PreviewState = 'idle';
  private tmpDir: string | null = null;
  private pageSpec: PageSpec | null = null;

  /** Current state (for testing). */
  getState(): PreviewState {
    return this.state;
  }

  /**
   * Start the preview server on an auto-detected available port.
   */
  async start(
    variants: DesignVariant[],
    pageSpec: PageSpec,
    options?: { darkVariants?: DesignVariant[]; timeout?: number },
  ): Promise<PreviewSession> {
    this.currentVariants = variants;
    this.pageSpec = pageSpec;
    this.currentRound = 1;
    this.roundHistory.clear();
    this.roundHistory.set(1, variants);

    const port = await this.findAvailablePort(DEFAULT_PORT);
    const sessionId = crypto.randomUUID();

    // Create temp directory
    this.tmpDir = path.join('/tmp', `nopilot-preview-${sessionId}`);
    fs.mkdirSync(this.tmpDir, { recursive: true });

    // Write variant HTML files to temp dir
    for (const v of variants) {
      fs.writeFileSync(path.join(this.tmpDir, `${v.id}.html`), v.htmlCode, 'utf-8');
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // Try the found port; if it races with another process, fall back to OS-assigned port.
    const actualPort = await this.listenWithFallback(this.server, port);

    this.state = 'serving';

    const url = `http://localhost:${actualPort}`;
    const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;

    return {
      id: sessionId,
      port: actualPort,
      url,
      currentRound: this.currentRound,
      timeoutMs,
    };
  }

  /**
   * Returns a Promise that resolves when the user makes a selection via POST /api/select.
   * Rejects after timeout (default 30 min).
   */
  awaitSelection(session: PreviewSession): Promise<SelectionResult> {
    this.state = 'awaiting_selection';

    return new Promise<SelectionResult>((resolve, reject) => {
      this.selectionReject = reject;

      // Timeout
      this.timeoutTimer = setTimeout(() => {
        this.selectionResolve = null;
        this.selectionReject = null;
        this.state = 'closing';
        reject(new Error(`Selection timed out after ${session.timeoutMs}ms`));
      }, session.timeoutMs);

      this.selectionResolve = (result: SelectionResult) => {
        if (this.timeoutTimer) {
          clearTimeout(this.timeoutTimer);
          this.timeoutTimer = null;
        }
        this.state = 'serving';
        resolve(result);
      };
    });
  }

  /**
   * Hot-reload preview page with new iteration round variants.
   */
  updateVariants(session: PreviewSession, variants: DesignVariant[], round: number): void {
    this.state = 'updating';
    this.currentVariants = variants;
    this.currentRound = round;
    this.roundHistory.set(round, variants);

    // Write new variant HTML files to temp dir
    if (this.tmpDir) {
      for (const v of variants) {
        fs.writeFileSync(path.join(this.tmpDir, `${v.id}.html`), v.htmlCode, 'utf-8');
      }
    }

    session.currentRound = round;
    this.state = 'awaiting_selection';
  }

  /**
   * Stop the server and clean up temp files.
   */
  async stop(): Promise<void> {
    this.state = 'closing';

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    // Clean up temp directory
    if (this.tmpDir && fs.existsSync(this.tmpDir)) {
      fs.rmSync(this.tmpDir, { recursive: true, force: true });
      this.tmpDir = null;
    }

    this.selectionResolve = null;
    this.selectionReject = null;
    this.roundHistory.clear();
    this.state = 'idle';
  }

  /**
   * Detect SSH environment and open browser or display URL.
   * Returns 'browser' if opened, 'url_display' if SSH detected.
   */
  openOrDisplay(url: string): 'browser' | 'url_display' {
    const isSSH = !!(
      process.env.SSH_CLIENT ||
      process.env.SSH_TTY ||
      process.env.SSH_CONNECTION
    );

    if (isSSH) {
      process.stderr.write(`\nPreview URL: ${url}\n`);
      return 'url_display';
    }

    // Try to open browser (fire-and-forget)
    const { spawn } = require('node:child_process') as typeof import('node:child_process');
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    try {
      const child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
      child.unref();
    } catch {
      // If browser open fails, fall back to URL display
      process.stderr.write(`\nPreview URL: ${url}\n`);
      return 'url_display';
    }

    return 'browser';
  }

  // -------------------------------------------------------------------------
  // Request handling
  // -------------------------------------------------------------------------

  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    const url = req.url ?? '/';

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && url === '/api/select') {
      this.handleSelect(req, res);
      return;
    }

    // GET /api/variants/:round
    const variantsMatch = url.match(/^\/api\/variants\/(\d+)$/);
    if (req.method === 'GET' && variantsMatch) {
      this.handleGetVariants(res, parseInt(variantsMatch[1], 10));
      return;
    }

    if (req.method === 'GET' && url === '/') {
      this.serveSelectorPage(res);
      return;
    }

    // Serve individual variant HTML
    const variantMatch = url.match(/^\/variant\/(.+)$/);
    if (req.method === 'GET' && variantMatch) {
      const variantId = variantMatch[1];
      const variant = this.currentVariants.find((v) => v.id === variantId);
      if (variant) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(variant.htmlCode);
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private handleSelect(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const result: SelectionResult = {
          action: data.action ?? 'select',
          selectedVariantId: data.variantId ?? null,
          feedback: data.feedback ?? null,
          hybridSelections: data.hybridSelections ?? null,
          rollbackToRound: data.rollbackToRound ?? null,
          round: data.round ?? this.currentRound,
          overrideDesignSystem: data.overrideDesignSystem ?? undefined,
        };

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ status: 'ok', message: 'Selection received' }));

        if (this.selectionResolve) {
          this.selectionResolve(result);
          this.selectionResolve = null;
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  private handleGetVariants(res: http.ServerResponse, round: number): void {
    const variants = this.roundHistory.get(round);
    if (!variants) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `No variants for round ${round}` }));
      return;
    }

    const payload = variants.map((v) => ({
      id: v.id,
      title: v.metadata.title,
      htmlPath: `/variant/${v.id}`,
    }));

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ variants: payload }));
  }

  private serveSelectorPage(res: http.ServerResponse): void {
    const pageSpec = this.pageSpec!;

    const variantTabs = this.currentVariants
      .map(
        (v, i) =>
          `<button class="tab${i === 0 ? ' active' : ''}" onclick="showVariant('${v.id}', this)">${v.metadata.title}</button>`,
      )
      .join('\n        ');

    const variantFrames = this.currentVariants
      .map(
        (v, i) =>
          `<iframe id="frame-${v.id}" src="/variant/${v.id}" class="variant-frame${i === 0 ? '' : ' hidden'}" sandbox="allow-scripts"></iframe>`,
      )
      .join('\n      ');

    const deviceButtons = DEVICE_PRESETS
      .map(
        (d) =>
          `<button class="device-btn" onclick="setDevice(${d.width}, ${d.height}, '${d.name}')" title="${d.name}">${d.name}</button>`,
      )
      .join('\n        ');

    const roundOptions = Array.from(this.roundHistory.keys())
      .map((r) => `<option value="${r}"${r === this.currentRound ? ' selected' : ''}>Round ${r}</option>`)
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NoPilot - ${pageSpec.name} Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a2e; color: #eee; }
    body.light-mode { background: #f5f5f5; color: #333; }
    .header { padding: 16px 24px; background: #16213e; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .light-mode .header { background: #e0e0e0; }
    .header h1 { font-size: 18px; font-weight: 600; }
    .toolbar { display: flex; gap: 8px; padding: 12px 24px; background: #0f3460; flex-wrap: wrap; align-items: center; }
    .light-mode .toolbar { background: #d0d0d0; }
    .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
    .tab { padding: 8px 16px; border: 1px solid #444; border-radius: 6px; background: transparent; color: #ccc; cursor: pointer; font-size: 14px; }
    .light-mode .tab { color: #333; border-color: #999; }
    .tab.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
    .device-bar { display: flex; gap: 4px; padding: 8px 24px; background: #0a1628; flex-wrap: wrap; }
    .light-mode .device-bar { background: #c0c0c0; }
    .device-btn { padding: 4px 10px; border: 1px solid #333; border-radius: 4px; background: transparent; color: #999; cursor: pointer; font-size: 11px; }
    .light-mode .device-btn { color: #555; border-color: #888; }
    .device-btn:hover, .device-btn.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
    .preview-area { padding: 24px; display: flex; justify-content: center; }
    .device-frame { border: 2px solid #333; border-radius: 16px; overflow: hidden; transition: width 0.2s, height 0.2s; }
    .variant-frame { width: 100%; height: calc(100vh - 220px); border: none; background: #fff; }
    .variant-frame.hidden { display: none; }
    .side-by-side { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
    .side-by-side .variant-frame { width: 48%; }
    .actions { padding: 16px 24px; background: #16213e; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .light-mode .actions { background: #e0e0e0; }
    .btn { padding: 10px 24px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500; }
    .btn-primary { background: #3b82f6; color: #fff; }
    .btn-secondary { background: #374151; color: #ccc; }
    .btn-danger { background: #ef4444; color: #fff; }
    .light-mode .btn-secondary { background: #bbb; color: #333; }
    .toggle-group { display: flex; gap: 4px; margin-left: auto; }
    .toggle-btn { padding: 6px 12px; border: 1px solid #444; border-radius: 4px; background: transparent; color: #ccc; cursor: pointer; font-size: 12px; }
    .toggle-btn.active { background: #3b82f6; color: #fff; }
    select { padding: 6px 10px; border-radius: 4px; background: #1a1a2e; color: #eee; border: 1px solid #444; font-size: 12px; }
    .light-mode select { background: #fff; color: #333; }
  </style>
</head>
<body>
  <div class="header">
    <h1>NoPilot UI Taste - ${pageSpec.name}</h1>
    <span style="color: #888; font-size: 13px;">${pageSpec.platform} / ${pageSpec.deviceType}</span>
    <div class="toggle-group">
      <button class="toggle-btn active" onclick="setTheme('dark')">Dark</button>
      <button class="toggle-btn" onclick="setTheme('light')">Light</button>
      <button class="toggle-btn" onclick="toggleSideBySide()">Side-by-Side</button>
      <select onchange="rollbackToRound(this.value)">${roundOptions}</select>
    </div>
  </div>
  <div class="toolbar">
    <div class="tabs">
      ${variantTabs}
    </div>
  </div>
  <div class="device-bar">
    ${deviceButtons}
  </div>
  <div class="preview-area" id="preview-area">
    <div class="device-frame" id="device-frame">
      ${variantFrames}
    </div>
  </div>
  <div class="actions">
    <button class="btn btn-primary" onclick="selectCurrent()">Select This Design</button>
    <button class="btn btn-secondary" onclick="requestIteration()">Iterate</button>
    <button class="btn btn-secondary" onclick="rollbackAction()">Rollback</button>
    <button class="btn btn-secondary" onclick="regeneratePair()">Regenerate Pair</button>
  </div>
  <script>
    let currentVariantId = '${this.currentVariants[0]?.id ?? ''}';
    let currentRound = ${this.currentRound};
    let sideBySide = false;

    function showVariant(id, btn) {
      if (!sideBySide) {
        document.querySelectorAll('.variant-frame').forEach(f => f.classList.add('hidden'));
      }
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById('frame-' + id).classList.remove('hidden');
      if (btn) btn.classList.add('active');
      currentVariantId = id;
    }

    function setDevice(w, h, name) {
      const frame = document.getElementById('device-frame');
      document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      if (w === 0 && h === 0) {
        frame.style.width = '100%';
        frame.style.height = 'calc(100vh - 220px)';
        frame.style.border = 'none';
      } else {
        frame.style.width = w + 'px';
        frame.style.height = h + 'px';
        frame.style.border = '2px solid #333';
      }
    }

    function setTheme(theme) {
      document.body.classList.toggle('light-mode', theme === 'light');
      document.querySelectorAll('.toggle-group .toggle-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
    }

    function toggleSideBySide() {
      sideBySide = !sideBySide;
      const area = document.getElementById('preview-area');
      area.classList.toggle('side-by-side', sideBySide);
      if (sideBySide) {
        document.querySelectorAll('.variant-frame').forEach(f => f.classList.remove('hidden'));
      } else {
        document.querySelectorAll('.variant-frame').forEach((f, i) => {
          f.classList.toggle('hidden', i !== 0);
        });
      }
    }

    function postSelect(payload) {
      return fetch('/api/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    function selectCurrent() {
      postSelect({
        variantId: currentVariantId,
        round: currentRound,
        feedback: null,
        action: 'select',
        hybridSelections: null,
        rollbackToRound: null,
        overrideDesignSystem: false,
      }).then(() => {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-size:24px;color:#10b981;">Selected! You can close this tab.</div>';
      });
    }

    function requestIteration() {
      const feedback = prompt('What would you like to change?');
      if (feedback === null) return;
      postSelect({
        variantId: currentVariantId,
        round: currentRound,
        feedback: feedback,
        action: 'iterate',
        hybridSelections: null,
        rollbackToRound: null,
        overrideDesignSystem: false,
      });
    }

    function rollbackAction() {
      const roundSelect = document.querySelector('select');
      const targetRound = parseInt(roundSelect.value, 10);
      postSelect({
        variantId: null,
        round: currentRound,
        feedback: null,
        action: 'rollback',
        hybridSelections: null,
        rollbackToRound: targetRound,
        overrideDesignSystem: false,
      });
    }

    function regeneratePair() {
      postSelect({
        variantId: currentVariantId,
        round: currentRound,
        feedback: null,
        action: 'regenerate_pair',
        hybridSelections: null,
        rollbackToRound: null,
        overrideDesignSystem: false,
      });
    }

    function rollbackToRound(round) {
      const r = parseInt(round, 10);
      fetch('/api/variants/' + r)
        .then(res => res.json())
        .then(data => {
          currentRound = r;
        });
    }
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  /**
   * Try to listen on the preferred port. If EADDRINUSE, fall back to port 0
   * (OS-assigned). Returns the actual port the server is listening on.
   */
  private listenWithFallback(server: http.Server, preferredPort: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Fall back to OS-assigned port
          server.removeListener('error', onError);
          server.listen(0, '0.0.0.0', () => {
            const addr = server.address();
            if (addr && typeof addr !== 'string') {
              resolve(addr.port);
            } else {
              reject(new Error('Failed to get server address'));
            }
          });
          server.on('error', reject);
        } else {
          reject(err);
        }
      };
      server.on('error', onError);
      server.listen(preferredPort, '0.0.0.0', () => {
        server.removeListener('error', onError);
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          resolve(addr.port);
        } else {
          resolve(preferredPort);
        }
      });
    });
  }

  /**
   * Find an available port starting from the given port.
   */
  private async findAvailablePort(startPort: number): Promise<number> {
    for (let port = startPort; port < startPort + 100; port++) {
      const available = await this.isPortAvailable(port);
      if (available) return port;
    }
    throw new Error(`No available port found in range ${startPort}-${startPort + 99}`);
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '0.0.0.0');
    });
  }
}
