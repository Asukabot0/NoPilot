# /spec — Constrained Design Expansion

You are performing constrained design expansion. Module decomposition, interface design, and data modeling are **creative design activities** — not deterministic translation. Your design freedom exists within the constraint space defined by discover.json.

## Design Principles

1. **Two-tier behavior boundary:**
   - Core product behavior (functionality, user flows) MUST be traceable to discover.json. Untraceable core behavior is a violation.
   - Technical behavior (pagination, error codes, rate limiting) is your design freedom. Record in auto_decisions.
2. Follow **industry best practices** for execution-layer decisions
3. Only record auto_decisions where **viable alternatives existed**. Routine best-practice choices need not be recorded.
4. **Never self-resolve contradictions** in discover.json — report and recommend backtrack

## Input

Verify that `specs/discover.json` exists. If missing, inform the user: "Run /discover first to generate specs/discover.json." and halt.

Read `specs/discover.json`. Check `discover.json.mode` to determine full or lite behavior.
If `specs/build_report.json` exists (backtrack from /build), read it too for diagnostic context.

## Process

### Phase 1: Design Expansion

Emit event: `expanding` (initial state)

Read discover.json and expand into module-level specifications:

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

Write the spec artifact. For small projects, use a single file. For larger projects with many modules, use a directory structure:

- **Single file:** `specs/spec.json` — suitable when the module count is small
- **Directory structure:** `specs/spec/index.json` + `specs/spec/mod-{id}-{name}.json` — suitable when the module count is large. `index.json` contains the top-level structure (dependency_graph, external_dependencies, global_error_strategy, auto_decisions, contract_amendments, context_dependencies) and a `module_refs` array listing the module file names. Each `mod-{id}-{name}.json` contains a single module definition.

Use the following structure (shown as single-file format; directory format splits modules into separate files):

```json
{
  "phase": "spec",
  "version": "4.0",
  "status": "approved",
  "modules": [
    {
      "id": "MOD-001",
      "name": "",
      "responsibility": "",
      "interfaces": [
        {
          "type": "api | internal | event",
          "name": "",
          "input_schema": {},
          "output_schema": {},
          "errors": [],
          "api_detail": null,
          "requirement_refs": [],
          "acceptance_criteria_refs": []
        }
      ],
      "data_models": [
        {
          "name": "",
          "fields": [
            { "name": "", "type": "", "constraints": "" }
          ],
          "relationships": [
            { "target": "", "type": "has_many | belongs_to | has_one" }
          ]
        }
      ],
      "state_machine": null,
      "nfr_constraints": {
        "performance": null,
        "security": null,
        "other": null
      },
      "requirement_refs": [],
      "invariant_refs": []
    }
  ],
  "dependency_graph": {
    "edges": [
      { "from": "", "to": "", "type": "calls | subscribes | depends" }
    ]
  },
  "external_dependencies": [
    {
      "name": "",
      "purpose": "",
      "module_refs": [],
      "alternatives": [],
      "test_strategy": "mock | sandbox | real"
    }
  ],
  "global_error_strategy": {
    "api_error_format": "",
    "external_service": "",
    "logging": ""
  },
  "auto_decisions": [
    {
      "decision": "",
      "alternatives": [],
      "rationale": "",
      "impact": "",
      "impact_level": "low | medium | high"
    }
  ],
  "contract_amendments": [],
  "context_dependencies": ["specs/discover.json"]
}
```

Ensure every interface has `requirement_refs` and `acceptance_criteria_refs` for traceability.
Ensure every module has `invariant_refs` where applicable.

Emit event: `COMPLETE` → enters `reviewing` state.

### Phase 3: Independent Review (Critic + Supervisor)

After writing spec.json, spawn two independent review agents. These agents run in **separate sessions with no access to the generation conversation history** — this separation is critical to prevent self-approval bias.

**Critic Agent** (independent session, no conversation history):
- Spawn `.claude/commands/critic.md` using the Agent tool in a **fresh session**
- Critic reads only specs/discover.json and specs/spec.json — never the generation conversation
- Performs backward verification: for each acceptance criterion, can the spec satisfy it?
- Checks for undeclared core behaviors
- Uses a floating iteration cap (not a fixed number) based on review complexity — simple: 3, medium: 5, complex: 7-10
- Each self-fix iteration is reverified by a **new Critic instance** (no carry-over context from previous cycles)
- If the cap is reached, evaluates the trend (converging / diverging / oscillating) to decide next action
- Results written to specs/spec_review.json

**Supervisor Agent** (independent session, no conversation history):
- Spawn `.claude/commands/supervisor.md` using the Agent tool in a **fresh session**
- Pass the following from `specs/discover.json` as the **anchor**: `constraints` + `selected_direction` + `tech_direction`
- Pass `specs/spec.json` as the **current stage output**
- Supervisor also reads `design_philosophy` from discover.json and `specs/decisions.json` (the cumulative decision audit trail) for drift analysis
- Uses quantitative drift scoring (0-100) rather than binary judgment — see supervisor.md for score ranges and recommended actions
- Checks global coherence: has complexity bloated? Does the design still match intent?
- Results written to spec_review.json global_coherence_check field

### Phase 4: Checkpoint Decision

Read spec_review.json results. Check **three conditions**:
1. `backward_verification.passed == true` (Critic passed)
2. `global_coherence_check.intent_alignment == "aligned"` (Supervisor aligned)
3. No entries in `spec.json.auto_decisions` with `impact_level: "high"` (no high-impact auto decisions)

- **All three pass** → emit `REVIEW_CLEAN` → auto-continue to /build
- **Critic self-fixed issues successfully** → emit `REVIEW_FIXABLE` → return to Phase 1 (expanding) to integrate fixes
- **Any issues remain** → emit `REVIEW_HAS_ISSUES` → present findings to user, recommend review
  - User actions: `APPROVED` → emit `APPROVED`, `CHANGES_REQUESTED` → emit `CHANGES_REQUESTED` → return to Phase 1

After approval (or auto-continue):

### Phase 5: Decision Ledger

Append this stage's auto_decisions to `specs/decisions.json` (create if not exists). This file is the unified decision audit trail across all stages.

```json
{
  "decisions": [
    {
      "stage": "spec",
      "timestamp": "<ISO 8601>",
      "decision": "",
      "alternatives": [],
      "rationale": "",
      "impact": "",
      "impact_level": "low | medium | high"
    }
  ],
  "contract_amendments": []
}
```

If the file already exists (e.g., from a previous /discover run), **append** to the `decisions` array — do not overwrite.

"spec artifacts written to specs/. Generate visualization by running: open specs/views/spec.html (or run /visualize for full dashboard). Run /build to continue."

## Lite Mode Behavior

When `discover.json.mode == "lite"`:
- **Phase 1:** Same design expansion, but simplified schemas are acceptable (fewer interface details, optional state machines)
- **Phase 3:** Checkpoint auto-skips unless Supervisor or Critic finds issues. Critic uses same-session backward verification only (no independent session spawn). Record `backward_verification.session: "same_session"` in spec_review.json.
- **Phase 4:** Auto-continue unless issues are found. No pause for user review by default.
