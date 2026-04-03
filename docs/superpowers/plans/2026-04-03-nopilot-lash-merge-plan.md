# Implementation Plan: NoPilot + Lash Merge Migration

**Design spec:** `docs/superpowers/specs/2026-04-03-nopilot-lash-merge-design.md`
**Status:** Approved (Architect + Critic consensus, iteration 2)

---

## RALPLAN-DR (Deliberation Record)

### Principles

1. **Contract fidelity** — Every Lash subcommand must produce byte-identical JSON output structure. Prompt files parse this JSON; any deviation breaks orchestration.
2. **Module isolation** — Each module is translated and verified independently before moving to the next. No "big bang" switch.
3. **Zero prompt logic changes** — Prompt files receive only two mechanical replacements: `python3 -m lash` → `lash` (CLI invocation) and `lash/prompts/<name>.md` → `commands/<name>.md` (internal path references, 5 occurrences). Three files are renamed for namespace consistency (`conflict_resolver.md` → `lash-conflict-resolver.md`, etc.). No behavioral modifications.
4. **Type-first translation** — Define TypeScript interfaces for all JSON contracts before writing implementation. Types are the contract enforcement mechanism.
5. **Test parity** — Every pytest test case must have a corresponding Vitest test. No test is dropped during translation.

### Decision Drivers (Top 3)

1. **Prompt compatibility** — Lash prompt files (lash-build.md, lash-tracer.md, etc.) contain exact JSON field references. Breaking these breaks the entire build pipeline.
2. **Subprocess behavior parity** — Python subprocess and Node.js child_process handle signals, exit codes, and stdio differently. Must validate per-platform behavior.
3. **Distribution continuity** — `nopilot init` must replicate what `bash install.sh` does today, with no regression for existing users.

### Viable Options

**Option A: Sequential module translation (Recommended)**
- Translate one module at a time in dependency order
- Each module: define types → translate code → translate tests → verify
- Pros: Easy to verify contract fidelity per module; clear progress tracking; easy to debug failures
- Cons: Cannot parallelize; slower total wall-clock time

**Option B: Parallel agent translation**
- Spawn multiple agents to translate independent modules simultaneously (e.g., plan-generator and failure-classifier have no dependency)
- Pros: Faster wall-clock time
- Cons: Risk of interface mismatches at integration; harder to coordinate shared type definitions; contract divergence between agents

**Why Option B is not recommended:** Although all 8 Lash modules have zero cross-imports (each is fully self-contained; the CLI uses lazy imports inside handler functions), they share implicit conventions: the `_out()`/`_err()` output helpers, `vars()` serialization of dataclasses, and `default=str` JSON coercion. These conventions are only 8 lines of code but define the entire JSON contract surface. Parallel translation risks each agent making different assumptions about these conventions. Sequential translation lets each module inherit verified conventions from previously translated modules.

**Note on parallelization:** Steps 3-10 ARE parallelizable if the executor has completed Step 2 (shared types + conventions). The sequential recommendation is for convention safety, not import dependencies.

### Pre-Mortem (Deliberate Mode)

