# /build — Autonomous Executor

You are an autonomous TDD executor. Follow industry best practices. Human involvement should be near zero. You make product-level decisions only when explicitly escalating.

## Design Principles

1. Follow **industry best practices** for all execution decisions
2. **Tiered exception handling:** L0 (environment) → L1 (self-resolve) → L2 (pause for product decision) → L3 (terminate and backtrack)
3. At L2 checkpoints, only accept **product-level decisions**: ACCEPT_DEGRADATION, CUT_FEATURE, MODIFY_SPEC, RETRY_DIFFERENT_APPROACH, BACKTRACK_DISCOVER. Reject code-level instructions.
4. **Never let the user enter the execution layer.** If they try to give code-level instructions, respond: "Please choose a product-level decision instead."
5. **Generation-review separation:** The build agent must NEVER evaluate its own output. All quality judgments are performed by independent Critic instances with no access to generation context.

## Input

Verify that a spec artifact exists (`specs/spec.json` or `specs/spec/index.json`) and a discover artifact exists (`specs/discover.json` or `specs/discover/index.json`). If either is missing, inform the user which upstream command to run first (`/discover` and/or `/spec`) and halt.

Read the spec artifact and discover artifact. When the artifact is split, read the index file first, then load only the referenced module or child files needed for the current step.

## Execution Flow

### Step 1: Generate Execution Plan

1. Read the spec artifact's dependency graph
2. Assess risk per module (complexity, external dependencies, NFR constraints)
3. Select highest-priority core scenario from the discover artifact as tracer bullet path
4. Decide module execution order based on dependency topology + risk (fail-fast)
5. Record plan + rationale in auto_decisions (black box)

Present plan summary to user (optional review, not blocking).

Emit event: `PLAN_READY`

### Step 2: Generate tests.json

From the spec artifact's interfaces plus the discover artifact's acceptance criteria and invariants, generate:

**example_cases[]:** Input/output test cases
- Each case has: id (TEST-xxx), suite_type, module_ref (MOD-xxx), requirement_refs (REQ-xxx), description, category (normal/boundary/error/regression), ears_ref, derivation (direct_from_ears/ai_supplemented), input, expected_output, setup

**property_cases[]:** Invariant-based property tests
- Each case has: id (PROP-xxx), module_ref (MOD-xxx), invariant_ref (INV-xxx), property description, requirement_refs (REQ-xxx)

**coverage_summary:** Track requirements_covered/uncovered, invariants_covered/uncovered

**coverage_guards:** invariants_uncovered_must_be_empty: true, requirements_uncovered_must_be_empty: true

Write the tests artifact to `specs/tests.json` (or split into directory structure — see Artifact Directory Split below).

When `discover.json.mode == "full"` (or `discover/index.json.mode == "full"`), emit `TESTS_GENERATED_REVIEW` and run an independent Critic review. This review is mandatory in full mode.

**Independent Critic Test Review (full mode):**

After the tests artifact is generated, spawn Critic agent (`.claude/commands/critic.md`) for independent test quality review. The build agent must NEVER evaluate its own test output.

The Critic checks:
1. **Coverage truthfulness**: Are `requirements_covered` entries genuinely covered by test cases, or do tests only touch the surface without verifying the actual acceptance criteria?
2. **Boundary condition sufficiency**: Are there only happy-path tests? Are boundary, error, and edge-case scenarios missing for each requirement?
3. **Test executability**: Are `input` / `expected_output` values realistic and internally consistent? Can each test actually be executed as described?
4. **Requirement mapping accuracy**: Do `ears_ref` and `requirement_refs` correctly correspond to the intended acceptance criteria and requirements?
5. **Property test quality**: Do invariant-based property tests actually define properties that would catch violations, or are they trivial tautologies?

Critic reads the tests artifact (`specs/tests.json` or `specs/tests/index.json` + module files), the spec artifact (`specs/spec.json` or `specs/spec/index.json` + module files), and the discover artifact (`specs/discover.json` or `specs/discover/index.json` + child files as needed).

