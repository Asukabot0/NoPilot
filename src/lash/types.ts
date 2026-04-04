/**
 * Lash runtime shared TypeScript type definitions.
 * Derived from Python source in lash/ — all @dataclass fields captured.
 * All interfaces mirror the JSON output shapes produced by cli.py via vars().
 */

// ---------------------------------------------------------------------------
// config.py
// ---------------------------------------------------------------------------

/** Matches DEFAULT_CONFIG keys and lash.config.json schema. */
export interface LashConfig {
  platforms: string[];
  platform_assignment: string;
  platform_overrides: Record<string, string> | null;
  critic_platform: string | null;
  max_concurrency: number | null;
  heartbeat_timeout: number;
  graceful_shutdown_seconds: number;
  max_retries_per_module: number;
  max_critic_rounds: number;
  max_approach_resets: number;
}

// ---------------------------------------------------------------------------
// build_state.py — 21 event types + state structures
// ---------------------------------------------------------------------------

/** All 21 valid build-state transition events. */
export type BuildEvent =
  | 'worker_spawned'
  | 'worker_completed'
  | 'worker_failed'
  | 'worker_timed_out'
  | 'test_passed'
  | 'test_failed'
  | 'module_critic_spawned'
  | 'module_critic_passed'
  | 'module_critic_failed'
  | 'batch_completed'
  | 'merge_completed'
  | 'merge_conflict'
  | 'build_critic_spawned'
  | 'build_critic_passed'
  | 'build_critic_failed'
  | 'supervisor_spawned'
  | 'supervisor_passed'
  | 'supervisor_failed'
  | 'build_paused'
  | 'build_completed'
  | 'build_backtracked';

/** Top-level build status values. */
export type BuildStatus =
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'backtracked'
  | 'paused_l2'
  | 'paused_critic'
  | 'paused_supervisor';

/** Worker-level status values (set by _WORKER_EVENT_STATUS mapping). */
export type WorkerStatus =
  | 'pending'
  | 'spawned'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'test_passed'
  | 'test_failed'
  | 'testing'
  | 'critic_review'
  | 'critic_passed'
  | 'critic_failed'
  | 'merging'
  | 'merged'
  | 'merge_conflict'
  | 'failed_preserved';

/** A single worker entry within a batch. */
export interface WorkerEntry {
  module_id: string;
  status: WorkerStatus;
  session_id?: string;
  worktree_path?: string;
}

/** A batch entry in the build state. */
export interface BatchEntry {
  batch_id: string;
  status: 'pending' | 'in_progress' | 'completed';
  workers: WorkerEntry[];
}

/** Entry in the transition_log array. */
export interface TransitionLogEntry {
  timestamp: string;
  event: BuildEvent;
  module_id: string | null;
  batch_id: string | null;
  from_status: string;
  to_status: string;
  detail: Record<string, unknown>;
}

/** Tracer status within BuildState. */
export interface TracerStateEntry {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  module_statuses: Record<string, string>;
}

/** The full build state persisted to specs/build-state.json. */
export interface BuildState {
  status: BuildStatus;
  spec_hash: string;
  started_at: string;
  updated_at: string;
  current_phase: string;
  tracer: TracerStateEntry;
  batches: BatchEntry[];
  transition_log: TransitionLogEntry[];
}

/** Session recovery entry from get_resume_point(). */
export interface SessionRecoveryEntry {
  module_id: string;
  session_resumable: boolean;
  worktree_exists: boolean;
}

/** Return type of get_resume_point(). */
export interface ResumePoint {
  phase: string;
  batch_id: string | null;
  module_id: string | null;
  pending_action: string;
  session_recovery: SessionRecoveryEntry[];
}

/** Return type of archive_state(). */
export interface ArchiveResult {
  archive_path: string;
}

// ---------------------------------------------------------------------------
// plan_generator.py — execution plan, batches, module nodes
// ---------------------------------------------------------------------------

/** A single module node within a plan batch. */
export interface PlanModuleNode {
  module_id: string;
  depends_on: string[];
  owned_files: string[];
  source_root: string;
}

/** A batch of modules in the execution plan. */
export interface PlanBatch {
  batch_id: string;
  modules: PlanModuleNode[];
}

/** Tracer configuration derived from discover.json core_scenarios. */
export interface TracerConfig {
  scenario_id: string;
  module_ids: string[];
  batch: PlanBatch;
}

/** The full execution plan returned by generate_plan(). */
export interface ExecutionPlan {
  spec_hash: string;
  tracer: TracerConfig | null;
  batches: PlanBatch[];
}

// ---------------------------------------------------------------------------
// failure_classifier.py — ClassificationReason, ClassificationResult, FailureAction
// ---------------------------------------------------------------------------

/** L0-L3 failure levels plus PASS. */
export type FailureLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'PASS';

/** A single reason entry in a ClassificationResult. Mirrors @dataclass ClassificationReason. */
export interface ClassificationReason {
  level: FailureLevel;
  pattern_matched: string;
  evidence: string;
  file: string | null;
  line: number | null;
  in_owned_files: boolean | null;
}

