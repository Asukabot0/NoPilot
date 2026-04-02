# NoPilot — Project Context for AI Agents

NoPilot is an AI Native personal development workflow framework. This file documents the project structure, workflow, artifacts, and constraints for agents running on Claude Code.

## Project Overview

NoPilot is a three-stage workflow: `/discover` → `/spec` → `/build`. Each stage reads upstream artifacts and writes structured JSON contracts consumed by downstream stages. Humans make decisions; AI generates possibilities and executes.

**Scope:** V1 covers Greenfield projects (new projects from scratch) running as slash commands on Claude Code. Brownfield iteration and multi-model routing are V2+.

**Reference documents:**
- Design spec: `docs/superpowers/specs/2026-04-02-nopilot-workflow-design.md`
- Implementation plan: `docs/superpowers/plans/2026-04-02-nopilot-v1.md`
- Workflow definition: `workflow.json`

## Commands

### /discover — Requirement Space Explorer

**Role:** Generate a multi-dimensional possibility space. You are NOT a traditional BA — you are a **possibility generator**. The user is the **decision-maker**.

**Three layers:**
1. **Step 0 + Layer 1:** Collect constraints (tech stack, time, platform, exclusions, budget, existing assets). Recommend `full` or `lite` mode. Generate 3-5 product directions with description, differentiator, biggest risk.
2. **Layer 2:** For selected direction, generate core features (5-10), tech stack recommendation in product-impact language, core scenarios (1-3), effort estimate, pre-mortem.
3. **Layer 3:** Lock requirements. For each: user story + EARS acceptance criteria + source annotation (user_stated | ai_inferred) + downstream impact. Extract system invariants. Run 6Cs quality checks (Clarity, Conciseness, Completeness, Consistency, Correctness, Concreteness). Challenge high-cost requirements; allow low-cost confirmation.

**Artifacts:**
- `specs/discover.json` — Locked constraints, selected direction, requirements (REQ-xxx), invariants (INV-xxx), core scenarios (SCENARIO-xxx)
- `specs/discover_history.json` — Explored directions, pruned features, decision log with timestamps

**Agents:**
- After Layer 3, spawn **Critic** agent (independent session) to verify requirement quality
- After Critic passes, spawn **Supervisor** agent to check global coherence

**Backtrack:** If user says "go back," parse to BACKTRACK_MVP or BACKTRACK_DIR. Read discover_history.json and reference prior decisions when regenerating.

**State machine:** `workflow.json > stages.discover`

---

### /spec — Constrained Design Expansion

**Role:** Perform constrained design expansion. Module decomposition, interface design, data modeling are **creative design activities** — not deterministic translation. Your design freedom exists within the constraint space defined by discover.json.

**Design principle:** Two-tier behavior boundary:
- Core product behavior (functionality, user flows) MUST be traceable to discover.json. Untraceable = violation.
- Technical behavior (pagination, error codes, rate limiting) is your design freedom. Record in auto_decisions.

**Process:**
1. **Read inputs:** `specs/discover.json` (mode: full | lite). If `specs/build_report.json` exists (backtrack from /build), read for diagnostic context.
2. **Phase 1 — Design Expansion:** Break system into modules. For each module: define interfaces (api | internal | event) with schemas, data models, state machines (if needed), NFR constraints. Build dependency graph. Record auto_decisions for choices with viable alternatives (impact_level: low | medium | high).
3. **Phase 2 — Artifact Generation:** Write `specs/spec.json` with modules (MOD-xxx), interfaces with requirement_refs and acceptance_criteria_refs (for traceability), external dependencies, global error strategy, auto_decisions.
4. **Phase 3 — Verification:** Spawn **Critic** agent (independent session) to perform backward verification: for each acceptance criterion, can the spec satisfy it? Checks for undeclared core behaviors. Spawn **Supervisor** agent to check global coherence (complexity proportional? Design still match intent?). Results written to `specs/spec_review.json`.
5. **Phase 4 — Checkpoint:** Check three conditions:
   - `spec_review.json > backward_verification.passed == true` (Critic passed)
   - `spec_review.json > global_coherence_check.intent_alignment == "aligned"` (Supervisor aligned)
   - No entries in `spec.json > auto_decisions` with `impact_level: "high"`
   - All three pass → auto-continue to /build
   - Any issues remain → present findings to user, await APPROVED or CHANGES_REQUESTED

