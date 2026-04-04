/**
 * Tests for MOD-001: DesignProvider registry.
 * Covers: registration, availability detection with timeout, tier assignment,
 * getActiveOrThrow, ProviderUnavailableError.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type {
  DesignProvider,
  DesignVariant,
  DesignDNA,
  DesignSystemRef,
  GenerateScreenRequest,
  GenerateVariantsRequest,
} from '../types.js';
import { ProviderRegistry, ProviderUnavailableError } from '../design-provider.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockProvider(
  providerName: string,
  available: boolean = true,
  delay: number = 0,
): DesignProvider {
  return {
    name: () => providerName,
    isAvailable: () =>
      new Promise<boolean>((resolve) => {
        if (delay > 0) {
          setTimeout(() => resolve(available), delay);
        } else {
          resolve(available);
        }
      }),
    generateScreen: async (_r: GenerateScreenRequest): Promise<DesignVariant> => ({
      id: 'v1', screenId: 's1', htmlCode: '<html></html>', screenshotUrl: null,
      metadata: { title: 'test', prompt: '', creativeRange: 'REFINE', modelId: null, generatedAt: new Date().toISOString() },
      provider: providerName, deviceType: 'MOBILE',
    }),
    generateVariants: async (_r: GenerateVariantsRequest): Promise<DesignVariant[]> => [],
    extractDesignContext: async (_v: DesignVariant): Promise<DesignDNA> => ({
      colorPalette: {}, typography: { display: '', headline: '', body: '', label: '' },
      spacing: [], borderRadius: {}, shadows: [], animationLevel: 'none', designMd: '', rawProviderData: null,
    }),
    createDesignSystem: async (_d: DesignDNA): Promise<DesignSystemRef> => ({ id: 'ds1', provider: providerName, projectId: null }),
    applyDesignSystem: async () => {},
  };
}

function makeThrowingProvider(providerName: string): DesignProvider {
  return {
    ...makeMockProvider(providerName, false),
    isAvailable: () => Promise.reject(new Error('Connection refused')),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  // --- Registration ---

  it('registers a provider and sets it as active', () => {
    const p = makeMockProvider('alpha');
    registry.register(p);
    expect(registry.getActive()?.name()).toBe('alpha');
  });

  it('first registered provider becomes active by default', () => {
    registry.register(makeMockProvider('first'));
    registry.register(makeMockProvider('second'));
    expect(registry.getActive()?.name()).toBe('first');
  });

  it('getAll returns all registered providers', () => {
    registry.register(makeMockProvider('a'));
    registry.register(makeMockProvider('b'));
    registry.register(makeMockProvider('c'));
    expect(registry.getAll()).toHaveLength(3);
  });

  // --- getActive / getActiveOrThrow ---

  it('getActive returns null when no providers registered', () => {
    expect(registry.getActive()).toBeNull();
  });

  it('getActiveOrThrow throws ProviderUnavailableError when no active provider', () => {
    expect(() => registry.getActiveOrThrow()).toThrow(ProviderUnavailableError);
    expect(() => registry.getActiveOrThrow()).toThrow('PROVIDER_UNAVAILABLE');
  });

  it('getActiveOrThrow returns provider when one is registered', () => {
    registry.register(makeMockProvider('p1'));
    expect(registry.getActiveOrThrow().name()).toBe('p1');
  });

  // --- detectAndSelect: tier assignment ---

  it('assigns tier 1 when first provider is available', async () => {
    registry.register(makeMockProvider('first', true));
    registry.register(makeMockProvider('second', true));
    const result = await registry.detectAndSelect();
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(1);
    expect(result!.provider.name()).toBe('first');
  });

  it('assigns tier 2 when only second provider is available', async () => {
    registry.register(makeMockProvider('first', false));
    registry.register(makeMockProvider('second', true));
    const result = await registry.detectAndSelect();
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(2);
    expect(result!.provider.name()).toBe('second');
  });

  it('caps tier at 3 for providers registered at index 3+', async () => {
    registry.register(makeMockProvider('p1', false));
    registry.register(makeMockProvider('p2', false));
    registry.register(makeMockProvider('p3', false));
    registry.register(makeMockProvider('p4', true)); // index 3 → tier capped at 3
    const result = await registry.detectAndSelect();
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(3);
  });

  it('returns null when all providers unavailable', async () => {
    registry.register(makeMockProvider('a', false));
    registry.register(makeMockProvider('b', false));
    const result = await registry.detectAndSelect();
    expect(result).toBeNull();
    expect(registry.getActive()).toBeNull();
  });

  // --- detectAndSelect: error handling ---

  it('skips providers that throw during isAvailable', async () => {
    registry.register(makeThrowingProvider('broken'));
    registry.register(makeMockProvider('healthy', true));
    const result = await registry.detectAndSelect();
    expect(result).not.toBeNull();
    expect(result!.provider.name()).toBe('healthy');
    expect(result!.tier).toBe(2);
  });

  // --- detectAndSelect: timeout ---

  it('times out slow providers (> 5s) and skips to next', async () => {
    // Provider that takes 10 seconds (will timeout at 5s)
    const slowProvider = makeMockProvider('slow', true, 10000);
    registry.register(slowProvider);
    registry.register(makeMockProvider('fast', true));

    const result = await registry.detectAndSelect();
    expect(result).not.toBeNull();
    expect(result!.provider.name()).toBe('fast');
    expect(result!.tier).toBe(2);
  }, 10000);

  // --- detectAndSelect updates active ---

  it('updates active provider after detectAndSelect', async () => {
    registry.register(makeMockProvider('old', false));
    registry.register(makeMockProvider('new', true));
    expect(registry.getActive()?.name()).toBe('old'); // initially set to first registered

    await registry.detectAndSelect();
    expect(registry.getActive()?.name()).toBe('new');
  });
});

describe('ProviderUnavailableError', () => {
  it('has correct name and message', () => {
    const err = new ProviderUnavailableError();
    expect(err.name).toBe('ProviderUnavailableError');
    expect(err.message).toContain('PROVIDER_UNAVAILABLE');
  });

  it('accepts custom message', () => {
    const err = new ProviderUnavailableError('custom error');
    expect(err.message).toBe('custom error');
  });

  it('is an instance of Error', () => {
    const err = new ProviderUnavailableError();
    expect(err).toBeInstanceOf(Error);
  });
});
