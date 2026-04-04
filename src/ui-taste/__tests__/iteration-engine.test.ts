/**
 * Tests for MOD-005: IterationEngine.
 * Covers: text feedback, hybrid DNA synthesis, rollback, history management,
 * round counting, processSelection routing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type {
  DesignProvider,
  DesignVariant,
  DesignDNA,
  DesignSystemRef,
  PageSpec,
  SelectionResult,
  GenerateScreenRequest,
  GenerateVariantsRequest,
} from '../types.js';
import { IterationEngine } from '../iteration-engine.js';

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

function makePageSpec(): PageSpec {
  return {
    name: 'home',
    description: 'Home page',
    platform: 'ios',
    deviceType: 'MOBILE',
    existingStyleConstraint: null,
  };
}

function makeMockDNA(overrides?: Partial<DesignDNA>): DesignDNA {
  return {
    colorPalette: { primary: '#3b82f6', secondary: '#10b981' },
    typography: { display: '48px', headline: '32px', body: '16px', label: '12px' },
    spacing: [4, 8, 16, 24, 32],
    borderRadius: { sm: '4px', md: '8px', lg: '16px' },
    shadows: ['0 1px 3px rgba(0,0,0,0.1)'],
    animationLevel: 'subtle',
    designMd: '# Mock Design System',
    rawProviderData: null,
    ...overrides,
  };
}

let generateVariantsCallCount = 0;

function makeMockProvider(): DesignProvider {
  generateVariantsCallCount = 0;
  return {
    name: () => 'mock',
    isAvailable: async () => true,
    generateScreen: async (_r: GenerateScreenRequest): Promise<DesignVariant> =>
      makeMockVariant('gen-1'),
    generateVariants: async (r: GenerateVariantsRequest): Promise<DesignVariant[]> => {
      generateVariantsCallCount++;
      return Array.from({ length: r.count }, (_, i) =>
        makeMockVariant(`new-${generateVariantsCallCount}-${i}`),
      );
    },
    extractDesignContext: async (_v: DesignVariant): Promise<DesignDNA> =>
      makeMockDNA(),
    createDesignSystem: async (_d: DesignDNA): Promise<DesignSystemRef> =>
      ({ id: 'ds-1', provider: 'mock', projectId: null }),
    applyDesignSystem: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IterationEngine', () => {
  let engine: IterationEngine;
  let provider: DesignProvider;
  const pageSpec = makePageSpec();

  beforeEach(() => {
    engine = new IterationEngine();
    provider = makeMockProvider();
  });

  // --- Initial state ---

  it('starts with empty history', () => {
    const history = engine.getHistory();
    expect(history.currentRound).toBe(1);
    expect(history.rounds.size).toBe(0);
    expect(history.feedbackLog.length).toBe(0);
  });

  it('setInitialVariants stores round 1', () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2')];
    engine.setInitialVariants(variants);

    const history = engine.getHistory();
    expect(history.rounds.size).toBe(1);
    expect(history.rounds.get(1)).toHaveLength(2);
    expect(history.currentRound).toBe(1);
  });

  // --- processSelection routing: select ---

  it('processSelection routes select action correctly', async () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2')];
    engine.setInitialVariants(variants);

    const result: SelectionResult = {
      action: 'select',
      selectedVariantId: 'v1',
      feedback: null,
      hybridSelections: null,
      rollbackToRound: null,
      round: 1,
    };

    const outcome = await engine.processSelection(result, provider, pageSpec, variants);
    expect(outcome.type).toBe('selected');
    expect(outcome.selectedVariant?.id).toBe('v1');
    expect(outcome.newVariants).toBeNull();
  });

  it('select returns null selectedVariant for unknown id', async () => {
    const variants = [makeMockVariant('v1')];
    engine.setInitialVariants(variants);

    const result: SelectionResult = {
      action: 'select',
      selectedVariantId: 'nonexistent',
      feedback: null,
      hybridSelections: null,
      rollbackToRound: null,
      round: 1,
    };

    const outcome = await engine.processSelection(result, provider, pageSpec, variants);
    expect(outcome.type).toBe('selected');
    expect(outcome.selectedVariant).toBeNull();
  });

  // --- processSelection routing: iterate with text feedback ---

  it('handleIterate with text feedback generates new round', async () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2')];
    engine.setInitialVariants(variants);

    const result: SelectionResult = {
      action: 'iterate',
      selectedVariantId: null,
      feedback: 'Make the colors warmer',
      hybridSelections: null,
      rollbackToRound: null,
      round: 1,
    };

    const outcome = await engine.processSelection(result, provider, pageSpec, variants);
    expect(outcome.type).toBe('new_round');
    expect(outcome.round).toBe(2);
    expect(outcome.newVariants).not.toBeNull();
    expect(outcome.newVariants!.length).toBe(5);
  });

  it('text feedback is stored in feedbackLog', async () => {
    const variants = [makeMockVariant('v1')];
    engine.setInitialVariants(variants);

    const result: SelectionResult = {
      action: 'iterate',
      selectedVariantId: null,
      feedback: 'More contrast please',
      hybridSelections: null,
      rollbackToRound: null,
      round: 1,
    };

    await engine.processSelection(result, provider, pageSpec, variants);
    const history = engine.getHistory();
    expect(history.feedbackLog.length).toBe(1);
    expect(history.feedbackLog[0].feedback).toBe('More contrast please');
    expect(history.feedbackLog[0].round).toBe(1);
  });

  it('multiple iterations increment round counter', async () => {
    const variants = [makeMockVariant('v1')];
    engine.setInitialVariants(variants);

    // Round 1 → 2
    const result1: SelectionResult = {
      action: 'iterate',
      selectedVariantId: null,
      feedback: 'Iteration 1',
      hybridSelections: null,
      rollbackToRound: null,
      round: 1,
    };
    const outcome1 = await engine.processSelection(result1, provider, pageSpec, variants);
    expect(outcome1.round).toBe(2);

    // Round 2 → 3
    const result2: SelectionResult = {
      action: 'iterate',
      selectedVariantId: null,
      feedback: 'Iteration 2',
      hybridSelections: null,
      rollbackToRound: null,
      round: 2,
    };
    const outcome2 = await engine.processSelection(result2, provider, pageSpec, outcome1.newVariants!);
    expect(outcome2.round).toBe(3);

    const history = engine.getHistory();
    expect(history.currentRound).toBe(3);
    expect(history.rounds.size).toBe(3); // round 1 (initial) + round 2 + round 3
  });

  // --- processSelection routing: iterate with hybrid selections ---

  it('handleIterate with hybrid selections synthesizes DNA', async () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2')];
    engine.setInitialVariants(variants);

    const result: SelectionResult = {
      action: 'iterate',
      selectedVariantId: null,
      feedback: null,
      hybridSelections: [
        { variantId: 'v1', dimensions: ['color'] },
        { variantId: 'v2', dimensions: ['typography'] },
      ],
      rollbackToRound: null,
      round: 1,
    };

    const outcome = await engine.processSelection(result, provider, pageSpec, variants);
    expect(outcome.type).toBe('new_round');
    expect(outcome.round).toBe(2);
    expect(outcome.newVariants!.length).toBe(5);
  });

  it('handleIterate with both feedback and hybrid selections', async () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2')];
    engine.setInitialVariants(variants);

    const result: SelectionResult = {
      action: 'iterate',
      selectedVariantId: null,
      feedback: 'Also add more spacing',
      hybridSelections: [
        { variantId: 'v1', dimensions: ['color', 'shadows'] },
      ],
      rollbackToRound: null,
      round: 1,
    };

    const outcome = await engine.processSelection(result, provider, pageSpec, variants);
    expect(outcome.type).toBe('new_round');
    expect(outcome.newVariants!.length).toBe(5);

    // Feedback should be logged
    const history = engine.getHistory();
    expect(history.feedbackLog.length).toBe(1);
    expect(history.feedbackLog[0].feedback).toBe('Also add more spacing');
  });

  // --- processSelection routing: rollback ---

  it('handleRollback retrieves variants from target round', async () => {
    const variants = [makeMockVariant('v1'), makeMockVariant('v2')];
    engine.setInitialVariants(variants);

    // Create round 2
    const iterResult: SelectionResult = {
      action: 'iterate',
      selectedVariantId: null,
      feedback: 'Change something',
      hybridSelections: null,
      rollbackToRound: null,
      round: 1,
    };
    await engine.processSelection(iterResult, provider, pageSpec, variants);

    // Rollback to round 1
    const rollbackResult: SelectionResult = {
      action: 'rollback',
      selectedVariantId: null,
      feedback: null,
      hybridSelections: null,
      rollbackToRound: 1,
      round: 2,
    };
    const outcome = await engine.processSelection(rollbackResult, provider, pageSpec, []);
    expect(outcome.type).toBe('rollback');
    expect(outcome.round).toBe(1);
    expect(outcome.newVariants).toHaveLength(2);
    expect(outcome.newVariants![0].id).toBe('v1');
  });

  it('handleRollback throws for nonexistent round', () => {
    engine.setInitialVariants([makeMockVariant('v1')]);

    expect(() => engine.handleRollback(99)).toThrow('No variants found for round 99');
  });

  it('rollback updates currentRound', async () => {
    const variants = [makeMockVariant('v1')];
    engine.setInitialVariants(variants);

    // Iterate to round 2
    await engine.processSelection(
      {
        action: 'iterate',
        selectedVariantId: null,
        feedback: 'test',
        hybridSelections: null,
        rollbackToRound: null,
        round: 1,
      },
      provider,
      pageSpec,
      variants,
    );

    expect(engine.getHistory().currentRound).toBe(2);

    // Rollback to 1
    engine.handleRollback(1);
    expect(engine.getHistory().currentRound).toBe(1);
  });

  // --- synthesizeDNA ---

  it('synthesizeDNA merges color dimension', () => {
    const dna = makeMockDNA({ colorPalette: { primary: '#ff0000', bg: '#fff' } });
    const result = engine.synthesizeDNA([{ dna, dimensions: ['color'] }]);
    expect(result).toContain('# Hybrid Design System');
    expect(result).toContain('## Colors');
    expect(result).toContain('#ff0000');
    expect(result).toContain('#fff');
  });

  it('synthesizeDNA merges typography dimension', () => {
    const dna = makeMockDNA();
    const result = engine.synthesizeDNA([{ dna, dimensions: ['typography'] }]);
    expect(result).toContain('## Typography');
    expect(result).toContain('48px');
    expect(result).toContain('16px');
  });

  it('synthesizeDNA merges spacing dimension', () => {
    const dna = makeMockDNA({ spacing: [4, 8, 16] });
    const result = engine.synthesizeDNA([{ dna, dimensions: ['spacing'] }]);
    expect(result).toContain('## Spacing');
    expect(result).toContain('4, 8, 16');
  });

  it('synthesizeDNA merges multiple dimensions from multiple DNAs', () => {
    const dna1 = makeMockDNA({ colorPalette: { primary: '#red' } });
    const dna2 = makeMockDNA({ spacing: [2, 4, 8] });

    const result = engine.synthesizeDNA([
      { dna: dna1, dimensions: ['color'] },
      { dna: dna2, dimensions: ['spacing', 'animation'] },
    ]);

    expect(result).toContain('## Colors');
    expect(result).toContain('## Spacing');
    expect(result).toContain('## Animation');
  });

  it('synthesizeDNA handles shadows and borderRadius dimensions', () => {
    const dna = makeMockDNA({
      shadows: ['0 2px 4px black'],
      borderRadius: { sm: '4px', lg: '16px' },
    });
    const result = engine.synthesizeDNA([
      { dna, dimensions: ['shadows', 'borderRadius'] },
    ]);
    expect(result).toContain('## Shadows');
    expect(result).toContain('0 2px 4px black');
    expect(result).toContain('## Border Radius');
    expect(result).toContain('16px');
  });

  it('synthesizeDNA handles layout dimension', () => {
    const dna = makeMockDNA();
    const result = engine.synthesizeDNA([{ dna, dimensions: ['layout'] }]);
    expect(result).toContain('## Layout');
  });

  // --- History management ---

  it('getHistory returns a copy of feedbackLog', () => {
    const history1 = engine.getHistory();
    history1.feedbackLog.push({ round: 99, feedback: 'mutated' });

    const history2 = engine.getHistory();
    expect(history2.feedbackLog.length).toBe(0);
  });

  it('history preserves all rounds after multiple iterations', async () => {
    const variants = [makeMockVariant('v1')];
    engine.setInitialVariants(variants);

    for (let i = 0; i < 3; i++) {
      const currentVariants = engine.getHistory().rounds.get(engine.getHistory().currentRound) ?? variants;
      await engine.processSelection(
        {
          action: 'iterate',
          selectedVariantId: null,
          feedback: `Iteration ${i + 1}`,
          hybridSelections: null,
          rollbackToRound: null,
          round: engine.getHistory().currentRound,
        },
        provider,
        pageSpec,
        currentVariants,
      );
    }

    const history = engine.getHistory();
    expect(history.rounds.size).toBe(4); // initial + 3 iterations
    expect(history.feedbackLog.length).toBe(3);
    expect(history.currentRound).toBe(4);
  });
});
