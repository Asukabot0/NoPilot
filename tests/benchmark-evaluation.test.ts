import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkOracle } from '../src/benchmark/oracle-checker.js';
import {
  collectUnknownFailureTags,
  FAILURE_TAG_DEFINITIONS,
  FAILURE_TAG_PRECEDENCE,
  getFailureTagNames,
  selectPrimaryFailureTag,
} from '../src/benchmark/failure-taxonomy.js';
import { scoreRun } from '../src/benchmark/scorer.js';
import { composeVerdict, writeVerdictArtifact } from '../src/benchmark/verdict-writer.js';
import { validateBenchmarkSchema } from '../src/benchmark/schema-loader.js';

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

describe('benchmark evaluation taxonomy', () => {
  it('defines the fixed phase-1 failure taxonomy and precedence order', () => {
    expect(FAILURE_TAG_PRECEDENCE).toEqual([
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
    ]);

    expect(
      Object.fromEntries(
        Object.entries(FAILURE_TAG_DEFINITIONS).map(([code, definition]) => [code, definition.key]),
      ),
    ).toEqual({
      F1: 'wrong_skill_or_command_route',
      F2: 'skipped_required_stage',
      F3: 'generation_review_not_separated',
      F4: 'missing_fresh_reverify',
      F5: 'stage_leakage',
      F6: 'missing_prerequisite_input_check',
      F7: 'explicit_user_intent_not_honored',
      F8: 'parallel_isolation_missing',
      F9: 'subagent_completion_not_verified',
      F10: 'trace_insufficient',
      F11: 'artifact_contract_mismatch',
    });

    expect(selectPrimaryFailureTag(['F7', 'F2', 'F10'])).toBe('F2');
    expect(collectUnknownFailureTags(['F1', 'FX', 'F10', 'BAD'])).toEqual(['BAD', 'FX']);
    expect(getFailureTagNames(['F10', 'F1'])).toEqual([
      'wrong_skill_or_command_route',
      'trace_insufficient',
    ]);
  });
});

describe('checkOracle', () => {
  it('classifies trace insufficiency as F10 and records semantic ambiguity for review', () => {
    const result = checkOracle({
      required_events_met: ['phase_entered:discover'],
      trace_warnings: [
        'trace_insufficient: cannot_determine_fresh_reverify',
      ],
    });

    expect(result).toMatchObject({
      required_events_met: ['phase_entered:discover'],
      failure_tags: ['F10'],
      review_reason: ['semantic_ambiguity'],
      trace_insufficient_reasons: ['cannot_determine_fresh_reverify'],
    });
  });
});

describe('scoreRun', () => {
  it('caps F1-F4 process failures and excludes efficiency from the total', () => {
    const result = scoreRun({
      process_score: 45,
      outcome_score: 10,
      efficiency_score: 20,
      failure_tags: ['F4'],
    });

    expect(result).toMatchObject({
      process_score: 20,
      outcome_score: 10,
      efficiency_score: 20,
      counted_efficiency_score: 0,
      total_score: 30,
      efficiency_excluded: true,
      process_fail: true,
    });
  });

  it.each([
    { process_score: 0, outcome_score: 30, efficiency_score: 20 },
    { process_score: 18, outcome_score: 26, efficiency_score: 20 },
    { process_score: 24, outcome_score: 1, efficiency_score: 20 },
  ])(
    'marks any run below the process threshold as process_fail: %j',
    ({ process_score, outcome_score, efficiency_score }) => {
      const result = scoreRun({
        process_score,
        outcome_score,
        efficiency_score,
      });

      expect(result.process_fail).toBe(true);
      expect(result.total_score).toBe(process_score + outcome_score);
      expect(result.counted_efficiency_score).toBe(0);
    },
  );

  it('rejects scores outside the phase-1 scoring envelope', () => {
    expect(() => scoreRun({
      process_score: 51,
      outcome_score: 30,
      efficiency_score: 20,
    })).toThrow('score_gate_violation');

    expect(() => scoreRun({
      process_score: 50,
      outcome_score: 31,
      efficiency_score: 20,
    })).toThrow('score_gate_violation');

    expect(() => scoreRun({
      process_score: 50,
      outcome_score: 30,
      efficiency_score: 21,
    })).toThrow('score_gate_violation');
  });
});

