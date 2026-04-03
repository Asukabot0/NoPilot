# Lash Design Decisions

## Overview

Lash is a cross-platform multi-agent orchestration engine that replaces NoPilot's `/build` phase. It runs as prompts and helper scripts (zero dependencies) within existing AI coding platforms (Claude Code, Codex, OpenCode), treating each platform as a callable Worker Agent via CLI process spawning.

---

## 1. Design Philosophy

Lash's architecture is grounded in five core principles:

1. **Platform-as-Agent, not Framework**: No custom runtime, no MCP server, no framework-specific adapters. Any CLI coding tool becomes a Worker. This enables heterogeneous agent teams (different platforms and models for different tasks) and zero platform switching costs.

2. **Orchestration via Prompt Engineering + Scripts**: Lash matches NoPilot's philosophy of pure prompt engineering. It avoids building yet another framework that competes with existing platforms. Instead, it orchestrates existing platforms as Workers—as portable as a set of text files.

3. **External Verification, Not Self-Reports**: All test pass/fail decisions are based on Lash's external test execution in the Worker's worktree, never on the Worker's self-reported results. This eliminates same-model bias and ensures objective verification.

4. **Deterministic Execution with Crash Recovery**: Build state is persisted after every one of 21 state transitions, enabling deterministic resume from any interruption point. Failed worktrees are preserved for diagnosis; completed ones are cleaned up.

5. **Mandatory Dual-Layer Quality Gates**: Supervisor (intent/complexity/constraints) + Module Critic (code quality) + Build Critic (scenario acceptance + alignment) are all non-optional guardrails. Build cannot complete until all pass or user accepts documented degradation.

---

## 2. Architecture Rationale

### Two-Layer Design: Prompt-Driven Orchestration + Deterministic Helpers

**Why this split?**

**Prompt-Driven Layer (Orchestrator + Workers):**
- Makes architectural decisions, plans batch execution, coordinates feedback loops, and evaluates failures
- Runs on host LLM platform (Claude Code, Codex, or OpenCode)
- Interprets specs and makes trade-off decisions during build

**Deterministic Helper Layer (Python modules):**
- Handles mechanical operations: DAG topological sort, git operations, test runner detection, JSON parsing
- Produces deterministic, repeatable output for the same input
- Non-blocking; can be called synchronously without spawning new agents

**Architectural Benefits:**
- Each Worker is an independent LLM session with no conversation history (prevents context pollution and bias)
- Orchestrator makes decisions while having full spec/test/critic context; Workers focus narrowly on implementation
- Failure classification (L0-L3) is deterministic and reproducible across runs
- Parallel build can resume from any point without re-running earlier work

### Platform Abstraction Strategy

Lash uses **thin per-platform launchers** (not deep adapters):
- CC: `claude -p <task> --session-id <uuid> --permission-mode bypassPermissions --append-system-prompt-file .lash/worker-instructions.md`
- Codex: `codex exec -c approval_policy=auto-edit <task>`
- OpenCode: `opencode run <task> --agent coder`

**Rationale**: Adding a new platform costs hours (write CLI wrapper), not weeks. Version updates to platform CLIs are localized to launcher constants.

---

## 3. Module Architecture

Lash consists of 8 Python modules + CLI orchestrator:

### MOD-001: Plan Generator
**Responsibility**: Parse spec.json dependency graph, validate file ownership, topologically sort modules into parallelizable batches (deterministic ordering, ties broken by module ID), select tracer bullet scenario, derive tracer module set.

**Key contracts**:
- Detects cycles and invalid references; rejects immediately
- Enforces INV-003: no two modules in same batch share owned_files
- Enforces INV-004: no parallel batches until tracer merges to main

### MOD-002: Platform Launcher
**Responsibility**: Thin abstraction for Worker lifecycle: preflight validation (binary/version/auth), spawn, resume with feedback, cancel (SIGTERM→SIGKILL), completion detection (exit code + git diff), heartbeat monitoring (kill -0 + probe).

**Key contracts**:
- All platforms report completion uniformly: {status: completed|completed_empty|failed}
- Heartbeat probes max 2×; max 300s idle before probe, 60s probe timeout
- Preflight fails atomically; no Worker spawned if any platform fails