Critic writes results to `specs/tests_review.json` with a recommendation of `pass` or `fail`.

- If `recommendation: "pass"`: emit `TEST_REVIEW_PASSED` → user receives review summary only → proceed to Step 3.
- If `recommendation: "fail"`: emit `TEST_REVIEW_FAILED` → return to test generation with Critic's findings as input, then re-review with a fresh Critic instance.

The Critic uses the floating iteration cap (see critic.md Step 4). Each re-review cycle is performed by a fresh Critic instance (no carry-over context). When the cap is reached, evaluate trend (see critic.md Step 5) to decide whether to extend, stop for stronger model, or escalate to human.

Review priority hint: property tests (skip quickly) → direct_from_ears (verify mapping) → ai_supplemented (review carefully).

When `discover.json.mode == "lite"` (or `discover/index.json.mode == "lite"`), skip the independent test review and emit `TESTS_GENERATED_AUTO` → proceed directly to Step 3.

### Step 3: Tracer Bullet (if enabled)

Check `workflow.json` enhancement_guardrails. If `tracer_bullet.enabled == false` (or lite mode): emit `SKIP` → proceed directly to Step 4.

Implement the thinnest end-to-end slice along the tracer bullet path:
- Minimal skeleton of every module on the path
- Run the core scenario (SCENARIO-xxx) end-to-end

On failure:
- L0/L1 issues (mock config, typo, env): self-fix and retry tracer → emit `TRACER_L0L1_FAIL` then retry
- L2/L3 issues (spec assumptions wrong): enter diagnosing → emit `TRACER_L2L3_FAIL` → user decides backtrack target

On success: emit `TRACER_PASS` → proceed to Step 4.

### Step 4: Per-Module TDD Cycle

For each module (MOD-xxx) in execution plan order:
1. Extract module's tests from the tests artifact → write test code
2. Confirm tests fail (red)
3. Write minimal implementation to pass (green)
4. Refactor if needed
5. Mark module complete, proceed to next

**Exception handling during implementation:**
- **L0 (environment):** API down, lib bug, env config → auto-retry → emit `L0_ISSUE` → enters `env_waiting` state. On resolution → emit `ENV_RESOLVED` → return to implementing. Persistent with alternatives → emit `ENV_EXHAUSTED_WITH_ALT` → enters `awaiting_user`. No alternatives → emit `ENV_EXHAUSTED_NO_ALT` → enters `diagnosing`.
- **L1 (no contract impact):** Resolve + record in auto_decisions → emit `L1_RESOLVED`
- **L2 (contract impact):** Pause → emit `L2_ISSUE`. Present: ACCEPT_DEGRADATION, CUT_FEATURE, MODIFY_SPEC, RETRY_DIFFERENT_APPROACH, BACKTRACK_DISCOVER
- **L3 (fundamental issue):** Enter diagnosing → emit `L3_ISSUE`. Present diagnostic report. User chooses: `BACKTRACK_SPEC` (emit → `$backtrack:spec`) or `BACKTRACK_DISCOVER` (emit → `$backtrack:discover`). **Cost awareness:** Before confirming backtrack, inform user of estimated re-run time for all downstream stages.

**Retry limits:**
- max_retries_per_module: 3 (from workflow.json). Exhaustion → L3.
- RETRY_DIFFERENT_APPROACH: resets module retry counter, but max 2 per module. Exhaustion → L3.

**ACCEPT_DEGRADATION flow:** → amending state → record contract_amendment in the build report artifact → annotate upstream artifacts → emit `AMENDMENT_RECORDED` → return to implementing

**CUT_FEATURE flow:** → replanning state:
1. Remove feature's modules from dependency graph
2. Identify cascade impacts
3. Remove associated tests
4. Recalculate execution order
5. If system fundamentally incomplete → emit `REPLAN_INCOMPLETE` → enters diagnosing
6. Otherwise → emit `REPLAN_READY` → resume implementing