| # | Scenario | Likelihood | Mitigation |
|---|----------|-----------|------------|
| 1 | **JSON output format divergence** — Python `json.dumps(obj, indent=2)` produces different whitespace/key ordering than `JSON.stringify(obj, null, 2)`. Prompt files may use regex to parse output. | Medium | Define a `jsonOutput()` helper that normalizes output format. Compare Python and TS output for each subcommand in integration tests. |
| 2 | **Subprocess signal handling differences** — Node.js `child_process.spawn` handles SIGTERM/SIGKILL differently than Python `subprocess.Popen`. Worker cancel/timeout may behave differently. | Medium | platform-launcher.ts gets dedicated signal-handling integration tests. Test on both Linux and macOS. |
| 3 | **Atomic file write semantics** — Python's `os.rename()` is atomic on POSIX; Node.js `fs.renameSync()` is also atomic on POSIX but behaves differently on Windows. build-state.ts relies on atomic writes for crash recovery. | Low | Use write-to-temp + rename pattern explicitly. Add crash-recovery test that simulates interrupted writes. |
| 4 | **Async cascade** — `platform_launcher.py` uses `time.sleep()` and `Popen.wait(timeout=...)` which are blocking in Python but naturally async in Node.js. Going async in one function cascades `async/await` through callers up to cli.ts. | High | Decide sync/async strategy upfront in Step 2. Subprocess-heavy modules (platform-launcher, test-runner, worktree-manager) go async; pure computation modules (plan-generator, failure-classifier, config, build-state, task-packager) stay synchronous. |
| 5 | **ESM + Commander.js shebang interaction** — `#!/usr/bin/env node` + `"type": "module"` requires Node 18.19+ for stable ESM CLI support. Earlier Node 18.x versions have ESM loader quirks. | Low | Pin `engines.node` to `>=18.19.0` instead of `>=18.0.0`. |
| 6 | **Test fixture path resolution** — Python tests use `os.path.dirname(__file__)` for fixture paths. Vitest uses `import.meta.url` which differs in ESM. | Medium | Create a `tests/test-utils.ts` with a `fixtureDir()` helper using `import.meta.url` + `fileURLToPath`. Establish in Step 0. |

### Expanded Test Plan (Deliberate Mode)

| Level | Scope | Strategy |
|-------|-------|----------|
| **Unit** | Per-module tests (172 tests total) | 1:1 translation from pytest to Vitest. Each Python test case maps to one `it()` block. Mock subprocess calls with `vi.mock`. |
| **Integration** | CLI subcommand end-to-end | Invoke each of the 15 `lash` subcommands via `child_process.exec`, verify JSON stdout matches expected structure. Invoke `nopilot init`, verify files are copied correctly. |
| **E2E** | Full build cycle smoke test | Run `lash plan` → `lash package` → `lash test` on a minimal fixture project. Verify state transitions in build-state.json. |
| **Observability** | stdout/stderr separation | All subcommands: JSON output to stdout only, human-readable logs/errors to stderr only. Test that stdout is valid JSON for every subcommand. |

---

## Implementation Steps

### Step 0: Project Scaffold

**Files created/updated:**
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `.gitignore` (add `dist/`, `node_modules/`)
- `src/lash/` directory
- `tests/` directory

