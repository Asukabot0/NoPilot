---
name: spec
description: Constrained design expansion — converts requirements into modular architecture specs
---
<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=CRITIC_PATH%> = platform path to critic skill, <%=SUPERVISOR_PATH%> = platform path to supervisor skill -->

# /spec — Constrained Design Expansion

> **[执行前确认]** 如果此 skill 是因关键词匹配自动加载的，请先询问："检测到你可能需要进入 /spec 流程，要现在开始吗？" 仅在用户确认后继续。若用户显式输入 `/spec`、`进 spec`、`开始 spec` 等阶段指令，视为已确认，直接继续。
> **[纠偏恢复]** 当用户指出 spec 流程偏差、遗漏步骤或阶段判断错误时，MUST 重新锚定权威流程后再继续：`Use the Skill tool to load: commands/spec/recovery.md`

You are performing constrained design expansion. Module decomposition, interface design, and data modeling are **creative design activities** — not deterministic translation. Your design freedom exists within the constraint space defined by discover.json.

## Design Principles

1. **Two-tier behavior boundary:**
   - Core product behavior (functionality, user flows) MUST be traceable to discover.json. Untraceable core behavior is a violation.
   - Technical behavior (pagination, error codes, rate limiting) is your design freedom. Record in auto_decisions.
2. Follow **industry best practices** for execution-layer decisions
3. Only record auto_decisions where **viable alternatives existed**. Routine best-practice choices need not be recorded.
4. **Never self-resolve contradictions** in discover.json — report and recommend backtrack

## Input

Verify that a discover artifact exists (`specs/discover.json`, `specs/discover/index.json`, `specs/features/feat-{featureSlug}/discover.json`, or `specs/features/feat-{featureSlug}/discover/index.json`). If missing, inform the user: "Run /discover first to generate the discover artifact." and halt.

Read the discover artifact from its artifact root. Use that same artifact root for all `/spec` outputs (`spec.json`, `spec_review.json`, and `decisions.json`). Before Phase 1, read the matching `discover_review.json` from that root (`specs/discover_review.json` or `specs/features/feat-{featureSlug}/discover_review.json`). If it is missing, or if any of `6cs_audit.passed`, `invariant_verification.passed`, `acceptance_criteria_verification.passed`, or `coverage_verification.passed` is not `true`, or if `global_coherence_check.intent_alignment != "aligned"`, inform the user: "Finish `/discover` review before running `/spec`." and halt.

If the discover artifact is split, read `index.json` first, then load `requirements.json`, `scenarios.json`, and `history.json` as needed. Check the artifact's `mode` to determine full or lite behavior.
If `specs/build_report.json` or `specs/build/index.json` exists (backtrack from /build), read it too for diagnostic context.

### Feature Mode: Code Awareness

When `mode=feature` (i.e., the discover artifact is at `specs/features/feat-xxx/discover.json`):

1. Read the project profile L1 layer at `.nopilot/profile/l1-arch.json` for existing module and interface context.
2. Before designing any new module interface, check L1 for existing modules that may already implement or overlap with the required behavior — avoid re-implementing or creating conflicting interfaces.
3. When a new module must call or extend an existing module, reference the existing module by name and path (from L1 `modules[]`) in the spec's `dependency_graph`.
4. If L1 is unavailable (profile does not exist), proceed in standard greenfield mode — no code awareness required.

This step applies only when `mode=feature`. In greenfield mode, skip this step entirely (INV-001).

## Process

### Phase 1: Design Expansion

Emit event: `expanding` (initial state)

Read the discover artifact and expand it into module-level specifications:

1. **Module decomposition:** Break the system into modules with clear single responsibilities
2. **Interface design:** For each module, define interfaces (api / internal / event) with schemas
3. **Data models:** Entity definitions with fields, types, constraints, relationships
4. **State machines:** For modules with complex state flows (optional)
5. **Dependency graph:** Module-to-module dependencies (calls / subscribes / depends)
6. **External dependencies:** Third-party libraries, APIs, cloud services with test strategies
7. **Non-functional constraints:** Performance, security, other — only for modules with special requirements
8. **Global error strategy:** API error format, external service handling, logging

For each design decision where viable alternatives existed, record in auto_decisions with impact_level (low/medium/high).

If you discover contradictions in discover.json: STOP, report the contradiction, recommend backtrack to /discover. Emit event: `CONTRADICTION` → triggers `$backtrack:discover`.

If you encounter information gaps:
- No user-visible impact + obvious fill → auto-fill, record in auto_decisions. Emit event: `L0_ISSUE` (self-loop in expanding).
- User-visible impact or multiple options → pause, present options to user. Emit event: `GAP_HIGH_IMPACT` → enters `awaiting_user`. After user decides → emit `USER_DECISION` → return to expanding.

### Phase 2: Artifact Generation

```
Use the Skill tool to load: commands/spec/schema.md (Phase 2 artifact generation)
```

**Error handling:** If `commands/spec/schema.md` cannot be found, stop immediately and output:
> "Missing sub-skill: `commands/spec/schema.md` — expected at `<absolute path>`. Run `nopilot doctor` to repair your installation, then re-run `/spec`."

### Phase 3: Independent Review (Critic + Supervisor)

```
Use the Skill tool to load: commands/spec/review-runner.md (Phase 3 critic + supervisor dispatch)
```

**Error handling:** If `commands/spec/review-runner.md` cannot be found, stop immediately and output:
> "Missing sub-skill: `commands/spec/review-runner.md` — expected at `<absolute path>`. Run `nopilot doctor` to repair your installation, then re-run `/spec`."

### Phase 4: Checkpoint Decision

```
Use the Skill tool to load: commands/spec/checkpoint.md (Phase 4 three-condition check)
```

### Phase 5: Decision Ledger

```
Use the Skill tool to load: commands/spec/decisions.md (Phase 5 decision ledger append)
```

## Lite Mode Behavior

When `discover.json.mode == "lite"`:
- **Phase 1:** Same design expansion, but simplified schemas are acceptable (fewer interface details, optional state machines)
- **Phase 3:** Checkpoint auto-skips unless Supervisor or Critic finds issues. Critic uses same-session backward verification only (no independent session spawn). This is an **intentional lite-mode exemption** from the generation-review separation principle — lite mode trades review rigor for speed. Record `backward_verification.session: "same_session"` in spec_review.json.
- **Phase 4:** Auto-continue unless issues are found. No pause for user review by default.