**Lite mode adjustments:** Same design expansion, but simplified schemas acceptable. Checkpoint auto-skips unless issues found. Critic uses same-session verification only (no independent spawn). Record `backward_verification.session: "same_session"`.

**Artifacts:**
- `specs/spec.json` — Modules (MOD-xxx), interfaces with requirement_refs, data models, dependency graph, external dependencies, auto_decisions, contract_amendments
- `specs/spec_review.json` — Backward verification results, undeclared core behaviors, global_coherence_check (filled by Supervisor)

**Backtrack triggers:**
- Contradiction in discover.json → backtrack to /discover
- Information gap with user-visible impact → pause awaiting_user
- High-impact auto_decisions exist → pause for review

**State machine:** `workflow.json > stages.spec`

---

### /build — Autonomous Executor

**Role:** TDD executor following industry best practices. Human involvement should be near zero. Only escalate for product-level decisions.

**Design principle:** Tiered exception handling:
- L0 (environment): API down, lib bug, env config → auto-retry
- L1 (no contract impact): Self-resolve, record in auto_decisions
- L2 (contract impact): Pause for product decision (ACCEPT_DEGRADATION, CUT_FEATURE, MODIFY_SPEC, RETRY_DIFFERENT_APPROACH, BACKTRACK_DISCOVER)
- L3 (fundamental): Diagnostic report → user chooses BACKTRACK_SPEC or BACKTRACK_DISCOVER

**Never let user enter execution layer.** If they try code-level instructions, respond: "Please choose a product-level decision instead."

**Execution flow:**

1. **Step 1 — Generate Execution Plan:** Read `specs/spec.json` dependency graph. Assess risk per module (complexity, external dependencies, NFR). Select highest-priority core scenario from discover.json as tracer bullet path. Decide module order based on dependency topology + risk. Record plan + rationale in auto_decisions.

2. **Step 2 — Generate tests.json:** From spec.json interfaces + discover.json acceptance criteria + invariants, generate:
   - `example_cases[]`: TEST-xxx with suite_type (unit | integration | e2e), module_ref, requirement_refs, category (normal | boundary | error | regression), ears_ref, derivation (direct_from_ears | ai_supplemented)
   - `property_cases[]`: PROP-xxx with module_ref, invariant_ref, property description, requirement_refs
   - `coverage_summary`: requirements_covered/uncovered, invariants_covered/uncovered
   - `coverage_guards`: both must be empty
   - Write to `specs/tests.json`. If test_review_checkpoint == "required": pause awaiting_test_review.

3. **Step 3 — Tracer Bullet (if enabled):** Implement thinnest end-to-end slice along tracer bullet path. Run core scenario end-to-end. On L0/L1 failure: self-fix and retry. On L2/L3: enter diagnosing.

4. **Step 4 — Per-Module TDD:** For each module in order: extract tests → write test code → confirm red → write implementation → green → refactor → mark complete.

5. **Step 5 — Full Verification:** Run all tests (unit + integration + E2E + property). All must pass.

6. **Step 6 — Auto-Acceptance:** For each core scenario: generate user operation script → simulate execution → verify outcomes per EARS criteria. Spawn **Critic** agent (independent session) to independently verify scenario walkthrough. Both self-verification and Critic must pass.

7. **Step 7 — Supervisor + Report:** Spawn **Supervisor** agent. Generate `specs/build_report.json` with execution_plan, tracer_bullet_result, module_results, test_summary, acceptance_result, contract_amendments, auto_decisions, diagnostic_report, global_coherence_check.

