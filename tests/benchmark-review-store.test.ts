import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyHumanReview,
  createReviewTicket,
} from '../src/benchmark/review-store.js';

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

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function makeNeedsReviewRunDir(): string {
  const runDir = makeTempDir('benchmark-review-store-');

  mkdirSync(join(runDir, 'artifacts'), { recursive: true });
  writeFileSync(join(runDir, 'transcript.jsonl'), '{"role":"assistant","content":"trace"}\n', 'utf-8');
  writeJson(join(runDir, 'event-log.json'), {
    status: 'complete',
    warnings: ['trace_insufficient: cannot_determine_outcome'],
  });
  writeFileSync(join(runDir, 'artifacts', 'summary.txt'), 'artifact\n', 'utf-8');
  writeJson(join(runDir, 'verdict.json'), {
    status: 'needs_review',
    auto_verdict: 'needs_review',
    run_id: 'run-001',
    total_score: 37,
    score_breakdown: {
      process_score: 32,
      outcome_score: 0,
      efficiency_score: 5,
      counted_efficiency_score: 5,
      efficiency_excluded: false,
      process_fail: false,
    },
    failure_tags: ['F10'],
    failure_tag_names: ['trace_insufficient'],
    primary_failure_tag: 'F10',
    human_review_required: true,
    final_verdict: null,
    review_reason: ['semantic_ambiguity'],
    required_events_met: ['phase_entered:discover'],
    trace_insufficient_reasons: ['cannot_determine_outcome'],
    review_ticket: {
      status: 'pending_review',
      run_dir: runDir,
      review_reason: ['semantic_ambiguity'],
      failure_tags: ['F10'],
      preserved_evidence: {
        transcript: 'transcript.jsonl',
        event_log: 'event-log.json',
        artifacts: 'artifacts',
      },
    },
  });

  return runDir;
}

describe('review-store', () => {
  it('writes a pending review record and resolves it without removing automatic evidence', () => {
    const runDir = makeNeedsReviewRunDir();

    const pending = createReviewTicket({
      run_dir: runDir,
      review_reason: ['semantic_ambiguity'],
      failure_tags: ['F10'],
    });

    expect(pending).toMatchObject({
      status: 'pending_review',
      run_dir: runDir,
      review_reason: ['semantic_ambiguity'],
      failure_tags: ['F10'],
      preserved_evidence: {
        transcript: 'transcript.jsonl',
        event_log: 'event-log.json',
        artifacts: 'artifacts',
      },
      final_verdict: null,
    });

    const reviewRecordPath = join(runDir, 'review-record.json');
    expect(existsSync(reviewRecordPath)).toBe(true);

    const resolved = applyHumanReview({
      run_dir: runDir,
      final_verdict: 'pass',
      reviewer: 'qa-user',
      notes: 'Trace confirms expected behavior.',
    });

    expect(resolved.review_record).toMatchObject({
      status: 'resolved',
      run_dir: runDir,
      review_reason: ['semantic_ambiguity'],
      final_verdict: 'pass',
      reviewed_by: 'qa-user',
      notes: 'Trace confirms expected behavior.',
    });
    expect(resolved.verdict).toMatchObject({
      status: 'pass',
      auto_verdict: 'needs_review',
      final_verdict: 'pass',
      review_reason: ['semantic_ambiguity'],
      review_ticket: {
        status: 'pending_review',
        run_dir: runDir,
        review_reason: ['semantic_ambiguity'],
        failure_tags: ['F10'],
        preserved_evidence: {
          transcript: 'transcript.jsonl',
          event_log: 'event-log.json',
          artifacts: 'artifacts',
        },
      },
    });

    const onDiskRecord = JSON.parse(readFileSync(reviewRecordPath, 'utf-8')) as unknown;
    const onDiskVerdict = JSON.parse(readFileSync(join(runDir, 'verdict.json'), 'utf-8')) as unknown;

    expect(onDiskRecord).toEqual(resolved.review_record);
    expect(onDiskVerdict).toEqual(resolved.verdict);
  });

  it('rejects review ticket creation when the verdict is not reviewable', () => {
    const runDir = makeTempDir('benchmark-review-store-');

    writeJson(join(runDir, 'verdict.json'), {
      status: 'pass',
      auto_verdict: 'pass',
      final_verdict: null,
      review_reason: [],
    });

    expect(() => createReviewTicket({
      run_dir: runDir,
      review_reason: ['semantic_ambiguity'],
      failure_tags: ['F10'],
    })).toThrow('benchmark_review_not_required');
  });
});
