import type { ObservationEvent } from './trace-extractor.js';

export type SemanticEventType =
  | 'phase_entered'
  | 'independent_review_dispatched'
  | 'fresh_reverification';

export interface SemanticEvent {
  id: string;
  timestamp: string;
  type: SemanticEventType;
  observation_event_ids: string[];
  details: Record<string, string>;
}

export interface SemanticMappingResult {
  semantic_events: SemanticEvent[];
  warnings: string[];
}

function formatSemanticId(index: number): string {
  return `sem-${String(index).padStart(4, '0')}`;
}

function pushWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

export function deriveSemanticEvents(
  observationEvents: ObservationEvent[],
): SemanticMappingResult {
  const semanticEvents: SemanticEvent[] = [];
  const warnings: string[] = [];

  const phaseObservation = observationEvents.find(
    (event) => event.type === 'phase_signal' && event.observation_key === 'phase_candidate',
  );
  if (phaseObservation) {
    semanticEvents.push({
      id: formatSemanticId(semanticEvents.length + 1),
      timestamp: phaseObservation.timestamp,
      type: 'phase_entered',
      observation_event_ids: [phaseObservation.id],
      details: {
        phase: phaseObservation.observation_value,
      },
    });
  }

  const reviewObservation = observationEvents.find(
    (event) => event.type === 'review_signal' && event.observation_key === 'review_dispatch_candidate',
  );
  if (reviewObservation) {
    semanticEvents.push({
      id: formatSemanticId(semanticEvents.length + 1),
      timestamp: reviewObservation.timestamp,
      type: 'independent_review_dispatched',
      observation_event_ids: [reviewObservation.id],
      details: {
        reviewer: reviewObservation.observation_value,
      },
    });
  }

  if (!reviewObservation) {
    return { semantic_events: semanticEvents, warnings };
  }

  const reverifyObservation = observationEvents.find(
    (event) =>
      event.type === 'reverify_signal'
      && event.observation_key === 'reverify_candidate'
      && event.timestamp >= reviewObservation.timestamp,
  );
  const artifactObservation = observationEvents.find(
    (event) =>
      event.type === 'artifact_change'
      && event.timestamp >= reviewObservation.timestamp
      && (!reverifyObservation || event.timestamp >= reverifyObservation.timestamp),
  );

  if (!reverifyObservation || !artifactObservation) {
    pushWarning(warnings, 'trace_insufficient');
    return { semantic_events: semanticEvents, warnings };
  }

  semanticEvents.push({
    id: formatSemanticId(semanticEvents.length + 1),
    timestamp: reverifyObservation.timestamp,
    type: 'fresh_reverification',
    observation_event_ids: [
      reviewObservation.id,
      reverifyObservation.id,
      artifactObservation.id,
    ],
    details: {
      tool: reverifyObservation.observation_value,
    },
  });

  return { semantic_events: semanticEvents, warnings };
}