### MOD-003: Worktree Manager
**Responsibility**: Create isolated git worktrees at `.lash/worktrees/<module_id>/` branching from main HEAD, merge completed work via `--no-ff`, detect merge conflicts and spawn conflict-resolution Workers, cleanup completed worktrees, preserve failed ones.

**Key contracts**:
- Enforces INV-004: no parallel batch worktrees until tracer merged + critic passed
- Merge conflicts abort merge, mark in build-state.json, spawn resolution Worker in new worktree with both branches available
- Failed worktrees preserved for diagnosis; merge conflicts and failed_preserved preserved across batches

### MOD-004: Task Package Generator
**Responsibility**: Generate complete task context for each Worker: task.md (objective, acceptance criteria, interfaces, file ownership), module-spec.json, interfaces.json (with status: implemented|pending), tests.json (filtered to module), owned_files.txt, read_only_files.txt, worker-instructions.md (platform-specific).

**Key contracts**:
- Tests filtered via: `example_cases[].module_ref` and `property_cases[].module_ref` matching current module_id
- Interfaces show completed modules as "implemented", current as "pending"
- Worker instructions never create/modify files outside `.lash/` directory

### MOD-005: Test Runner + Verifier
**Responsibility**: Generate specs/tests.json per NoPilot schema (example_cases[], property_cases[], coverage_summary, coverage_guards), run tests externally using project's auto-detected test runner (package.json scripts.test | go test | make test | pytest), re-run after any code fix.

**Key contracts**:
- Enforces INV-002: external test execution is sole source of truth for pass/fail
- Enforces INV-009: re-run tests after feedback fix or Critic-reported fix before merge
- Coverage guards violation (uncovered requirements/invariants) halts as L2

### MOD-006: Failure Classifier
**Responsibility**: Classify test failures using L0-L3 model with concrete rules and route through NoPilot state machine.

**Classifications**:
- **L0 (env)**: MODULE_NOT_FOUND, EADDRINUSE, ENOENT, connection refused, API timeout, missing binary, test runner crash/OOM → env_waiting
- **L1 (impl)**: Assertion failure, TypeError, ReferenceError, SyntaxError in owned_files, test timeout → L1_RESOLVED → feedback loop
- **L2 (contract)**: Contradicts spec/interface, wrong return type, missing field → awaiting_user with options: ACCEPT_DEGRADATION, CUT_FEATURE, MODIFY_SPEC, RETRY_DIFFERENT_APPROACH, BACKTRACK_DISCOVER
- **L3 (fundamental)**: Circular import, architectural incompatibility, spec contradiction → diagnosing with options: BACKTRACK_SPEC or BACKTRACK_DISCOVER

**Key contracts**:
- Max 3 retries per module; RETRY_DIFFERENT_APPROACH resets counter (max 2× per module)
- Multiple failures: use highest level; unclassifiable → L2

### MOD-007: Module Critic
**Responsibility**: Independent review of Worker output after tests pass. Reports issues (does not modify code). Re-runs after Worker fixes. Blocks merge if critical/high severity issues exist.

**Key contracts**:
- Spawns in new Worker session with no conversation history from generation
- Produces report: {passed: bool, issues: [{file, line, severity, description}]}
- passed = true only when zero critical or high issues; medium/low logged but don't block
- Max 2 critic rounds; exceeding pauses for user intervention

### MOD-008: Build State Manager
**Responsibility**: Persist complete execution state to specs/build-state.json after every one of 21 state transitions using atomic writes (write to .build-state.json.tmp then rename). Support resume from all pause states. Handle worktree/session recovery.

**Key contracts**:
- Enforces INV-006: atomic write after every state transition
- Resume logic: in_progress → auto-resume; paused_l2/paused_critic/paused_supervisor → re-present options; terminal → offer fresh start
- Lost worktree on resume → recreate from main HEAD, regenerate task package, log in transition_log

### MOD-009: Build Critic (Orchestrator Only)
**Responsibility**: Execute auto-acceptance (simulate core scenarios, verify EARS criteria), then spawn independent Critic session to perform scenario walkthrough and acceptance alignment check.

