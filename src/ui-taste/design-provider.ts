/**
 * MOD-001: DesignProvider registry.
 * Manages provider registration, availability detection, and active selection.
 */
import type { DesignProvider } from './types.js';

const AVAILABILITY_TIMEOUT_MS = 5000;

export interface DetectResult {
  provider: DesignProvider;
  tier: 1 | 2 | 3;
}

export class ProviderUnavailableError extends Error {
  constructor(message?: string) {
    super(message ?? 'PROVIDER_UNAVAILABLE: No design provider is available');
    this.name = 'ProviderUnavailableError';
  }
}

export class ProviderRegistry {
  private providers: DesignProvider[] = [];
  private active: DesignProvider | null = null;

  /** Register a provider. First registered = highest priority (Tier 1). */
  register(provider: DesignProvider): void {
    this.providers.push(provider);
    // Auto-set first registered as active if none set
    if (this.active === null) {
      this.active = provider;
    }
  }

  /** Return the currently active provider, or throw if none. */
  getActive(): DesignProvider | null {
    return this.active;
  }

  /** Return the currently active provider, or throw PROVIDER_UNAVAILABLE. */
  getActiveOrThrow(): DesignProvider {
    if (this.active === null) {
      throw new ProviderUnavailableError();
    }
    return this.active;
  }

  /** Return all registered providers. */
  getAll(): ReadonlyArray<DesignProvider> {
    return this.providers;
  }

  /**
   * Check each registered provider in order. Return the first available one.
   * Tier is assigned by registration order: 1-based index (capped at 3).
   * Each isAvailable() call has a 5-second timeout.
   * Returns null if no provider is available.
   */
  async detectAndSelect(): Promise<DetectResult | null> {
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      try {
        const available = await this.checkAvailabilityWithTimeout(provider);
        if (available) {
          this.active = provider;
          const tier = Math.min(i + 1, 3) as 1 | 2 | 3;
          return { provider, tier };
        }
      } catch {
        // Provider check failed or timed out, skip to next
      }
    }
    this.active = null;
    return null;
  }

  /**
   * Check availability with a timeout. Rejects if the check takes longer
   * than AVAILABILITY_TIMEOUT_MS (5 seconds).
   */
  private checkAvailabilityWithTimeout(provider: DesignProvider): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Provider "${provider.name()}" availability check timed out after ${AVAILABILITY_TIMEOUT_MS}ms`));
      }, AVAILABILITY_TIMEOUT_MS);

      provider.isAvailable().then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }
}
