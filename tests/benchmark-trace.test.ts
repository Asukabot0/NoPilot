import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import {
  extractObservationEvents,
  type BenchmarkArtifactChange,
  type BenchmarkTranscriptRecord,
} from '../src/benchmark/trace-extractor.js';
import { deriveSemanticEvents } from '../src/benchmark/semantic-mapper.js';
import { writeEventLog } from '../src/benchmark/event-log-writer.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const Ajv2020 = require('ajv/dist/2020');

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(dir);
  return dir;
}

function makeTranscript(): BenchmarkTranscriptRecord[] {
  return [
    {
      timestamp: '2026-04-09T10:00:00.000Z',
      role: 'assistant',
      event_type: 'message',
      content: 'Entering discover phase.',
    },
    {
      timestamp: '2026-04-09T10:01:00.000Z',
      role: 'assistant',
      event_type: 'tool_call',
      content: 'Dispatching independent critic review.',
      tool_name: 'critic',
    },
    {
      timestamp: '2026-04-09T10:02:00.000Z',
      role: 'assistant',
      event_type: 'tool_result',
      content: 'Re-ran npm test after applying fixes.',
      tool_name: 'npm test',
    },
  ];
}

function makeArtifacts(): BenchmarkArtifactChange[] {
  return [
    {
      timestamp: '2026-04-09T10:02:30.000Z',
      path: 'artifacts/verdict.json',
      change_type: 'modified',
    },
  ];
}

describe('extractObservationEvents', () => {
  it('extracts observation events from transcript records and artifact changes', () => {
    const observationEvents = extractObservationEvents({
      transcript: makeTranscript(),
      artifact_changes: makeArtifacts(),
    });

    expect(observationEvents).toHaveLength(4);
    expect(observationEvents).toEqual([
      expect.objectContaining({
        id: 'obs-0001',
        source: 'transcript',
        type: 'phase_signal',
        observation_key: 'phase_candidate',
        observation_value: 'discover',
      }),
      expect.objectContaining({
        id: 'obs-0002',
        source: 'transcript',
        type: 'review_signal',
        observation_key: 'review_dispatch_candidate',
        observation_value: 'critic',
      }),
      expect.objectContaining({
        id: 'obs-0003',
        source: 'transcript',
        type: 'reverify_signal',
        observation_key: 'reverify_candidate',
        observation_value: 'npm test',
      }),
      expect.objectContaining({
        id: 'obs-0004',
        source: 'artifact',
        type: 'artifact_change',
        observation_key: 'artifact_modified',
        observation_value: 'artifacts/verdict.json',
      }),
    ]);
  });
});