**Key contracts**:
- Auto-acceptance writes operation scripts and simulation results to build_report.json
- Critic produces build_review.json: {scenario_walkthroughs, acceptance_alignment, recommendation: pass|L2|L3}
- Pass → Supervisor; L2 → awaiting_user; L3 → diagnosing

### MOD-010: Supervisor (Orchestrator Only)
**Responsibility**: Final intent/complexity/constraint check per NoPilot contract. Evaluates discover.json anchor vs build_report.json output.

**Key contracts**:
- Produces: {intent_alignment: aligned|drifted, complexity_growth: proportional|over_engineered, constraint_compliance: all_met|violated, detail}
- All ideal → complete; any problem → pause with user options: ACCEPT_AS_IS (records overridden_dimensions in contract_amendments), BACKTRACK_SPEC, BACKTRACK_DISCOVER

### CLI Orchestrator
**Responsibility**: Main entry point. Orchestrates the workflow end-to-end: generate plan, run tracer, spawn parallel batches, run external tests, classify failures, invoke critics/supervisor, merge, resume.

---

## 4. Key Interface Contracts

### JSON I/O Pattern

All subcommands output JSON to stdout; errors as JSON to stderr with process exit code.

**Success**: exit 0, stdout = JSON result
```json
{
  "status": "success",
  "data": { ... }
}
```

**Error**: exit 1 or 2, stderr = JSON error
```json
{
  "status": "error",
  "error": "error_type",
  "detail": "human-readable message"
}
```

### Core Data Flow

1. **Input**: specs/discover.json (requirements, scenarios, design philosophy) + specs/spec.json (modules, interfaces, data models)
2. **Plan Generation**: MOD-001 → specs/execution-plan.json (batches, tracer config)
3. **Task Packages**: MOD-004 generates `.lash/` per worktree (task.md, module-spec.json, interfaces.json, tests.json, etc.)
4. **Tests**: MOD-005 generates specs/tests.json per NoPilot schema
5. **Worker Execution**: MOD-002 spawns, MOD-003 manages worktrees, external tests run, MOD-006 classifies failures
6. **Quality Gates**: MOD-007 Module Critic, then MOD-009 Build Critic (auto-acceptance + alignment), then MOD-010 Supervisor
7. **State**: MOD-008 persists specs/build-state.json at every transition
8. **Output**: specs/build_report.json (auto-acceptance results), specs/build_review.json (Build Critic findings)

---

## 5. Failure Classification Logic (L0-L3)

The L0-L3 model routes failures to appropriate recovery strategies:

**L0 (Environment)**: Test infrastructure issue, not code issue. Examples: missing binary, port conflict, API timeout, test runner crash.
- Recovery: Attempt environment-specific fixes; if exhausted, present L2 options or escalate L3

**L1 (Implementation)**: Code logic error in owned files. Examples: assertion failure, TypeError, syntax error.
- Recovery: Send failing tests + stack trace to Worker for fix; re-run tests; Loop up to 3×

**L2 (Contract)**: Code implements wrong contract; spec/interface mismatch. Examples: wrong return type, missing field, contradicts specification.
- Recovery: Pause; present user options (ACCEPT_DEGRADATION, CUT_FEATURE, MODIFY_SPEC, RETRY_DIFFERENT_APPROACH, BACKTRACK_DISCOVER)

**L3 (Fundamental)**: Specification or architecture is unsound. Examples: circular import, architectural contradiction, spec infeasibility.
- Recovery: Halt build; diagnose; present user options (BACKTRACK_SPEC, BACKTRACK_DISCOVER)

**Classification Rules**:
- Multiple failures: use highest level (any L3 → L3; any L2 no L3 → L2; mix L0+L1 → send all to Worker)
- Unclassifiable → L2
- Max 3 retries per module; RETRY_DIFFERENT_APPROACH resets counter (max 2× per module); exceeding → L3
- Any L0-launcher (Worker spawn/auth failure) → Lash handles directly (preflight, retry, kill→respawn)

---

## 6. Tracer Bullet Strategy

The tracer bullet is a mandatory integration barrier before parallel work:

1. **Selection**: Auto-select highest-priority scenario from discover.json core_scenarios
   - Tiebreaker 1: fewest derived modules
   - Tiebreaker 2: alphanumeric scenario_id