**Actions:**
1. Run `pnpm init` in NoPilot root
2. Install dependencies: `pnpm add commander` + `pnpm add -D typescript vitest`
3. Create `tsconfig.json` per design spec
4. Create `vitest.config.ts` with `root: '.'` and `include: ['tests/**/*.test.ts']`
5. Create directory structure: `src/lash/`, `tests/`
6. Create `tests/test-utils.ts` with `fixtureDir()` helper using `import.meta.url` + `fileURLToPath` (pre-mortem #6 mitigation)
7. Verify: `pnpm build` compiles (empty project), `pnpm test` runs (no tests yet)

**Verification:** `pnpm build && pnpm test` both exit 0.

---

### Step 1: Extract Lash Design Decisions

**Input:** Lash repo `specs/discover.json`, `specs/spec.json`
**Output:** `docs/lash-design-decisions.md`

**Actions:**
1. Read Lash `specs/discover.json` — extract `design_philosophy`, `constraints`, `selected_direction`, key `requirements`
2. Read Lash `specs/spec.json` — extract module dependency graph, interface contracts, architectural decisions
3. Write `docs/lash-design-decisions.md` with: design philosophy statements, module architecture rationale, key interface contracts, failure classification logic rationale

**Verification:** File exists and is readable. No automated test needed.

---

### Step 2: Define Shared Types & Conventions

**Files created:**
- `src/lash/types.ts`
- `src/lash/output.ts`

**Actions:**
1. Read all Python module source files to catalog JSON input/output structures
2. Define TypeScript interfaces for:
   - `LashConfig` — config.ts I/O
   - `BuildState`, `BuildEvent` (21 event types) — build-state.ts I/O
   - `ExecutionPlan`, `Batch`, `ModuleNode` — plan-generator.ts I/O
   - `FailureClassification`, `FailureLevel` (L0-L3) — failure-classifier.ts I/O
   - `TestResult` — test-runner.ts I/O
   - `WorktreeInfo`, `MergeResult` — worktree-manager.ts I/O
   - `TaskPackage` — task-packager.ts I/O
   - `PlatformInfo`, `WorkerProcess` — platform-launcher.ts I/O
   - `SubcommandResult` — shared CLI output envelope
3. Define `output.ts` with shared conventions:
   - `jsonOutput(data: unknown): string` — consistent JSON formatting with `JSON.stringify(data, replacer, 2)` where `replacer` handles Date → ISO string (mirrors Python's `default=str`)
   - `out(data: unknown): void` — write JSON to stdout (mirrors `_out()` in cli.py)
   - `err(message: string, code?: number): never` — write JSON error `{"error": msg}` to stderr AND call `process.exit(code)` (default 1). Return type `never` documents the exit semantics. This mirrors Python `_err()` which calls `sys.exit(code)` after printing. 20+ call sites in cli.py depend on this termination behavior.
4. **Sync/async strategy decision:**
   - **Synchronous modules** (pure computation / file I/O): config, build-state, plan-generator, failure-classifier, task-packager
   - **Async modules** (subprocess-heavy): platform-launcher, test-runner, worktree-manager
   - CLI handlers for async modules use `async` functions; Commander.js action handlers use `.action(async (...) => { ... })`
   - Entry point uses top-level `await` (supported in ESM Node 18.19+)
5. **Dataclass → plain object convention:** Python `@dataclass` types translate to TypeScript `interface` types. Modules construct plain objects conforming to these interfaces. Python `vars(instance)` in cli.py translates to passing the plain object directly to `jsonOutput()` — no class wrappers, no `toJSON()` methods. This preserves contract fidelity trivially since interfaces are structurally typed.

**Verification:** `pnpm build` compiles with no errors.

---

### Step 3: Translate config.ts (37 lines)

**Python source:** `lash/config.py`
**Files created:** `src/lash/config.ts`, `tests/config.test.ts`

**Actions:**
1. Read `lash/config.py`
2. Translate to TypeScript: config file discovery (`lash.config.json`), default values, merge logic
3. No dedicated `test_config.py` exists in Lash — config is tested indirectly via CLI tests. Write a minimal `tests/config.test.ts` covering config loading and default values.
4. Run tests

**Verification:** `pnpm test -- tests/config.test.ts` passes.

---

### Step 4: Translate build-state.ts (329 lines)

**Python source:** `lash/build_state.py`
**Files created:** `src/lash/build-state.ts`, `tests/build-state.test.ts`

**Actions:**
1. Read `lash/build_state.py`
2. Translate: atomic state file read/write, 21 event type handling, crash recovery logic, state resume
3. Key pattern: write-to-temp + rename for atomicity (pre-mortem #3 mitigation)
4. Translate `tests/test_build_state.py` to Vitest
5. Run tests

**Verification:** `pnpm test -- tests/build-state.test.ts` passes.

---

### Step 5: Translate plan-generator.ts (374 lines)

**Python source:** `lash/plan_generator.py`
**Files created:** `src/lash/plan-generator.ts`, `tests/plan-generator.test.ts`

**Actions:**
1. Read `lash/plan_generator.py`
2. Translate: topological sort (Kahn's algorithm), cycle detection, batch generation, tracer bullet selection
3. Pure algorithm — no subprocess calls, no I/O beyond JSON parse/stringify
4. Translate `tests/test_plan_generator.py` to Vitest
5. Run tests

**Verification:** `pnpm test -- tests/plan-generator.test.ts` passes.

---

### Step 6: Translate failure-classifier.ts (364 lines)

**Python source:** `lash/failure_classifier.py`
**Files created:** `src/lash/failure-classifier.ts`, `tests/failure-classifier.test.ts`

**Actions:**
1. Read `lash/failure_classifier.py`
2. Translate: regex pattern matching for L0-L3 classification, pattern registry, classification logic
3. Validate regex compatibility between Python `re` and JavaScript `RegExp` — flag any Python-only regex features (lookbehind support differs)
4. Translate `tests/test_failure_classifier.py` to Vitest
5. Run tests

**Verification:** `pnpm test -- tests/failure-classifier.test.ts` passes.

---

### Step 7: Translate test-runner.ts (262 lines)

**Python source:** `lash/test_runner.py`
**Files created:** `src/lash/test-runner.ts`, `tests/test-runner.test.ts`

**Actions:**
1. Read `lash/test_runner.py`
2. Translate: test framework auto-detection (pytest, npm test, go test, etc.), subprocess execution, result parsing
3. **Async module** — uses `child_process.exec` (promisified) or `child_process.spawn` for running external test commands. Returns `Promise<TestResult>`.
4. Translate `tests/test_test_runner.py` to Vitest
5. Run tests

**Verification:** `pnpm test -- tests/test-runner.test.ts` passes.

---

### Step 8: Translate worktree-manager.ts (272 lines)

**Python source:** `lash/worktree_manager.py`
**Files created:** `src/lash/worktree-manager.ts`, `tests/worktree-manager.test.ts`

**Actions:**
1. Read `lash/worktree_manager.py`
2. Translate: `git worktree add/remove`, branch management, merge operations
3. **Async module** — git operations via `child_process.exec` (promisified) or `child_process.spawn`. Returns `Promise<WorktreeInfo>` / `Promise<MergeResult>`.
4. Translate `tests/test_worktree_manager.py` to Vitest
5. Run tests

**Verification:** `pnpm test -- tests/worktree-manager.test.ts` passes.

---

### Step 9: Translate task-packager.ts (336 lines)

**Python source:** `lash/task_packager.py`
**Files created:** `src/lash/task-packager.ts`, `tests/task-packager.test.ts`

**Actions:**
1. Read `lash/task_packager.py`
2. Translate: `.lash/` directory generation, task.md rendering, interface extraction, test file selection
3. Heavy `fs` usage — `mkdirSync`, `writeFileSync`, `cpSync`
4. Translate `tests/test_task_packager.py` to Vitest
5. Run tests

**Verification:** `pnpm test -- tests/task-packager.test.ts` passes.

---

### Step 10: Translate platform-launcher.ts (511 lines)

**Python source:** `lash/platform_launcher.py`
**Files created:** `src/lash/platform-launcher.ts`, `tests/platform-launcher.test.ts`

**Actions:**
1. Read `lash/platform_launcher.py`
2. Translate: platform detection (claude, codex, opencode CLI availability), Worker process spawn/check/resume/cancel
3. Critical: signal handling (SIGTERM/SIGKILL) — pre-mortem #2 mitigation. Use `child_process.spawn` with explicit signal forwarding.
4. Preflight: detect CLI availability via `which` / `command -v`
5. Translate `tests/test_platform_launcher.py` to Vitest
6. Run tests

**Verification:** `pnpm test -- tests/platform-launcher.test.ts` passes.

---

### Step 11: Translate lash/cli.ts (432 lines)

**Python source:** `lash/cli.py`
**Files created:** `src/lash/cli.ts`, `tests/cli.test.ts`

**Actions:**
1. Read `lash/cli.py`
2. Translate: Commander.js program definition with 15 subcommands, argument parsing, JSON output formatting
3. Wire all modules together: each subcommand uses lazy imports and delegates to the corresponding module. Async subcommand handlers (platform-launcher, test-runner, worktree-manager) use `async` action functions.
4. Add `#!/usr/bin/env node` shebang for bin entry. The module-scope code must call `program.parseAsync(process.argv)` (not `program.parse()`) to support async action handlers. This is the TypeScript equivalent of Python's `__main__.py` → `cli.main()` entry point.
5. Translate `tests/test_cli_subcommands.py` to Vitest
6. Run tests

**Verification:** `pnpm test -- tests/cli.test.ts` passes.

---

### Step 12: Implement nopilot-cli.ts

**Files created:** `src/nopilot-cli.ts`, `tests/nopilot-cli.test.ts`

**Actions:**
1. Implement `nopilot init [dir]`:
   - **Asset resolution**: locate `commands/`, `schemas/`, `workflow.json` relative to the package's install directory using `import.meta.url` + `fileURLToPath` + `path.resolve(…, '..')`. This works for both global install (`npm i -g`) and local install (`pnpm add -D`), since assets are in the package root alongside `dist/`.
   - Copy `commands/*.md` → `<dir>/.claude/commands/`
   - Copy `schemas/*.json` → `<dir>/schemas/`
   - Copy `workflow.json` → `<dir>/`
   - Append Lash auto-trigger directive to `CLAUDE.md` / `AGENTS.md` / `opencode.md` (replicate `install.sh` logic). Directive must reference `commands/lash-build.md` (not the old `lash/prompts/` path).
   - `--force` flag for overwrite
   - Skip if target file already contains Lash directive (idempotent)
2. Implement `nopilot version`: read and print version from package.json
3. Implement stub commands:
   - `nopilot validate` → prints "Not yet implemented. Planned for V2." and exits 0
   - `nopilot preview` → prints "Not yet implemented. Planned for issue #21." and exits 0
4. Add `#!/usr/bin/env node` shebang
5. Write tests: verify init creates files, verify asset resolution from package root, verify idempotency, verify --force behavior

**Verification:** `pnpm test -- tests/nopilot-cli.test.ts` passes.

---

### Step 13: Migrate Prompt Files & Assets

**Actions:**
1. Copy NoPilot prompt files from `.claude/commands/` → `commands/`:
   - `discover.md`, `spec.md`, `build.md`, `critic.md`, `supervisor.md`, `visualize.md`
2. Copy ALL 7 Lash prompt files from Lash repo `lash/prompts/` → `commands/`, renaming non-`lash-` prefixed files:
   - `lash-build.md` (as-is)
   - `lash-tracer.md` (as-is)
   - `lash-batch.md` (as-is)
   - `lash-verify.md` (as-is)
   - `conflict_resolver.md` → `lash-conflict-resolver.md`
   - `orchestrator.md` → `lash-orchestrator.md`
   - `worker_instructions.md` → `lash-worker-instructions.md`
3. Global replacement pass 1 — CLI invocation: `python3 -m lash` → `lash` in all prompt files
4. Global replacement pass 2 — internal path references (5 occurrences across lash-build.md and lash-batch.md):
   - `lash/prompts/lash-tracer.md` → `commands/lash-tracer.md`
   - `lash/prompts/lash-batch.md` → `commands/lash-batch.md`
   - `lash/prompts/lash-verify.md` → `commands/lash-verify.md`
   - `lash/prompts/conflict_resolver.md` → `commands/lash-conflict-resolver.md`
   - `lash/prompts/lash-tracer.md` (in lash-batch.md) → `commands/lash-tracer.md`
5. Verify `schemas/` contains all 14 JSON Schema files (already in place for NoPilot)
6. Verify `workflow.json` is in place (already in NoPilot root)
7. Remove existing `lash/` directory from NoPilot root (leftover from prior Python install; source code now lives in `src/lash/`)
8. Update `.gitignore`: add `dist/` and `node_modules/`

**Verification:**
- `grep -r "python3" commands/` returns no matches
- `grep -r "lash/prompts/" commands/` returns no matches
- `ls commands/lash-*.md | wc -l` returns 7

---

### Step 14: Full Integration Verification

**Actions:**
1. `pnpm build` — TypeScript compiles with no errors
2. `pnpm test` — all tests pass (target: 172+ tests)
3. CLI smoke test: `node dist/lash/cli.js --help` prints help with all 15 subcommands
4. CLI smoke test: `node dist/nopilot-cli.js --help` prints help
5. Init smoke test: `node dist/nopilot-cli.js init /tmp/test-project` creates expected files
6. JSON output test: run each subcommand that doesn't require external state, verify stdout is valid JSON
7. **Golden output comparison** (one-time contract fidelity gate): Run both the Python version (`python3 -m lash`) and TypeScript version (`node dist/lash/cli.js`) with identical fixture inputs for at least these 5 critical subcommands: `plan`, `state create`, `state update`, `classify`, `package`. Diff the JSON output structures. Field names and value types must match; whitespace differences are acceptable.

**Verification:** All 7 checks pass.

---

### Step 15: Documentation & Cleanup

**Actions:**
1. Update `CLAUDE.md`: reflect new project structure, remove old Lash install references, add npm install instructions
2. Update `ROADMAP.md`: merge Lash ROADMAP items into NoPilot ROADMAP, mark migration as delivered
3. Remove old files no longer needed: `install.sh` references, old `.claude/commands/` copies of Lash prompts (now in `commands/`)
4. Prepare Lash repo archive: draft README update with redirect notice
5. Commit all changes

**Verification:** `pnpm build && pnpm test` still passes after cleanup.

---

## Step Dependency Graph

```
Step 0 (scaffold)
  ├→ Step 1 (design decisions)  [parallel with Step 2]
  └→ Step 2 (shared types + conventions)
       │
       ├→ Step 3  (config)             ─┐
       ├→ Step 4  (build-state)        ─┤
       ├→ Step 5  (plan-generator)     ─┤  ALL independent (zero cross-imports)
       ├→ Step 6  (failure-classifier) ─┤  Recommended sequential for convention
       ├→ Step 7  (test-runner)        ─┤  consistency, but parallelizable after
       ├→ Step 8  (worktree-manager)   ─┤  Step 2 establishes shared conventions.
       ├→ Step 9  (task-packager)      ─┤
       └→ Step 10 (platform-launcher)  ─┘
            │
            → Step 11 (lash cli — wires all modules, must be last)
              → Step 12 (nopilot cli)
                → Step 13 (prompt migration + cleanup)
                  → Step 14 (integration verification + golden output)
                    → Step 15 (documentation)
```

**Key:** Steps 3-10 all depend only on Step 2 (shared types), not on each other. The CLI (Step 11) depends on all modules being complete since it imports and wires them together via lazy imports. Sequential execution of Steps 3-10 is recommended per Option A rationale (convention safety) but is not required by import dependencies.

---

## ADR (Architecture Decision Record)

**Decision:** Merge Lash into NoPilot as a TypeScript runtime, distributed as a single npm package.

**Drivers:** Unified toolchain (Node.js already required by OMC), elimination of dual-repo maintenance overhead, enablement of future Node.js ecosystem features (Vite preview, ajv validation, xstate state machine).

**Alternatives considered:**
- Keep Lash as separate Python project — rejected: dual runtime dependency, distribution friction
- Rewrite Lash in JavaScript (no TypeScript) — rejected: Lash's complex JSON contracts benefit from type safety
- Monorepo with separate packages — rejected: unnecessary complexity for a single-developer project

**Why chosen:** Lowest maintenance burden, cleanest distribution story, aligned with ROADMAP V2 (enforcement layer) and issue #21 (preview server).

**Consequences:** Python version is abandoned; users who only have Python must install Node.js. Acceptable because target users (AI coding tool operators) already have Node.js. Subprocess-heavy modules (platform-launcher, test-runner, worktree-manager) are async; pure computation modules are synchronous. Windows signal handling (SIGTERM) is a known limitation — documented, not mitigated.

**Follow-ups:** issue #21 (frontend taste preview), ROADMAP V2 schema validation, CI/CD pipeline setup.