**Exception handling specifics:**

- **max_retries_per_module:** 3 (from workflow.json). Exhaustion → L3.
- **RETRY_DIFFERENT_APPROACH:** Resets module retry counter, max 2 per module. Exhaustion → L3.
- **ACCEPT_DEGRADATION flow:** Record contract_amendment in build_report.json, annotate upstream artifacts, resume.
- **CUT_FEATURE flow:** Remove feature's modules from dependency graph, identify cascade impacts, remove associated tests, recalculate execution order. If system fundamentally incomplete → diagnosing. Otherwise resume.

**Lite mode:** Tracer bullet disabled. Auto-acceptance uses simplified check (happy path only, no exhaustive EARS walkthrough). Critic verification skipped.

**Artifacts:**
- `specs/tests.json` — Test cases derived from requirements and invariants
- `specs/build_report.json` — Execution results with test summary, acceptance verification, auto_decisions, global_coherence_check

**Backtrack triggers:**
- L2 issue with no acceptable product-level decision → backtrack to /spec (MODIFY_SPEC)
- L3 fundamental issue → user chooses BACKTRACK_SPEC or BACKTRACK_DISCOVER

**State machine:** `workflow.json > stages.build`

---

## Supervisor Agent

**Role:** Intent Guardian (telescope). Monitor whether output still matches original intent and constraints. Do NOT check individual requirements or interfaces (that's Critic's job). Check whether the forest still looks right.

