export const FAILURE_TAG_PRECEDENCE = [
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
] as const;

export type FailureTag = (typeof FAILURE_TAG_PRECEDENCE)[number];

export interface FailureTagDefinition {
  key: string;
}

export const FAILURE_TAG_DEFINITIONS: Record<FailureTag, FailureTagDefinition> = {
  F1: { key: 'wrong_skill_or_command_route' },
  F2: { key: 'skipped_required_stage' },
  F3: { key: 'generation_review_not_separated' },
  F4: { key: 'missing_fresh_reverify' },
  F5: { key: 'stage_leakage' },
  F6: { key: 'missing_prerequisite_input_check' },
  F7: { key: 'explicit_user_intent_not_honored' },
  F8: { key: 'parallel_isolation_missing' },
  F9: { key: 'subagent_completion_not_verified' },
  F10: { key: 'trace_insufficient' },
  F11: { key: 'artifact_contract_mismatch' },
};

export const CORE_PROCESS_FAILURE_TAGS: FailureTag[] = ['F1', 'F2', 'F3', 'F4'];

const FAILURE_TAG_SET = new Set<FailureTag>(FAILURE_TAG_PRECEDENCE);
const PRECEDENCE_INDEX = new Map<FailureTag, number>(
  FAILURE_TAG_PRECEDENCE.map((tag, index) => [tag, index]),
);

export function isFailureTag(value: string): value is FailureTag {
  return FAILURE_TAG_SET.has(value as FailureTag);
}

export function isCoreProcessFailureTag(tag: FailureTag): boolean {
  return CORE_PROCESS_FAILURE_TAGS.includes(tag);
}

export function normalizeFailureTags(tags: readonly string[]): FailureTag[] {
  const normalized = new Set<FailureTag>();

  for (const tag of tags) {
    if (isFailureTag(tag)) {
      normalized.add(tag);
    }
  }

  return [...normalized].sort((left, right) => {
    return (PRECEDENCE_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (PRECEDENCE_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER);
  });
}

export function collectUnknownFailureTags(tags: readonly string[]): string[] {
  const unknown = new Set<string>();

  for (const tag of tags) {
    if (!isFailureTag(tag)) {
      unknown.add(tag);
    }
  }

  return [...unknown].sort();
}

export function selectPrimaryFailureTag(tags: readonly string[]): FailureTag | null {
  return normalizeFailureTags(tags)[0] ?? null;
}

export function getFailureTagNames(tags: readonly string[]): string[] {
  return normalizeFailureTags(tags).map((tag) => FAILURE_TAG_DEFINITIONS[tag].key);
}