describe('composeVerdict', () => {
  it('emits process_fail and excludes efficiency when process score drops below 25', () => {
    const verdict = composeVerdict({
      run_id: 'RUN-007',
      oracle_result: {
        core_process_violations: ['F1', 'F3'],
        outcome_checks_passed: true,
      },
      run_metrics: {
        process_score: 18,
        outcome_score: 26,
        efficiency_score: 20,
      },
    });

    expect(verdict).toMatchObject({
      status: 'fail',
      auto_verdict: 'process_fail',
      total_score: 44,
      primary_failure_tag: 'F1',
      failure_tags: ['F1', 'F3'],
      score_breakdown: {
        process_score: 18,
        outcome_score: 26,
        efficiency_score: 20,
        counted_efficiency_score: 0,
        efficiency_excluded: true,
      },
    });
  });

  it('assigns fallback taxonomy tags when process_fail has no explicit failure tags', () => {
    const verdict = composeVerdict({
      run_id: 'RUN-007B',
      oracle_result: {
        outcome_checks_passed: true,
      },
      run_metrics: {
        process_score: 10,
        outcome_score: 3,
        efficiency_score: 20,
      },
    });

    expect(verdict.auto_verdict).toBe('process_fail');
    expect(verdict.failure_tags).toEqual(['F11']);
    expect(verdict.primary_failure_tag).toBe('F11');
  });

  it('emits needs_review with F10 and preserves evidence for human review', () => {
    const outputDir = makeTempDir('benchmark-verdict-');
    const verdictPath = join(outputDir, 'verdict.json');
    const verdict = composeVerdict({
      run_id: 'RUN-008',
      oracle_result: {
        required_events_met: ['phase_entered:discover'],
        trace_warnings: [
          'trace_insufficient: cannot_determine_fresh_reverify',
        ],
      },
      run_metrics: {
        process_score: 32,
        outcome_score: 0,
        efficiency_score: 5,
      },
      evidence_paths: {
        transcript: 'transcript.jsonl',
        event_log: 'event-log.json',
        artifacts: 'artifacts',
      },
    });

    const written = writeVerdictArtifact(verdictPath, verdict);
    const onDisk = JSON.parse(readFileSync(verdictPath, 'utf-8')) as unknown;
    const validation = validateBenchmarkSchema('benchmark-verdict', onDisk);

    expect(validation).toMatchObject({ valid: true, errors: [] });
    expect(written).toMatchObject({
      status: 'needs_review',
      auto_verdict: 'needs_review',
      failure_tags: ['F10'],
      failure_tag_names: ['trace_insufficient'],
      primary_failure_tag: 'F10',
      human_review_required: true,
      final_verdict: null,
      review_reason: ['semantic_ambiguity'],
      review_ticket: {
        status: 'pending_review',
        run_dir: 'RUN-008',
        review_reason: ['semantic_ambiguity'],
        failure_tags: ['F10'],
        preserved_evidence: {
          transcript: 'transcript.jsonl',
          event_log: 'event-log.json',
          artifacts: 'artifacts',
        },
      },
      trace_insufficient_reasons: ['cannot_determine_fresh_reverify'],
    });
    expect(onDisk).toEqual(written);
  });

  it('requires complete review evidence when emitting needs_review', () => {
    expect(() => composeVerdict({
      run_id: 'RUN-008B',
      oracle_result: {
        ambiguity_reasons: ['manual_judgement_required'],
      },
      run_metrics: {
        process_score: 35,
        outcome_score: 5,
        efficiency_score: 5,
      },
      evidence_paths: {
        transcript: 'transcript.jsonl',
        event_log: 'event-log.json',
        artifacts: '',
      },
    })).toThrow('benchmark_review_evidence_missing');
  });

  it('forces F10 when a verdict becomes needs_review due to ambiguity reasons', () => {
    const verdict = composeVerdict({
      run_id: 'RUN-008C',
      oracle_result: {
        ambiguity_reasons: ['manual_judgement_required'],
      },
      run_metrics: {
        process_score: 35,
        outcome_score: 5,
        efficiency_score: 5,
      },
      evidence_paths: {
        transcript: 'transcript.jsonl',
        event_log: 'event-log.json',
        artifacts: 'artifacts',
      },
    });

    expect(verdict.auto_verdict).toBe('needs_review');
    expect(verdict.failure_tags).toContain('F10');
    expect(verdict.primary_failure_tag).toBe('F10');
  });

  it('returns pass when outcome passes and no failures or ambiguity are present', () => {
    const verdict = composeVerdict({
      run_id: 'RUN-009',
      oracle_result: {
        outcome_checks_passed: true,
      },
      run_metrics: {
        process_score: 30,
        outcome_score: 30,
        efficiency_score: 20,
      },
    });

    expect(verdict).toMatchObject({
      status: 'pass',
      auto_verdict: 'pass',
      failure_tags: [],
      failure_tag_names: [],
      primary_failure_tag: null,
      human_review_required: false,
      final_verdict: null,
      review_reason: [],
      total_score: 80,
      score_breakdown: {
        process_score: 30,
        outcome_score: 30,
        efficiency_score: 20,
        counted_efficiency_score: 20,
        efficiency_excluded: false,
      },
    });
  });

  it('rejects unknown failure tags instead of silently dropping them', () => {
    expect(() => composeVerdict({
      run_id: 'RUN-010',
      oracle_result: {
        failure_tags: ['FX'],
        outcome_checks_passed: false,
      },
      run_metrics: {
        process_score: 30,
        outcome_score: 0,
        efficiency_score: 0,
      },
    })).toThrow('unknown_failure_tag');
  });

  it('rejects impossible score inputs instead of emitting an out-of-range verdict', () => {
    expect(() => composeVerdict({
      run_id: 'RUN-011',
      oracle_result: {
        outcome_checks_passed: true,
      },
      run_metrics: {
        process_score: 999,
        outcome_score: 30,
        efficiency_score: 20,
      },
    })).toThrow('score_gate_violation');
  });
});