2. **Module Derivation**: 
   - Find seed modules: modules in spec.json whose requirement_refs intersect scenario's requirement_refs
   - Compute transitive dependency closure
   - Tracer module set = union of seeds + dependencies

3. **Execution**:
   - Single batch with all tracer modules respecting internal dependencies
   - All tests must pass externally
   - Module Critic must pass

4. **Gating** (INV-004):
   - No parallel batch worktrees until tracer merged into main AND Module Critic passed
   - Validates core architectural assumptions before committing parallel resources

---

## 7. Quality Guardrails (Invariants)

| Invariant | Statement |
|-----------|-----------|
| **INV-001** | Supervisor + Module Critic + Build Critic (with auto-acceptance + alignment) are non-optional. Build cannot complete until all pass or user accepts degradation. |
| **INV-002** | All test pass/fail decisions based on Lash's external test execution, never Worker self-reports. |
| **INV-003** | No two Workers in same batch have overlapping owned_files. |
| **INV-004** | No parallel batch worktrees until tracer merged to main AND Module Critic passed. |
| **INV-005** | L2/L3/Critic/Supervisor escalations only present product-level decisions: ACCEPT_DEGRADATION, CUT_FEATURE, MODIFY_SPEC, RETRY_DIFFERENT_APPROACH, BACKTRACK_DISCOVER, BACKTRACK_SPEC (Supervisor adds ACCEPT_AS_IS). |
| **INV-006** | build-state.json atomically updated after every one of 21 state transitions. |
| **INV-007** | Each Worker in isolated worktree; no shared working directories. |
| **INV-008** | Critics do not modify code; Module Critic produces report, Build Critic produces build_review.json. |
| **INV-009** | After any code modification (feedback fix or Critic fix), tests re-run before merge. |
| **INV-010** | Workers only modify files in owned_files.txt; read_only_files.txt must not be modified. Violation at merge time blocks and escalates as L2. |

---

## 8. State Machine

Lash maintains deterministic execution state in specs/build-state.json with 21 defined state transitions:

**Progress States**: in_progress
**Pause States**: paused_l2, paused_critic, paused_supervisor
**Terminal States**: completed, failed, backtracked

**Auto-Resume Logic**:
- in_progress → resume from checkpoint
- paused_* → re-present user options
- terminal → offer fresh start

**Atomic Writes**: Every transition writes to `.build-state.json.tmp`, then renames (prevents corruption on interrupt).

---

## 9. Competitive Differentiation

| Feature | Lash Advantage |
|---------|----------------|
| **Parallel Build** | No competitor auto-generates parallel execution plans from spec contracts |
| **Multi-Platform** | OMC only supports Claude Code; Lash supports CC + Codex + OpenCode |
| **Isolation** | Cline Kanban has worktrees but is research-only, coding-only |
| **Spec→Task Auto-Conversion** | No competitor auto-generates task packages from specs |
| **External Test Verification** | All competitors trust agent self-reports; Lash verifies externally |
| **Failure Classification** | No competitor has systematic L0-L3 classification + routing |
| **Module Quality Gate** | New layer unique to Lash |
| **Crash Recovery** | No competitor supports deterministic resume for multi-agent builds |
| **Dual Critic Verification** | AI self-acceptance + independent Critic alignment check is unique |

---

## 10. Integration with NoPilot Workflow

Lash **replaces** NoPilot's `/build` phase:

```
/discover → /spec → /lash-build → (orchestrator manages Workers in parallel)
```

**Inputs**: specs/discover.json (locked requirements), specs/spec.json (locked design)
**Outputs**: 
- specs/execution-plan.json (batch plan)
- specs/tests.json (generated tests per NoPilot schema)
- specs/build-state.json (execution state with atomic updates)
- specs/build_report.json (auto-acceptance results)
- specs/build_review.json (Build Critic findings)
- Main branch: merged and tested modules

**Constraints Honored**:
- All Supervisor/Critic/Module outputs follow NoPilot contracts
- Acceptance criteria verification via EARS model
- State machine transitions per workflow.json
- Backtrack triggers: spec_interface_infeasible (→BACKTRACK_SPEC), requirement_level_fundamental_issue (→BACKTRACK_DISCOVER)