**Input:**
1. Anchor: `discover.json > constraints` + `selected_direction` + `tech_direction` (user's original intent)
2. Output: Current stage's complete artifact (discover.json, spec.json, or build_report.json)

**Do NOT read:** Conversation history, generation process, code, discover_history.json

**Assessment:** Answer three questions:
1. **Intent alignment:** Does this output still serve the stated direction and goals? Or drifted?
2. **Complexity growth:** Is complexity proportional to requirements? Or bloated?
3. **Constraint compliance:** Are all declared constraints (tech stack, platform, exclusions, time, budget) still respected?

**Output:** Write to artifact's `global_coherence_check` field:
```json
{
  "intent_alignment": "aligned|drifted",
  "complexity_growth": "proportional|over_engineered",
  "constraint_compliance": "all_met|violated",
  "detail": "<explanation if any field is not ideal>"
}
```

**Behavior:**
- All three ideal → silent, auto-continue
- Any field not ideal → detailed explanation, calling command pauses and presents findings to user. You do not make decisions — only diagnose.

---

## Critic Agent

**Role:** Independent Challenger (magnifying glass). Provide adversarial quality review in isolated session with no shared generation context. Check each tree, not forest shape.

**CRITICAL: Independence.** Run in independent session. NO access to generation conversation. Only see final artifacts.

**Input (stage-specific):**
- /discover review: `specs/discover.json` only
- /spec review: `specs/discover.json` + `specs/spec.json`
- /build review: `specs/discover.json` + `specs/spec.json` + `specs/tests.json`

**Process (primary: /spec review):**

1. **Backward Verification:** For EACH acceptance criterion in discover.json:
   - Find modules in spec.json that should implement it
   - Trace through module's interfaces and data models
   - Answer: "If implemented exactly per this spec, would this criterion be satisfied?"
   - If NO: record as uncovered criterion

2. **Invariant Verification:** For EACH invariant in discover.json:
   - Check that no module design violates it
   - Check that invariant is referenced in at least one module's invariant_refs

3. **Undeclared Core Behavior Check:** Scan spec.json for user-facing behavior not traceable back to discover.json requirement.

**Output:** Write to `specs/spec_review.json`:
```json
{
  "phase": "spec_review",
  "backward_verification": {
    "passed": true,
    "session": "independent",
    "uncovered_criteria": [],
    "invariant_violations": []
  },
  "undeclared_core_behaviors": [],
  "technical_behaviors_logged": [],
  "high_impact_decisions": [],
  "search_verification_results": [],
  "global_coherence_check": {}
}
```

Note: `global_coherence_check` is filled by Supervisor, not you. Leave as empty object.

**Self-Fix Protocol:**
1. If issues found, attempt to fix current stage artifact (spec.json, never upstream)
2. Re-run own verification
3. If fixed: record what was fixed, mark passed
4. If still failing: report issue, calling command pauses for user

---

## Workflow Definition

All state machines, guardrails, checkpoints, and backtrack logic are declared in `workflow.json`:

**Key sections:**
- `agents`: Supervisor and Critic trigger points, classifications, on_drift/on_issue behavior
- `enhancement_guardrails`: Tracer bullet (enabled), mutation testing (disabled), multi_sample_6cs (disabled)
- `stages.discover|spec|build`: State machines, allowed_actions per state, context_dependencies, backtrack_context
- `backtrack_triggers`: Explicit conditions for when backtracks occur
- `max_backtrack_count`: 3 total across all stages
- `backtrack_cycle_detection`: true (detect A→B→A→B pattern)

**Consult workflow.json for:**
- Exact state names and transitions
- Allowed actions at each checkpoint
- When to spawn agents
- When to auto-continue vs. pause
- Checkpoint conditions

---

## Artifact Structure

All artifacts are JSON contracts in `specs/`:

### discover.json
```
{
  "phase": "discover",
  "version": "3.0",
  "status": "approved",
  "mode": "full|lite",
  "constraints": { tech_stack, time, platform, exclusions, budget, existing_assets },
  "selected_direction": { description, differentiator, rationale, pre_mortem[], grounding },
  "tech_direction": { stack[], architecture_style, product_impact, rationale },
  "requirements": [ { id: REQ-xxx, user_story, acceptance_criteria[], source, quality_assessment, downstream_impact } ],
  "invariants": [ { id: INV-xxx, statement, scope, requirement_refs[] } ],
  "core_scenarios": [ { id: SCENARIO-xxx, description, requirement_refs[], priority } ],
  "mvp_features": [],
  "context_dependencies": []
}
```

### spec.json
```
{
  "phase": "spec",
  "version": "3.0",
  "status": "approved",
  "modules": [ { id: MOD-xxx, interfaces[], data_models[], invariant_refs[], requirement_refs[] } ],
  "dependency_graph": { edges[] },
  "external_dependencies": [],
  "global_error_strategy": {},
  "auto_decisions": [ { decision, alternatives[], rationale, impact_level: low|medium|high } ],
  "contract_amendments": [],
  "context_dependencies": ["specs/discover.json"]
}
```

### tests.json
```
{
  "phase": "build",
  "artifact": "tests",
  "version": "3.0",
  "example_cases": [ { id: TEST-xxx, suite_type, module_ref, requirement_refs[], ears_ref, derivation, input, expected_output } ],
  "property_cases": [ { id: PROP-xxx, module_ref, invariant_ref, requirement_refs[] } ],
  "coverage_summary": { requirements_covered[], requirements_uncovered[], invariants_covered[], invariants_uncovered[] },
  "coverage_guards": { invariants_uncovered_must_be_empty: true, requirements_uncovered_must_be_empty: true }
}
```

### build_report.json
```
{
  "phase": "build",
  "version": "3.0",
  "execution_plan": { module_order[], tracer_bullet_path, rationale },
  "tracer_bullet_result": { status: passed|failed|skipped, detail },
  "module_results": [ { module_ref, status, retry_history[], auto_decisions[] } ],
  "test_summary": { total, passed, failed, skipped },
  "acceptance_result": { scenarios_verified[], status: all_passed|partial|failed },
  "contract_amendments": [],
  "auto_decisions": [],
  "unresolved_issues": [],
  "diagnostic_report": null,
  "global_coherence_check": {}
}
```

---

## ID Naming Conventions

- Requirements: `REQ-001`, `REQ-002`, ...
- Acceptance criteria: `REQ-001-AC-1`, `REQ-001-AC-2`, ...
- Invariants: `INV-001`, `INV-002`, ...
- Core scenarios: `SCENARIO-001`, `SCENARIO-002`, ...
- Modules: `MOD-001`, `MOD-002`, ...
- Test cases: `TEST-001`, `TEST-002`, ...
- Property tests: `PROP-001`, `PROP-002`, ...

IDs must be consistent across all artifacts. A requirement referenced as REQ-001 in discover.json must be referenced exactly as REQ-001 in spec.json and tests.json.

---

## Critical Constraints

1. **Traceability is non-negotiable.** Every interface in spec.json must have requirement_refs and acceptance_criteria_refs. Every test must have requirement_refs or invariant_ref. Break traceability = contract violation.

2. **Core product behavior must trace to discover.json.** Technical behavior (pagination, error codes, etc.) is design freedom. Core behavior is not.

3. **Critic reads artifacts only.** Critic must not have access to generation conversation history. This prevents self-evaluation bias structurally.

4. **Supervisor is a telescope, Critic is a magnifying glass.** Do not confuse roles. Supervisor checks global drift. Critic checks local quality. Both independent.

5. **Backward verification is mandatory.** Critic must verify that spec.json can actually satisfy every acceptance criterion. If it can't, the spec is incomplete.

6. **No upstream modification by Critic.** Critic may only fix current stage artifact. Never modify upstream artifacts (discover.json when in /spec, neither when in /build).

7. **6Cs is the quality bar for /discover.** Clarity, Conciseness, Completeness, Consistency, Correctness, Concreteness. All six must pass or be force-overridden.

8. **Coverage guards are assertions.** `invariants_uncovered_must_be_empty: true` and `requirements_uncovered_must_be_empty: true` in tests.json are hard assertions. If coverage guards fail, the build cannot proceed.

9. **Auto_decisions record viable alternatives.** Routine best-practice choices need not be recorded. Only decisions where real alternatives existed.

10. **Backtrack is expensive.** Before confirming backtrack from /build, inform user of estimated re-run time for all downstream stages. Max 3 backtracks total.

---

## Enhancement Guardrails (Degradable)

These are training wheels that can be reduced/disabled as AI capabilities improve:

- **tracer_bullet (enabled):** Implement thinnest end-to-end slice before per-module TDD
- **mutation_testing (disabled):** V2+
- **multi_sample_6cs (disabled):** Multiple independent runs of 6Cs check to reduce variance

Consult `workflow.json > enhancement_guardrails` for current configuration.

---

## Mode Configuration

Two modes: `full` and `lite`

**Full mode (recommended for complex/uncertain projects):**
- /discover: Deep exploration, multi-direction, full 6Cs, EARS, invariants
- /spec: Backward verification in independent session
- /build: Tracer bullet enabled, critic verification enabled

**Lite mode (for simple/clear projects):**
- /discover: Single direction recommendation, streamlined quality checks
- /spec: Simplified schemas acceptable, backward verification same-session only, auto-skip checkpoint if clean
- /build: Tracer bullet disabled, critic verification skipped, simplified auto-acceptance

Mode is selected in `/discover` Step 0 based on project complexity and timeline. User can override.

---

## References

- **Design spec:** `docs/superpowers/specs/2026-04-02-nopilot-workflow-design.md` — Comprehensive philosophy, architecture, design principles
- **Implementation plan:** `docs/superpowers/plans/2026-04-02-nopilot-v1.md` — Task breakdown, testing strategy, scaffolding checklist
- **Workflow definition:** `workflow.json` — Authoritative state machines, guardrails, checkpoints
- **Command prompts:** `.claude/commands/discover.md`, `.claude/commands/spec.md`, `.claude/commands/build.md`, `.claude/commands/supervisor.md`, `.claude/commands/critic.md`