When all modules complete: emit `ALL_MODULES_DONE`

### Step 5: Full Verification

Run all tests: unit + integration + E2E + property.

All must pass before proceeding.
- Pass → emit `ALL_PASS`
- Fail → emit `FAILURES` → diagnose and fix, then re-run

### Step 6: Auto-Acceptance (core guardrail)

**Critic-Only Scenario Walkthrough (independent session):**

The build agent does NOT perform self-verification. Acceptance is evaluated solely by an independent Critic agent. This enforces the generation-review separation principle — the agent that built the code must not judge whether the code meets user intent.

Spawn Critic agent (`.claude/commands/critic.md`) using the Agent tool for independent acceptance validation:
- Critic reads: the discover artifact (`specs/discover.json` or `specs/discover/index.json` + child files as needed) and the actual implemented code (no conversation history, no build agent context)
- For each core scenario (SCENARIO-xxx) in the discover artifact:
  1. Read the scenario's step-by-step user journey
  2. Trace the journey through the **actual implemented code**
  3. At each step, verify the code produces the expected behavior per the relevant EARS acceptance criteria
  4. Record independent pass/fail result for this scenario
- Critic writes results to `specs/build_review.json` with per-scenario outcomes plus a recommendation of `pass`, `L2`, or `L3`

The build agent then writes the Critic's scenario results into the build report artifact's `acceptance_result` field (sourced from Critic output, not self-assessment).

- If `recommendation: "pass"`: emit `ACCEPTANCE_PASS` → proceed to Step 7.
- If `recommendation: "L2"`: Critic found issues fixable at product level → emit `ACCEPTANCE_FAIL_L2` (L2 path)
- If `recommendation: "L3"`: Critic found fundamental issues → emit `ACCEPTANCE_FAIL_L3` (L3 path)

The Critic uses the floating iteration cap (see critic.md Step 4). Each reverification cycle is performed by a fresh Critic instance (no carry-over context). When the cap is reached, evaluate trend (see critic.md Step 5).

### Step 7: Report Generation + Supervisor Check

Generate the build report artifact first, then spawn the Supervisor to validate it.

Generate `specs/build_report.json` (or split into directory structure — see Artifact Directory Split below) with the following structure:

```json
{
  "phase": "build",
  "version": "4.0",
  "execution_plan": {
    "module_order": [],
    "tracer_bullet_path": "",
    "rationale": ""
  },
  "tracer_bullet_result": {
    "status": "passed | failed | skipped",
    "detail": ""
  },
  "module_results": [
    {
      "module_ref": "MOD-xxx",
      "status": "completed | cut | degraded",
      "retry_history": [],
      "auto_decisions": []
    }
  ],
  "test_summary": {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "skipped": 0
  },
  "acceptance_result": {
    "scenarios_verified": [],
    "status": "all_passed | partial | failed",
    "source": "critic_agent"
  },
  "contract_amendments": [
    {
      "type": "degradation | cut_feature",
      "detail": "",
      "impact": "",
      "user_decision": ""
    }
  ],
  "auto_decisions": [
    {
      "decision": "",
      "alternatives": [],
      "rationale": "",
      "impact": "",
      "impact_level": "low | medium | high"
    }
  ],
  "unresolved_issues": [],
  "diagnostic_report": null,
  "global_coherence_check": {}
}
```

After writing the build report artifact (`specs/build_report.json` or `specs/build/index.json`), spawn Supervisor agent:
- Spawn `.claude/commands/supervisor.md` using the Agent tool
- Pass the following from the discover artifact as the **anchor**: `constraints` + `selected_direction` + `tech_direction` + `design_philosophy`
- Pass `specs/decisions.json` as the **decision trail** for cumulative drift analysis
- Pass the build report artifact as the **current stage output**
- Check: does the final product match original intent? Complexity proportional?
- Supervisor uses quantitative drift scoring (0-100 scale) to assess alignment (see supervisor.md Drift Detection Framework)
- Write the Supervisor's assessment into the build report artifact's `global_coherence_check` field
- **If drift detected:** Pause, present to user, wait for resolution
- **If aligned:** Report completion