/** Return type of classify_failure(). Mirrors @dataclass ClassificationResult. */
export interface ClassificationResult {
  level: FailureLevel;
  reasons: ClassificationReason[];
  highest_level: FailureLevel;
}

/** Return type of determine_action(). Mirrors @dataclass FailureAction. */
export interface FailureAction {
  type: string;
  details: Record<string, unknown>;
  exhausted: boolean;
}

/** JSON output of `lash classify` (from cmd_classify using vars()). */
export interface ClassifyOutput {
  level: FailureLevel;
  highest_level: FailureLevel;
  reasons: ClassificationReason[];
}

// ---------------------------------------------------------------------------
// test_runner.py — TestRunnerConfig, TestResult, validation result
// ---------------------------------------------------------------------------

/** Detected test runner configuration (from detect_test_runner). */
export interface TestRunnerConfig {
  command: string;
  type: 'jest' | 'npm' | 'pytest' | 'go_test' | 'make_test';
  args: string[];
}

/** Test execution result (from run_tests). */
export interface TestResult {
  passed: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_seconds: number;
  summary: string | null;
}

/** Return type of validate_tests_json(). */
export interface TestsJsonValidationResult {
  valid: boolean;
  errors: string[];
  coverage_guard_violations: string[];
}

// ---------------------------------------------------------------------------
// worktree_manager.py — MergeResult and helper return types
// ---------------------------------------------------------------------------

/** Return type of merge_to_main() — mirrors @dataclass MergeResult. */
export interface MergeResult {
  success: boolean;
  branch_name: string;
  conflict_files: string[] | null;
  merge_commit: string | null;
}

/** Return type of create_worktree() and create_conflict_resolution_worktree(). */
export interface WorktreeInfo {
  worktree_path: string;
  branch_name: string;
}

/** Return type of preserve_worktree(). */
export interface PreserveResult {
  preserved_path: string;
}

/** Return type of check_unexpected_files(). */
export interface UnexpectedFilesResult {
  clean: boolean;
  unexpected_files: string[];
}

/** Return type of cmd_worktree_cleanup (from cli.py). */
export interface WorktreeCleanupResult {
  cleaned: boolean;
  module_id: string;
}

// ---------------------------------------------------------------------------
// task_packager.py — package generation result
// ---------------------------------------------------------------------------

/** Return type of generate_package(). */
export interface PackageResult {
  files_written: string[];
}

/** An interface entry in .lash/interfaces.json (from _build_interfaces). */
export interface InterfaceMethod {
  name: string;
  params: Array<{ name: string; type: string }>;
  return_type: string;
  description: string;
}

export interface InterfaceEntry {
  interface_id: string;
  name: string;
  source_module_id: string;
  status: 'implemented' | 'pending';
  methods: InterfaceMethod[];
}

/** Content of .lash/module-spec.json (from _build_module_spec). */
export interface ModuleSpec {
  module_id: string;
  id: string;
  name?: string;
  description?: string;
  source_root?: string;
  requirement_refs?: string[];
  owned_files?: string[];
  interfaces?: unknown[];
  data_models?: unknown[];
  state_machine?: unknown;
  nfr_constraints?: unknown;
  invariant_refs?: string[];
}

// ---------------------------------------------------------------------------
// platform_launcher.py — WorkerHandle, PreflightResult, CompletionStatus, HeartbeatResult
// ---------------------------------------------------------------------------

/** Supported platform names. */
export type Platform = 'claude-code' | 'codex' | 'opencode';

/** Live worker handle — mirrors @dataclass WorkerHandle. */
export interface WorkerHandle {
  platform: Platform;
  pid: number;
  session_id: string;
  worktree_path: string;
  module_id: string;
  started_at: string;
}

/** Platform availability result — mirrors @dataclass PreflightResult. */
export interface PreflightResult {
  available: boolean;
  version: string | null;
  auth_ok: boolean;
  error: string | null;
}

/** JSON output of `lash preflight` — map of platform name → PreflightResult. */
export type PreflightOutput = Record<string, PreflightResult>;

/** Worker completion status (extended from Python @dataclass with timeout + done signal). */
export interface CompletionStatus {
  status: 'running' | 'completed' | 'completed_empty' | 'failed' | 'timeout';
  exit_code: number | null;
  has_diff: boolean | null;
}

/** Structured completion signal written by Worker to .lash/done.json. */
export interface DoneSignal {
  status: 'completed' | 'failed';
  timestamp: string;
  module_id: string;
  summary?: string;
  test_summary?: { passed: number; failed: number };
}

/** Heartbeat probe result — mirrors @dataclass HeartbeatResult. */
export interface HeartbeatResult {
  alive: boolean;
  responded: boolean;
  probe_count: number;
  action: 'continue' | 'timed_out';
}

/** JSON output of `lash spawn` (explicit shape from cmd_spawn, not vars()). */
export interface SpawnOutput {
  pid: number;
  session_id: string;
  platform: Platform;
  module_id: string;
  worktree_path: string;
  started_at: string;
}

/** Return type of cancel_worker(). */
export interface CancelResult {
  killed: boolean;
}

/** Return type of cmd_resume (from cli.py). */
export interface ResumeOutput {
  sent: boolean;
}
