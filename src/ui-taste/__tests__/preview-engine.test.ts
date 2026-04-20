/**
 * Tests for MOD-004: Preview engine.
 * Covers: server lifecycle, POST /api/select, GET /api/variants/:round,
 * timeout, SSH detection, device presets, updateVariants, state machine.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DesignVariant, PageSpec } from '../types.js';
import { PreviewEngine, DEVICE_PRESETS } from '../preview-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockVariant(id: string, html?: string): DesignVariant {
  return {
    id,
    screenId: `screen-${id}`,
    htmlCode: html ?? `<html><body><h1>Variant ${id}</h1></body></html>`,
    screenshotUrl: null,
    metadata: {
      title: `Variant ${id}`,
      prompt: 'test prompt',
      creativeRange: 'REFINE',
      modelId: null,
      generatedAt: new Date().toISOString(),
    },
    provider: 'mock',
    deviceType: 'MOBILE',
  };
}

const testPageSpec: PageSpec = {
  name: 'test-page',
  description: 'Test page for preview engine',
  platform: 'web',
  deviceType: 'DESKTOP',
  existingStyleConstraint: null,
};

// ---------------------------------------------------------------------------
// Device Presets
// ---------------------------------------------------------------------------

describe('DEVICE_PRESETS', () => {
  it('contains exactly 10 device presets', () => {
    expect(DEVICE_PRESETS).toHaveLength(10);
  });

  it('includes iPhone SE', () => {
    const iphoneSE = DEVICE_PRESETS.find((d) => d.name === 'iPhone SE');
    expect(iphoneSE).toBeDefined();
    expect(iphoneSE!.width).toBe(375);
    expect(iphoneSE!.height).toBe(667);
    expect(iphoneSE!.category).toBe('phone');
  });

  it('includes Full Screen with 0x0 dimensions', () => {
    const fullScreen = DEVICE_PRESETS.find((d) => d.name === 'Full Screen');
    expect(fullScreen).toBeDefined();
    expect(fullScreen!.width).toBe(0);
    expect(fullScreen!.height).toBe(0);
    expect(fullScreen!.hasBezel).toBe(false);
  });

  it('includes Desktop preset', () => {
    const desktop = DEVICE_PRESETS.find((d) => d.name === 'Desktop');
    expect(desktop).toBeDefined();
    expect(desktop!.width).toBe(1440);
    expect(desktop!.category).toBe('desktop');
  });

  it('has phones, tablets, desktop, and special categories', () => {
    const categories = new Set(DEVICE_PRESETS.map((d) => d.category));
    expect(categories).toContain('phone');
    expect(categories).toContain('tablet');
    expect(categories).toContain('desktop');
    expect(categories).toContain('special');
  });
});

// ---------------------------------------------------------------------------
// PreviewEngine lifecycle
// ---------------------------------------------------------------------------

describe('PreviewEngine', () => {
  let engine: PreviewEngine;

  beforeEach(() => {
    engine = new PreviewEngine();
  });

  afterEach(async () => {
    await engine.stop();
  });

  // --- State machine ---

  it('starts in idle state', () => {
    expect(engine.getState()).toBe('idle');
  });

  it('transitions to serving after start', async () => {
    const variants = [makeMockVariant('v1')];
    await engine.start(variants, testPageSpec);
    expect(engine.getState()).toBe('serving');
  });

  it('transitions to idle after stop', async () => {
    const variants = [makeMockVariant('v1')];
    await engine.start(variants, testPageSpec);
    await engine.stop();
    expect(engine.getState()).toBe('idle');
  });

  // --- Server lifecycle ---

  it('starts on an available port and stops cleanly', async () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2')];
    const session = await engine.start(variants, testPageSpec);

    expect(session.port).toBeGreaterThan(0);
    expect(session.url).toContain('http://127.0.0.1');
    expect(session.id).toBeTruthy();
    expect(session.currentRound).toBe(1);
    expect(session.timeoutMs).toBe(1800000);

    // Verify server responds
    const response = await fetch(session.url);
    expect(response.ok).toBe(true);
    const html = await response.text();
    expect(html).toContain('NoPilot UI Taste');
    expect(html).toContain('test-page');
  });

  it('serves variant HTML at /variant/:id', async () => {
    const variants = [makeMockVariant('v1', '<html><body>Custom HTML</body></html>')];
    const session = await engine.start(variants, testPageSpec);

    const response = await fetch(`${session.url}/variant/v1`);
    expect(response.ok).toBe(true);
    const html = await response.text();
    expect(html).toContain('Custom HTML');
  });

  it('returns 404 for unknown variant', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const response = await fetch(`${session.url}/variant/unknown`);
    expect(response.status).toBe(404);
  });

  it('returns 404 for unknown routes', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const response = await fetch(`${session.url}/nonexistent`);
    expect(response.status).toBe(404);
  });

  // --- POST /api/select ---

  it('resolves awaitSelection on POST /api/select with action=select', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const selectionPromise = engine.awaitSelection(session);

    const selectRes = await fetch(`${session.url}/api/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantId: 'v1',
        round: 1,
        feedback: null,
        action: 'select',
        hybridSelections: null,
        rollbackToRound: null,
        overrideDesignSystem: false,
      }),
    });
    expect(selectRes.ok).toBe(true);
    const body = await selectRes.json();
    expect(body.status).toBe('ok');

    const result = await selectionPromise;
    expect(result.action).toBe('select');
    expect(result.selectedVariantId).toBe('v1');
    expect(result.round).toBe(1);
    expect(result.feedback).toBeNull();
  });

  it('handles iterate action with feedback', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const selectionPromise = engine.awaitSelection(session);

    await fetch(`${session.url}/api/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantId: 'v1',
        round: 1,
        feedback: 'Make it more blue',
        action: 'iterate',
      }),
    });

    const result = await selectionPromise;
    expect(result.action).toBe('iterate');
    expect(result.feedback).toBe('Make it more blue');
  });

  it('handles rollback action', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const selectionPromise = engine.awaitSelection(session);

    await fetch(`${session.url}/api/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantId: null,
        round: 2,
        feedback: null,
        action: 'rollback',
        rollbackToRound: 1,
      }),
    });

    const result = await selectionPromise;
    expect(result.action).toBe('rollback');
    expect(result.rollbackToRound).toBe(1);
  });

  it('handles hybridSelections in POST body', async () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2')];
    const session = await engine.start(variants, testPageSpec);

    const selectionPromise = engine.awaitSelection(session);

    await fetch(`${session.url}/api/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantId: 'v1',
        round: 1,
        feedback: null,
        action: 'select',
        hybridSelections: [
          { variantId: 'v1', dimensions: ['colors', 'layout'] },
          { variantId: 'v2', dimensions: ['typography'] },
        ],
      }),
    });

    const result = await selectionPromise;
    expect(result.hybridSelections).toHaveLength(2);
    expect(result.hybridSelections![0].dimensions).toContain('colors');
  });

  it('includes overrideDesignSystem in selection result when sent in POST body', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const selectionPromise = engine.awaitSelection(session);

    await fetch(`${session.url}/api/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantId: 'v1',
        round: 1,
        feedback: null,
        action: 'select',
        hybridSelections: null,
        rollbackToRound: null,
        overrideDesignSystem: true,
      }),
    });

    const result = await selectionPromise;
    expect(result.action).toBe('select');
    expect(result.overrideDesignSystem).toBe(true);
  });

  it('handles regenerate_pair action in POST body', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const selectionPromise = engine.awaitSelection(session);

    await fetch(`${session.url}/api/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variantId: 'v1',
        round: 1,
        feedback: null,
        action: 'regenerate_pair',
        hybridSelections: null,
        rollbackToRound: null,
        overrideDesignSystem: false,
      }),
    });

    const result = await selectionPromise;
    expect(result.action).toBe('regenerate_pair');
    expect(result.selectedVariantId).toBe('v1');
  });

  it('returns 400 for invalid JSON in POST /api/select', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const response = await fetch(`${session.url}/api/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json{{{',
    });
    expect(response.status).toBe(400);
  });

  // --- GET /api/variants/:round ---

  it('serves variants list for current round', async () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2')];
    const session = await engine.start(variants, testPageSpec);

    const response = await fetch(`${session.url}/api/variants/1`);
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.variants).toHaveLength(2);
    expect(data.variants[0].id).toBe('v1');
    expect(data.variants[0].htmlPath).toBe('/variant/v1');
  });

  it('returns 404 for unknown round', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const response = await fetch(`${session.url}/api/variants/99`);
    expect(response.status).toBe(404);
  });

  // --- updateVariants ---

  it('hot-reloads variants for a new round', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const newVariants = [makeMockVariant('v3'), makeMockVariant('v4')];
    engine.updateVariants(session, newVariants, 2);

    expect(session.currentRound).toBe(2);

    // Round 2 should be available
    const r2 = await fetch(`${session.url}/api/variants/2`);
    expect(r2.ok).toBe(true);
    const data = await r2.json();
    expect(data.variants).toHaveLength(2);

    // Round 1 should still be in history
    const r1 = await fetch(`${session.url}/api/variants/1`);
    expect(r1.ok).toBe(true);

    // New variants should be served
    const variantRes = await fetch(`${session.url}/variant/v3`);
    expect(variantRes.ok).toBe(true);
  });

  // --- Timeout ---

  it('rejects awaitSelection after timeout', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec, { timeout: 100 });

    await expect(engine.awaitSelection(session)).rejects.toThrow('timed out');
  });

  // --- Selector page content ---

  it('selector page contains tabs for each variant', async () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2'), makeMockVariant('v3')];
    const session = await engine.start(variants, testPageSpec);

    const response = await fetch(session.url);
    const html = await response.text();
    expect(html).toContain('Variant v1');
    expect(html).toContain('Variant v2');
    expect(html).toContain('Variant v3');
  });

  it('selector page contains device simulation buttons', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const response = await fetch(session.url);
    const html = await response.text();
    expect(html).toContain('iPhone SE');
    expect(html).toContain('iPad Pro');
    expect(html).toContain('Desktop');
    expect(html).toContain('Full Screen');
  });

  it('selector page contains dark/light toggle', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const response = await fetch(session.url);
    const html = await response.text();
    expect(html).toContain('Dark');
    expect(html).toContain('Light');
    expect(html).toContain('setTheme');
  });

  it('selector page contains side-by-side button', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec);

    const response = await fetch(session.url);
    const html = await response.text();
    expect(html).toContain('Side-by-Side');
  });

  // --- stop is idempotent ---

  it('stop is safe to call multiple times', async () => {
    const variants = [makeMockVariant('v1')];
    await engine.start(variants, testPageSpec);
    await engine.stop();
    await engine.stop(); // should not throw
    expect(engine.getState()).toBe('idle');
  });

  // --- Custom timeout via options ---

  it('uses custom timeout from start options', async () => {
    const variants = [makeMockVariant('v1')];
    const session = await engine.start(variants, testPageSpec, { timeout: 5000 });
    expect(session.timeoutMs).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// SSH detection (openOrDisplay)
// ---------------------------------------------------------------------------

describe('PreviewEngine.openOrDisplay', () => {
  let engine: PreviewEngine;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    engine = new PreviewEngine();
    // Clear SSH env vars
    delete process.env.SSH_CLIENT;
    delete process.env.SSH_TTY;
    delete process.env.SSH_CONNECTION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns url_display when SSH_CLIENT is set', () => {
    process.env.SSH_CLIENT = '192.168.1.1 12345 22';
    const result = engine.openOrDisplay('http://localhost:8900');
    expect(result).toBe('url_display');
  });

  it('returns url_display when SSH_TTY is set', () => {
    process.env.SSH_TTY = '/dev/pts/0';
    const result = engine.openOrDisplay('http://localhost:8900');
    expect(result).toBe('url_display');
  });

  it('returns url_display when SSH_CONNECTION is set', () => {
    process.env.SSH_CONNECTION = '192.168.1.1 12345 192.168.1.2 22';
    const result = engine.openOrDisplay('http://localhost:8900');
    expect(result).toBe('url_display');
  });
});
