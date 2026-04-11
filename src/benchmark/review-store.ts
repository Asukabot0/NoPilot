import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FailureTag } from './failure-taxonomy.js';
import type {
  AutoVerdict,
  BenchmarkVerdictArtifact,
  ReviewEvidencePaths,
  ReviewTicket,
  VerdictStatus,
} from './verdict-writer.js';

export interface CreateReviewTicketInput {
  run_dir: string;
  review_reason: string[];
  failure_tags: FailureTag[];
}

export interface ApplyHumanReviewInput {
  run_dir: string;
  final_verdict: 'pass' | 'fail';
  reviewer?: string;
  notes?: string;
}

export interface StoredReviewRecord {
  status: 'pending_review' | 'resolved';
  run_dir: string;
  auto_verdict: AutoVerdict;
  review_reason: string[];
  failure_tags: FailureTag[];
  preserved_evidence: ReviewEvidencePaths;
  final_verdict: VerdictStatus | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
}

export interface HumanReviewMetadata {
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
}

export type ReviewedBenchmarkVerdictArtifact = BenchmarkVerdictArtifact & {
  human_review?: HumanReviewMetadata;
};

export interface ApplyHumanReviewResult {
  review_record: StoredReviewRecord;
  verdict: ReviewedBenchmarkVerdictArtifact;
}

const VERDICT_FILE = 'verdict.json';
const REVIEW_RECORD_FILE = 'review-record.json';

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function normalizeStringList(values: readonly string[] | undefined): string[] {
  const normalized = new Set<string>();

  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      normalized.add(trimmed);
    }
  }

  return [...normalized];
}

function loadVerdict(runDir: string): ReviewedBenchmarkVerdictArtifact {
  return readJsonFile<ReviewedBenchmarkVerdictArtifact>(path.join(runDir, VERDICT_FILE));
}

function loadReviewRecord(runDir: string): StoredReviewRecord | null {
  const reviewRecordPath = path.join(runDir, REVIEW_RECORD_FILE);
  if (!existsSync(reviewRecordPath)) {
    return null;
  }

  return readJsonFile<StoredReviewRecord>(reviewRecordPath);
}

function ensureReviewableVerdict(verdict: BenchmarkVerdictArtifact): ReviewTicket {
  if (
    verdict.auto_verdict !== 'needs_review'
    || !verdict.review_ticket
    || verdict.review_reason.length === 0
  ) {
    throw new Error('benchmark_review_not_required');
  }

  return verdict.review_ticket;
}

function ensureReviewRecordPending(reviewRecord: StoredReviewRecord | null): void {
  if (reviewRecord && reviewRecord.status !== 'pending_review') {
    throw new Error('review_not_pending');
  }
}

function toPendingReviewRecord(
  runDir: string,
  verdict: BenchmarkVerdictArtifact,
  input: CreateReviewTicketInput,
): StoredReviewRecord {
  const reviewTicket = ensureReviewableVerdict(verdict);

  return {
    status: 'pending_review',
    run_dir: runDir,
    auto_verdict: verdict.auto_verdict,
    review_reason: normalizeStringList(
      input.review_reason.length > 0 ? input.review_reason : verdict.review_reason,
    ),
    failure_tags: normalizeStringList(
      input.failure_tags.length > 0 ? input.failure_tags : verdict.failure_tags,
    ) as FailureTag[],
    preserved_evidence: {
      transcript: reviewTicket.preserved_evidence.transcript,
      event_log: reviewTicket.preserved_evidence.event_log,
      artifacts: reviewTicket.preserved_evidence.artifacts,
    },
    final_verdict: null,
    reviewed_by: null,
    reviewed_at: null,
    notes: null,
  };
}

export function createReviewTicket(input: CreateReviewTicketInput): StoredReviewRecord {
  const verdict = loadVerdict(input.run_dir);
  const existingRecord = loadReviewRecord(input.run_dir);
  ensureReviewRecordPending(existingRecord);

  if (existingRecord && existingRecord.status === 'pending_review') {
    return existingRecord;
  }

  const reviewRecord = toPendingReviewRecord(input.run_dir, verdict, input);

  writeJsonFile(path.join(input.run_dir, REVIEW_RECORD_FILE), reviewRecord);

  return reviewRecord;
}

export function applyHumanReview(input: ApplyHumanReviewInput): ApplyHumanReviewResult {
  const verdict = loadVerdict(input.run_dir);
  const existingRecord = loadReviewRecord(input.run_dir);
  ensureReviewRecordPending(existingRecord);
  const baseRecord = existingRecord ?? toPendingReviewRecord(input.run_dir, verdict, {
    run_dir: input.run_dir,
    review_reason: verdict.review_reason,
    failure_tags: verdict.failure_tags,
  });
  const reviewedAt = new Date().toISOString();

  const reviewRecord: StoredReviewRecord = {
    ...baseRecord,
    status: 'resolved',
    final_verdict: input.final_verdict,
    reviewed_by: input.reviewer?.trim() || null,
    reviewed_at: reviewedAt,
    notes: input.notes?.trim() || null,
  };
  const nextVerdict: ReviewedBenchmarkVerdictArtifact = {
    ...verdict,
    status: input.final_verdict,
    human_review_required: false,
    final_verdict: input.final_verdict,
    human_review: {
      reviewed_by: reviewRecord.reviewed_by,
      reviewed_at: reviewRecord.reviewed_at,
      notes: reviewRecord.notes,
    },
  };

  writeJsonFile(path.join(input.run_dir, REVIEW_RECORD_FILE), reviewRecord);
  writeJsonFile(path.join(input.run_dir, VERDICT_FILE), nextVerdict);

  return {
    review_record: reviewRecord,
    verdict: nextVerdict,
  };
}