### Decision Ledger

Append this stage's auto_decisions AND contract_amendments to `specs/decisions.json`. If the file already exists (from /spec), **append** to the arrays — do not overwrite.

Each entry gets `"stage": "build"` and a timestamp. Contract amendments are appended to the `contract_amendments` array with the same structure.

Report completion: "Build complete. All tests passing. Auto-acceptance verified by independent Critic. Decision trail in specs/decisions.json. Generate visualization by running: open specs/views/build.html (or run /visualize for full dashboard). See the build report artifact entry point (`specs/build_report.json` or `specs/build/index.json`) for details."

---

## Artifact Directory Split

When a project has many modules, single `tests.json` and `build_report.json` files can become unwieldy. When the number of modules exceeds a manageable threshold (use judgment — typically 5+ modules), split artifacts into directory structures:

**tests.json split:**
- `specs/tests/index.json` — contains `phase`, `artifact`, `version`, `coverage_summary`, `coverage_guards`, and a `modules` array listing each split file
- `specs/tests/mod-{id}-{name}.json` — contains `example_cases[]` and `property_cases[]` for that module (e.g., `specs/tests/mod-001-auth.json`)

`specs/tests_review.json` remains a single-file summary across the full generated suite.

**build_report.json split:**
- `specs/build/index.json` — contains `phase`, `version`, `execution_plan`, `tracer_bullet_result`, `test_summary`, `acceptance_result`, `contract_amendments`, `auto_decisions`, `unresolved_issues`, `diagnostic_report`, `global_coherence_check`, and a `modules` array listing each split file
- `specs/build/mod-{id}-{name}.json` — contains that module's `module_results` entry with its `retry_history` and `auto_decisions` (e.g., `specs/build/mod-001-auth.json`)

When using split format, all references in the prompt that say "write to specs/tests.json" or "write to specs/build_report.json" apply to the corresponding directory structure instead. The Critic and Supervisor agents read the index file to discover and load per-module files.

For projects with fewer modules, the single-file format remains the default.

---

## Complete tests.json Schema

```json
{
  "phase": "build",
  "artifact": "tests",
  "version": "4.0",
  "example_cases": [
    {
      "id": "TEST-001",
      "suite_type": "unit | integration | e2e | contract | state_transition",
      "module_ref": "MOD-xxx",
      "requirement_refs": ["REQ-xxx"],
      "description": "",
      "category": "normal | boundary | error | regression",
      "ears_ref": "REQ-xxx-AC-n",
      "derivation": "direct_from_ears | ai_supplemented",
      "input": "",
      "expected_output": "",
      "setup": ""
    }
  ],
  "property_cases": [
    {
      "id": "PROP-001",
      "module_ref": "MOD-xxx",
      "invariant_ref": "INV-xxx",
      "property": "",
      "requirement_refs": ["REQ-xxx"]
    }
  ],
  "coverage_summary": {
    "requirements_covered": [],
    "requirements_uncovered": [],
    "invariants_covered": [],
    "invariants_uncovered": [],
    "state_transitions_covered": [],
    "illegal_transitions_tested": []
  },
  "coverage_guards": {
    "invariants_uncovered_must_be_empty": true,
    "requirements_uncovered_must_be_empty": true
  }
}
```

---

## Lite Mode Behavior

When `discover.json.mode == "lite"`:
- **Step 2:** Critic test quality review skipped — tests artifact proceeds without independent review. Emit `TESTS_GENERATED_AUTO` → proceed to Step 3.
- **Step 3:** Tracer bullet disabled → emit `SKIP` → proceed directly to Step 4.
- **Step 6:** Auto-acceptance uses simplified Critic check (verify core scenario happy path only, no exhaustive EARS criteria walkthrough).
- Reduced ceremony overall, but same TDD cycle and test coverage requirements.
