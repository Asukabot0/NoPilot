import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SemanticEvent } from './semantic-mapper.js';
import type { ObservationEvent } from './trace-extractor.js';

export interface BenchmarkTraceLog {
  schema_version: '1.0.0';
  run_id: string;
  observation_events: ObservationEvent[];
  semantic_events: SemanticEvent[];
  warnings: string[];
}

export interface WriteEventLogInput {
  destination_path: string;
  run_id: string;
  observation_events: ObservationEvent[];
  semantic_events: SemanticEvent[];
  warnings: string[];
}

function dedupeWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}

export function writeEventLog(input: WriteEventLogInput): BenchmarkTraceLog {
  const observationIds = new Set(input.observation_events.map((event) => event.id));
  const warnings = [...input.warnings];
  const semanticEvents = input.semantic_events.filter((event) => {
    if (event.observation_event_ids.length === 0) {
      warnings.push('trace_insufficient');
      return false;
    }

    const hasOnlyKnownObservationIds = event.observation_event_ids.every((eventId) => observationIds.has(eventId));
    if (!hasOnlyKnownObservationIds) {
      warnings.push('trace_insufficient');
      return false;
    }

    return true;
  });

  const log: BenchmarkTraceLog = {
    schema_version: '1.0.0',
    run_id: input.run_id,
    observation_events: input.observation_events,
    semantic_events: semanticEvents,
    warnings: dedupeWarnings(warnings),
  };

  mkdirSync(path.dirname(input.destination_path), { recursive: true });
  writeFileSync(input.destination_path, `${JSON.stringify(log, null, 2)}\n`, 'utf-8');
  return log;
}
