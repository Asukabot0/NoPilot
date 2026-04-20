export interface BenchmarkTranscriptRecord {
  timestamp: string;
  role: string;
  event_type: string;
  content: string;
  tool_name?: string;
  [key: string]: unknown;
}

export interface BenchmarkArtifactChange {
  timestamp: string;
  path: string;
  change_type: 'added' | 'modified' | 'deleted';
  [key: string]: unknown;
}

export type ObservationSource = 'transcript' | 'artifact';

export type ObservationType =
  | 'phase_signal'
  | 'review_signal'
  | 'reverify_signal'
  | 'artifact_change';

export interface ObservationEvent {
  id: string;
  timestamp: string;
  source: ObservationSource;
  type: ObservationType;
  observation_key: string;
  observation_value: string;
  evidence: {
    content?: string;
    transcript_index?: number;
    tool_name?: string;
    artifact_path?: string;
    change_type?: BenchmarkArtifactChange['change_type'];
  };
}

export interface ExtractObservationEventsInput {
  transcript?: BenchmarkTranscriptRecord[];
  artifact_changes?: BenchmarkArtifactChange[];
}

function formatObservationId(index: number): string {
  return `obs-${String(index).padStart(4, '0')}`;
}

function parsePhaseCandidate(content: string): string | null {
  const phaseMatch = content.match(/\b(?:entering|entered|starting|start)\s+([a-z0-9_-]+)\s+phase\b/i);
  if (phaseMatch) {
    return phaseMatch[1].toLowerCase();
  }

  return null;
}

function parseReviewDispatchCandidate(
  content: string,
  toolName: string | undefined,
): string | null {
  const normalizedContent = content.toLowerCase();
  if (!normalizedContent.includes('independent')) {
    return null;
  }

  if (!/\b(dispatch|dispatching|sent|launched)\b/.test(normalizedContent)) {
    return null;
  }

  if (toolName && toolName.trim().length > 0) {
    return toolName.trim();
  }

  if (normalizedContent.includes('critic')) {
    return 'critic';
  }

  if (normalizedContent.includes('review')) {
    return 'review';
  }

  return null;
}

function parseReverifyCandidate(
  content: string,
  toolName: string | undefined,
): string | null {
  const normalizedContent = content.toLowerCase();
  const mentionsReverify =
    normalizedContent.includes('re-ran')
    || normalizedContent.includes('reran')
    || normalizedContent.includes('reverify')
    || normalizedContent.includes('reverification');

  if (!mentionsReverify) {
    return null;
  }

  if (toolName && toolName.trim().length > 0) {
    return toolName.trim();
  }

  const inlineToolMatch = content.match(/\b(npm test|npm run \S+|pnpm test|yarn test)\b/i);
  if (inlineToolMatch) {
    return inlineToolMatch[1];
  }

  return 'unknown';
}

export function extractObservationEvents(
  input: ExtractObservationEventsInput,
): ObservationEvent[] {
  const observationEvents: ObservationEvent[] = [];

  for (const [index, record] of (input.transcript ?? []).entries()) {
    const phaseCandidate = parsePhaseCandidate(record.content);
    if (phaseCandidate) {
      observationEvents.push({
        id: formatObservationId(observationEvents.length + 1),
        timestamp: record.timestamp,
        source: 'transcript',
        type: 'phase_signal',
        observation_key: 'phase_candidate',
        observation_value: phaseCandidate,
        evidence: {
          content: record.content,
          transcript_index: index,
          tool_name: record.tool_name,
        },
      });
    }

    const reviewCandidate = parseReviewDispatchCandidate(record.content, record.tool_name);
    if (reviewCandidate) {
      observationEvents.push({
        id: formatObservationId(observationEvents.length + 1),
        timestamp: record.timestamp,
        source: 'transcript',
        type: 'review_signal',
        observation_key: 'review_dispatch_candidate',
        observation_value: reviewCandidate,
        evidence: {
          content: record.content,
          transcript_index: index,
          tool_name: record.tool_name,
        },
      });
    }

    const reverifyCandidate = parseReverifyCandidate(record.content, record.tool_name);
    if (reverifyCandidate) {
      observationEvents.push({
        id: formatObservationId(observationEvents.length + 1),
        timestamp: record.timestamp,
        source: 'transcript',
        type: 'reverify_signal',
        observation_key: 'reverify_candidate',
        observation_value: reverifyCandidate,
        evidence: {
          content: record.content,
          transcript_index: index,
          tool_name: record.tool_name,
        },
      });
    }
  }

  for (const artifactChange of input.artifact_changes ?? []) {
    observationEvents.push({
      id: formatObservationId(observationEvents.length + 1),
      timestamp: artifactChange.timestamp,
      source: 'artifact',
      type: 'artifact_change',
      observation_key: `artifact_${artifactChange.change_type}`,
      observation_value: artifactChange.path,
      evidence: {
        artifact_path: artifactChange.path,
        change_type: artifactChange.change_type,
      },
    });
  }

  return observationEvents;
}
