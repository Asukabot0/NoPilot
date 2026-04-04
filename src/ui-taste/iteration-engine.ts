/**
 * MOD-005: IterationEngine — design iteration lifecycle manager.
 * Manages text feedback refinement, hybrid DNA synthesis,
 * iteration history, and round rollback.
 */
import type {
  DesignProvider,
  DesignVariant,
  DesignDNA,
  PageSpec,
  SelectionResult,
  HybridSelection,
} from './types.js';

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

export interface IterationOutcome {
  type: 'selected' | 'new_round' | 'rollback';
  selectedVariant: DesignVariant | null;
  newVariants: DesignVariant[] | null;
  round: number;
}

export interface FeedbackEntry {
  round: number;
  feedback: string;
}

export interface IterationHistory {
  rounds: Map<number, DesignVariant[]>;
  feedbackLog: FeedbackEntry[];
  currentRound: number;
}

// ---------------------------------------------------------------------------
// IterationEngine
// ---------------------------------------------------------------------------

export class IterationEngine {
  private history: IterationHistory = {
    rounds: new Map(),
    feedbackLog: [],
    currentRound: 1,
  };

  /**
   * Store initial variants as round 1.
   */
  setInitialVariants(variants: DesignVariant[]): void {
    this.history.rounds.set(1, variants);
    this.history.currentRound = 1;
  }

  /**
   * Route to handleSelect/handleIterate/handleRollback based on action.
   */
  async processSelection(
    result: SelectionResult,
    provider: DesignProvider,
    pageSpec: PageSpec,
    currentVariants: DesignVariant[],
  ): Promise<IterationOutcome> {
    switch (result.action) {
      case 'select':
        return this.handleSelect(result, currentVariants);
      case 'iterate':
        return this.handleIterate(
          result.feedback,
          result.hybridSelections,
          provider,
          pageSpec,
          currentVariants,
        );
      case 'rollback':
        return this.handleRollback(result.rollbackToRound ?? 1);
      default:
        throw new Error(`Unknown action: ${result.action}`);
    }
  }

  /**
   * Handle variant selection — return the chosen variant.
   */
  private handleSelect(
    result: SelectionResult,
    currentVariants: DesignVariant[],
  ): IterationOutcome {
    const selected = currentVariants.find(
      (v) => v.id === result.selectedVariantId,
    );
    return {
      type: 'selected',
      selectedVariant: selected ?? null,
      newVariants: null,
      round: this.history.currentRound,
    };
  }

  /**
   * Handle iteration:
   * 1. If hybridSelections → extract DNA from each, synthesize composite
   * 2. If text feedback → append as constraint
   * 3. Call generateVariants with synthesized constraint
   * 4. Store new round in history
   */
  async handleIterate(
    feedback: string | null,
    hybridSelections: HybridSelection[] | null,
    provider: DesignProvider,
    pageSpec: PageSpec,
    currentVariants: DesignVariant[],
  ): Promise<IterationOutcome> {
    let designConstraint = '';

    // Process hybrid selections
    if (hybridSelections && hybridSelections.length > 0) {
      const dnaEntries: Array<{ dna: DesignDNA; dimensions: string[] }> = [];
      for (const sel of hybridSelections) {
        const variant = currentVariants.find((v) => v.id === sel.variantId);
        if (variant) {
          const dna = await provider.extractDesignContext(variant);
          dnaEntries.push({ dna, dimensions: sel.dimensions });
        }
      }
      if (dnaEntries.length > 0) {
        designConstraint = this.synthesizeDNA(dnaEntries);
      }
    }

    // Append text feedback as constraint
    if (feedback) {
      this.history.feedbackLog.push({
        round: this.history.currentRound,
        feedback,
      });

      const feedbackConstraint = `\n\n## User Feedback (Round ${this.history.currentRound})\n${feedback}`;
      designConstraint += feedbackConstraint;
    }

    // Accumulate previous feedback for context
    const previousFeedback = this.history.feedbackLog
      .filter((e) => e.round < this.history.currentRound)
      .map((e) => `Round ${e.round}: ${e.feedback}`)
      .join('\n');
    if (previousFeedback) {
      designConstraint += `\n\n## Previous Feedback\n${previousFeedback}`;
    }

    // Find a base variant for generation
    const baseVariant =
      currentVariants[0] ??
      this.history.rounds.get(this.history.currentRound)?.[0];

    if (!baseVariant) {
      throw new Error('GENERATION_FAILED: No base variant available for iteration');
    }

    // Generate new variants
    const newVariants = await provider.generateVariants({
      baseVariant,
      count: 5,
      creativeRange: 'REFINE',
      prompt: `Iterate on ${pageSpec.name}: ${pageSpec.description}`,
      designConstraint: designConstraint || null,
    });

    // Store new round
    this.history.currentRound++;
    this.history.rounds.set(this.history.currentRound, newVariants);

    return {
      type: 'new_round',
      selectedVariant: null,
      newVariants,
      round: this.history.currentRound,
    };
  }

  /**
   * Handle rollback — retrieve variants from history for target round.
   */
  handleRollback(targetRound: number): IterationOutcome {
    const variants = this.history.rounds.get(targetRound);
    if (!variants) {
      throw new Error(`No variants found for round ${targetRound}`);
    }

    this.history.currentRound = targetRound;

    return {
      type: 'rollback',
      selectedVariant: null,
      newVariants: variants,
      round: targetRound,
    };
  }

  /**
   * Merge specified dimensions from multiple DNAs into a composite designMd string.
   */
  synthesizeDNA(
    selections: Array<{ dna: DesignDNA; dimensions: string[] }>,
  ): string {
    const sections: string[] = ['# Hybrid Design System'];

    for (const { dna, dimensions } of selections) {
      for (const dim of dimensions) {
        switch (dim) {
          case 'color':
          case 'colors':
            sections.push(
              `\n## Colors\n${Object.entries(dna.colorPalette)
                .map(([k, v]) => `- ${k}: ${v}`)
                .join('\n')}`,
            );
            break;
          case 'typography':
          case 'fonts':
            sections.push(
              `\n## Typography\n- Display: ${dna.typography.display}\n- Headline: ${dna.typography.headline}\n- Body: ${dna.typography.body}\n- Label: ${dna.typography.label}`,
            );
            break;
          case 'spacing':
            sections.push(
              `\n## Spacing\n- Scale: ${dna.spacing.join(', ')}`,
            );
            break;
          case 'layout':
            sections.push(
              `\n## Layout\nPreserve layout structure from source variant.`,
            );
            break;
          case 'animation':
            sections.push(
              `\n## Animation\n- Level: ${dna.animationLevel}`,
            );
            break;
          case 'shadows':
            sections.push(
              `\n## Shadows\n${dna.shadows.map((s) => `- ${s}`).join('\n')}`,
            );
            break;
          case 'borderRadius':
            sections.push(
              `\n## Border Radius\n${Object.entries(dna.borderRadius)
                .map(([k, v]) => `- ${k}: ${v}`)
                .join('\n')}`,
            );
            break;
          default:
            // Include raw designMd section for unknown dimensions
            if (dna.designMd) {
              sections.push(`\n## ${dim}\nSee source designMd.`);
            }
        }
      }
    }

    return sections.join('\n');
  }

  /**
   * Return the full iteration history.
   */
  getHistory(): IterationHistory {
    return {
      rounds: this.history.rounds,
      feedbackLog: [...this.history.feedbackLog],
      currentRound: this.history.currentRound,
    };
  }
}