describe('deriveSemanticEvents', () => {
  it('derives phase entry, review dispatch, and fresh reverification from stable observation evidence', () => {
    const observationEvents = extractObservationEvents({
      transcript: makeTranscript(),
      artifact_changes: makeArtifacts(),
    });

    const result = deriveSemanticEvents(observationEvents);

    expect(result.warnings).toEqual([]);
    expect(result.semantic_events).toEqual([
      expect.objectContaining({
        type: 'phase_entered',
        observation_event_ids: ['obs-0001'],
        details: { phase: 'discover' },
      }),
      expect.objectContaining({
        type: 'independent_review_dispatched',
        observation_event_ids: ['obs-0002'],
        details: { reviewer: 'critic' },
      }),
      expect.objectContaining({
        type: 'fresh_reverification',
        observation_event_ids: ['obs-0002', 'obs-0003', 'obs-0004'],
        details: { tool: 'npm test' },
      }),
    ]);
  });

  it('emits trace_insufficient instead of guessing fresh reverification on ambiguous evidence', () => {
    const result = deriveSemanticEvents([
      {
        id: 'obs-0001',
        timestamp: '2026-04-09T10:00:00.000Z',
        source: 'transcript',
        type: 'phase_signal',
        observation_key: 'phase_candidate',
        observation_value: 'discover',
        evidence: {
          content: 'Entering discover phase.',
          transcript_index: 0,
        },
      },
      {
        id: 'obs-0002',
        timestamp: '2026-04-09T10:01:00.000Z',
        source: 'transcript',
        type: 'review_signal',
        observation_key: 'review_dispatch_candidate',
        observation_value: 'critic',
        evidence: {
          content: 'Dispatching independent critic review.',
          transcript_index: 1,
        },
      },
    ]);

    expect(result.semantic_events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'phase_entered',
          observation_event_ids: ['obs-0001'],
        }),
        expect.objectContaining({
          type: 'independent_review_dispatched',
          observation_event_ids: ['obs-0002'],
        }),
      ]),
    );
    expect(result.warnings).toEqual(['trace_insufficient']);
  });

  it('emits trace_insufficient when artifact changes happen before the reverify signal', () => {
    const result = deriveSemanticEvents([
      {
        id: 'obs-0001',
        timestamp: '2026-04-09T10:00:00.000Z',
        source: 'transcript',
        type: 'phase_signal',
        observation_key: 'phase_candidate',
        observation_value: 'discover',
        evidence: {
          content: 'Entering discover phase.',
          transcript_index: 0,
        },
      },
      {
        id: 'obs-0002',
        timestamp: '2026-04-09T10:01:00.000Z',
        source: 'transcript',
        type: 'review_signal',
        observation_key: 'review_dispatch_candidate',
        observation_value: 'critic',
        evidence: {
          content: 'Dispatching independent critic review.',
          transcript_index: 1,
        },
      },
      {
        id: 'obs-0003',
        timestamp: '2026-04-09T10:01:30.000Z',
        source: 'artifact',
        type: 'artifact_change',
        observation_key: 'artifact_modified',
        observation_value: 'artifacts/verdict.json',
        evidence: {
          path: 'artifacts/verdict.json',
        },
      },
      {
        id: 'obs-0004',
        timestamp: '2026-04-09T10:02:00.000Z',
        source: 'transcript',
        type: 'reverify_signal',
        observation_key: 'reverify_candidate',
        observation_value: 'npm test',
        evidence: {
          content: 'Re-ran npm test after applying fixes.',
          transcript_index: 2,
        },
      },
    ]);

    expect(result.semantic_events.some((event) => event.type === 'fresh_reverification')).toBe(false);
    expect(result.warnings).toEqual(['trace_insufficient']);
  });
});

describe('writeEventLog', () => {
  it('writes a schema-valid event log and marks trace_insufficient when semantic evidence lacks observation ids', () => {
    const outputDir = makeTempDir('benchmark-trace-');
    const destinationPath = join(outputDir, 'event-log.json');
    const observationEvents = extractObservationEvents({
      transcript: makeTranscript(),
      artifact_changes: makeArtifacts(),
    });

    const log = writeEventLog({
      destination_path: destinationPath,
      run_id: 'RUN-005',
      observation_events: observationEvents,
      semantic_events: [
        {
          id: 'sem-0001',
          timestamp: '2026-04-09T10:00:00.000Z',
          type: 'phase_entered',
          observation_event_ids: ['obs-0001'],
          details: { phase: 'discover' },
        },
        {
          id: 'sem-0002',
          timestamp: '2026-04-09T10:05:00.000Z',
          type: 'fresh_reverification',
          observation_event_ids: [],
          details: { tool: 'npm test' },
        },
      ],
      warnings: [],
    });

    expect(log.warnings).toEqual(['trace_insufficient']);
    expect(log.semantic_events).toEqual([
      expect.objectContaining({
        id: 'sem-0001',
        type: 'phase_entered',
      }),
    ]);

    const persisted = JSON.parse(readFileSync(destinationPath, 'utf-8')) as unknown;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const schema = JSON.parse(readFileSync('schemas/benchmark-trace.schema.json', 'utf-8'));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const validate = ajv.compile(schema);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    expect(validate(persisted)).toBe(true);
  });
});
