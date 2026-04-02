# NoPilot Workflow Design Spec (v3)

## 1. Overview

NoPilot is an AI Native personal development workflow framework covering the full pipeline from requirement exploration to code delivery.

**What it is:**
- A three-stage workflow: `/discover` -> `/spec` -> `/build`
- Portable workflow definitions (JSON) with platform-specific runtime adapters
- V1 scope: **Greenfield projects** (new projects from scratch). Brownfield/incremental iteration is a V2 capability.
- V1 runs on Claude Code; future versions target a custom iOS remote agent tool

**What it is NOT:**
- Not a multi-agent orchestration engine (delegates to oh-my-claudecode, BMAD, etc.)
- Not a requirements management platform
- Not reinventing existing SDD execution tools

## 2. Design Philosophy

1. **Humans are decision-makers, not executors.** Humans define intent and make choices. AI generates possibilities and executes. Humans never need to tell AI "how" — only "which one." When technical decisions must be confirmed, AI presents them in product-impact language ("this means simple deployment but limited scaling"), not technical jargon.

2. **Less human involvement downstream.** `/discover` has deep human participation, `/spec` only on exceptions, `/build` is nearly AFK. Higher upstream decision quality means less downstream babysitting.

3. **Multi-dimensional simultaneous emergence, single-dimensional progressive convergence.** Requirements, technical feasibility, competitive risks, and effort estimates appear together in the same output — not produced in sequential phases. But within a single dimension, coarse-to-fine convergence is necessary: pick a direction first, then define MVP, then lock requirements. The distinction: traditional workflows split by dimension (requirements phase, then architecture phase, then testing phase); NoPilot splits by granularity level (coarse-grained all-dimensions, then fine-grained all-dimensions).

4. **Spec is contract, not document.** Every stage's output is a structured, machine-readable artifact (JSON). The primary consumer is downstream stages, not humans. When humans need to review artifacts at checkpoints, **adapters must provide human-friendly views** (natural language summaries, highlighted decisions) — users should never need to read raw JSON.

5. **AI decides autonomously but leaves a trail.** Low-risk technical details are decided by AI without interrupting the flow. Every decision is recorded in artifacts. NoPilot is not "no oversight" — it's "no manual piloting."

6. **First principles upstream, best practices downstream.** Directional questions are reasoned from fundamentals. Execution-layer questions use proven industry solutions. Don't slow down where speed matters; don't rush where deliberation matters.

7. **Failures route back to the decision layer, never the execution layer.** Humans never need to read code, fix code, or debug code. Failure means an upstream decision needs revision, not that downstream execution needs manual intervention. When AI's approach fails, users can request "try a different approach" — a decision, not execution.

8. **Guardrails serve current capabilities, not lock future possibilities.** Validation mechanisms fall into two categories: **core guardrails** (backward verification, auto-acceptance) that define correctness and cannot be disabled, and **enhancement guardrails** (mutation testing, multi-sample 6Cs, tracer bullet) that are degradable training wheels. As AI capabilities improve, enhancement guardrails can be individually reduced or disabled.

## 3. Two-Layer Architecture

### 3.1 Workflow Definition Layer (Portable)

- `workflow.json`: Declarative description including stage definitions, state machine flow control, quality gates, checkpoints, and guardrails configuration
- `specs/`: Structured artifacts produced by each stage
- `context_dependencies`: Declared in workflow.json — which upstream artifacts each stage reads during normal flow
- `backtrack_context`: Declared in workflow.json — additional artifacts read when a stage is re-entered via backtrack (e.g., discover_history.json, build diagnostic reports)
- Memory system interface (V3 extension point): Schema-level fields for cross-project experience. "What to remember" is NoPilot's concern; "how to store/retrieve" is the runtime's concern
- Context management (V2 extension point): "What to pass between stages" is NoPilot's concern (declared as context_dependencies); "how to inject into AI context window" is the runtime's concern
- Artifact design principle: Each artifact should contain only information required by its downstream consumers. Process-level results (review findings, diagnostic logs) are separated from contract artifacts.
- Artifact compressibility: Fields like `rationale`, `history`, `competitive_notes` are safe to summarize. Fields like `interfaces`, `invariants`, `acceptance_criteria` are hard constraints — adapters must never compress them.

### 3.2 Runtime Adapter Layer (Platform-Specific)

- V1: Claude Code adapter (md slash commands in `.claude/commands/`), with optional MCP server or scripts as additional guardrails for models with poor instruction following
- Adapters may integrate with existing agent harnesses (oh-my-claudecode, BMAD, etc.) — NoPilot does not reinvent orchestration engines
- **Adapters must solve the context window limitation problem.** When total artifact size exceeds the model's context window, the adapter is responsible for implementing compression/summarization/batched injection strategies, respecting the compressibility rules above. This is a required adapter capability for V1, not an optional optimization.
- **Adapters must provide human-friendly views at checkpoints.** Users should never read raw JSON during review. Adapters render natural language summaries, highlight key decisions, and flag items needing attention.
- **Adapters should support independent verification sessions.** For backward verification and spec review, adapters should be able to spawn a separate context/session that only reads artifacts, not the generation conversation history. In Claude Code, this means spawning a sub-agent.
- V4 (future): iOS adapter for remote agent orchestration tool

### 3.3 State Machine Model

All flow control is described using a state machine model (inspired by XState): states + events + guards.

**Inter-stage transitions:**

```
+-----------+  approved   +-----------+  approved   +-----------+ gate_passed +----------+
| discover  |------------>|   spec    |------------>|   build   |------------>| complete |
|           |<------------|           |<------------|           |             +----------+
+-----------+  backtrack   +-----------+  backtrack   +-----------+
```

**Backtrack trigger conditions (explicit):**

| From | To | Trigger |
|------|----|---------|
| /spec | /discover | Spec expansion reveals contradictions in discover.json |
| /build | /spec | Implementation finds spec interface definitions infeasible, classified as contract-level issue |
| /build | /discover | Build's tiered exception handling classifies the issue as L3 — root cause is in the requirements layer |

**Backtrack safety mechanisms:**

```json
"max_backtrack_count": 3,
"backtrack_cycle_detection": true
```

- `max_backtrack_count`: Total backtrack limit across all stages (cumulative). Exceeded → terminate pipeline, output diagnostic report, suggest user re-evaluate project scope.
- `backtrack_cycle_detection`: If A→B→A→B cycle detected (same stage pair backtracks more than twice), immediately terminate and report.
- **Cost awareness:** A full backtrack from /build to /discover may take hours for medium-complexity projects. Users should be informed of estimated re-run cost before confirming backtrack.

On backtrack, V1 re-runs all downstream stages from scratch (full re-run). Incremental updates are a V2+ optimization.

**L2 contract amendment:** When /build makes product-level decisions (ACCEPT_DEGRADATION, CUT_FEATURE), the decision and its impact must be recorded as a `contract_amendment` in build_report.json AND propagated back to spec.json/discover.json as annotations. This prevents contract drift — final delivery always matches upstream artifacts.

### 3.4 Checkpoint Interaction Model

- **Definition (A):** workflow.json defines structured legal actions for each checkpoint state with typed parameters. All interactive states (`awaiting_user`, `awaiting_review`, `awaiting_test_review`, `diagnosing`) have explicit `allowed_actions`.
- **Interaction (B):** Users interact in natural language; the adapter parses intent, maps to enumerated actions, and confirms when ambiguous. Free-text code-level instructions are rejected at /build checkpoints.

### 3.5 Black Box Mechanism

Spans `/spec` and `/build`. An `auto_decisions[]` array in each artifact records:

- What was decided
- What alternatives existed
- Rationale for the choice
- Impact scope
- **`impact_level`: "low" | "medium" | "high"** — "chose REST over GraphQL" (low) vs "chose event-driven architecture" (high)
- **Recording threshold:** Only decisions where viable alternatives existed. Routine best-practice choices (adding an index, standard pagination) are not recorded to avoid noise.

### 3.6 Supervision Agents

Two independent agents provide cross-cutting quality assurance. Both are core guardrails — the problems they address (global drift, self-evaluation bias) do not disappear as AI capabilities improve.

**Supervisor Agent — Intent Guardian (telescope)**

Monitors whether the overall output still matches the user's original intent and constraints. Does not control flow — that remains the state machine's job. Supervisor does what state machines cannot: detect cumulative drift where each individual decision is locally reasonable but the aggregate result has diverged from intent.

- **Trigger:** Stage completion — awakened at three points: /discover complete, /spec complete, /build complete
- **Input:** Only two things: discover.json constraints + selected direction (lightweight anchor) + current stage's output. Does not read process history, code, or conversation logs. Minimal context consumption.
- **Output:** `global_coherence_check` field in spec_review.json or build_report.json
- **When drift detected:** Directly pauses and notifies user with drift diagnosis (e.g., "Your constraints say simple, but current design includes X, Y, Z complexity"). User chooses: accept current complexity / specify what to cut / backtrack to /discover to adjust constraints. Supervisor never self-resolves — drift is a product decision.

**Critic Agent — Independent Challenger (magnifying glass)**

Provides adversarial quality review in an independent session — no shared generation context. This structurally breaks "same AI grades its own work." Only reads final artifacts, never generation history.

- **Trigger:** Checkpoint review — awakened at: /discover Layer 3 lock (review requirement quality + invariants), /spec backward verification (replaces or augments independent_session_review), /build auto-acceptance (independently verify scenario walkthrough)
- **Input:** Relevant contract artifacts only (discover.json, spec.json, tests.json as applicable)
- **Session:** Independent — adapter spawns a separate context with no generation history
- **When issues found:** AI first attempts self-fix (modify current stage output to align with upstream contract). Self-fix must NOT modify upstream artifacts — only current stage adapts to upstream, never the reverse. After self-fix, Critic re-verifies. Pass → continue. Fail → pause and notify user.

**Relationship:** Supervisor watches direction (forest), Critic watches quality (trees). They are independent — no mutual dependency, can run in parallel.

**Implementation in Claude Code adapter:** Both agents are sub-agents spawned via Task tool or Agent tool with independent context. No special infrastructure needed — if the adapter supports independent sessions (already declared in 3.2), Supervisor and Critic implementation is essentially free.

```json
"agents": {
  "supervisor": {
    "trigger": "stage_complete",
    "input": ["discover.json#constraints", "discover.json#selected_direction", "current_stage_output"],
    "output_field": "global_coherence_check",
    "classification": "core_guardrail",
    "on_drift": "pause_notify_user"
  },
  "critic": {
    "trigger": "checkpoint_review",
    "input": ["relevant_contract_artifacts_only"],
    "output_field": "independent_review",
    "session": "independent",
    "classification": "core_guardrail",
    "on_issue": "self_fix_then_reverify_then_pause_if_still_failing"
  }
}
```

### 3.7 Enhancement Guardrails

Enhancement guardrails can be individually disabled as AI capabilities improve:

```json
"enhancement_guardrails": {
  "tracer_bullet": { "enabled": true, "phase": "build" },
  "mutation_testing": { "enabled": false, "phase": "build" },
  "multi_sample_6cs": { "enabled": false, "phase": "discover" }
}
```

### 3.7 Workflow Modes

```json
"mode": "full | lite"
```

AI recommends mode after Step 0 (constraint collection) based on project complexity. User can override.

- **full**: Complete three-stage workflow, all enhancement guardrails enabled by default
- **lite**: Streamlined for simple projects:
  - /discover: Retains Step 0, skips Layer 1 multi-direction divergence. AI recommends single direction. Search is recommended but not required. Layer 3 allows simplified requirements (feature list with basic acceptance criteria instead of full EARS + invariants).
  - /spec: Checkpoint auto-skips unless Supervisor or Critic finds issues. Critic uses simplified check (no independent session — same-session backward verification only).
  - /build: Tracer bullet disabled. Auto-acceptance uses simplified check.
  - Artifact schemas are **reduced** in lite mode, not just skipped — less ceremony, same structure.

### 3.8 Complete workflow.json Example

```json
{
  "name": "nopilot",
  "version": "3.0",
  "mode": "full",
  "max_backtrack_count": 3,
  "backtrack_cycle_detection": true,
  "agents": {
    "supervisor": {
      "trigger": "stage_complete",
      "input": ["discover.json#constraints", "discover.json#selected_direction", "current_stage_output"],
      "output_field": "global_coherence_check",
      "classification": "core_guardrail",
      "on_drift": "pause_notify_user"
    },
    "critic": {
      "trigger": "checkpoint_review",
      "input": ["relevant_contract_artifacts_only"],
      "output_field": "independent_review",
      "session": "independent",
      "classification": "core_guardrail",
      "on_issue": "self_fix_then_reverify_then_pause_if_still_failing"
    }
  },
  "enhancement_guardrails": {
    "tracer_bullet": { "enabled": true, "phase": "build" },
    "mutation_testing": { "enabled": false, "phase": "build" },
    "multi_sample_6cs": { "enabled": false, "phase": "discover" }
  },
  "stages": {
    "discover": {
      "command": "/discover",
      "description": "Requirement space exploration and convergence",
      "context_dependencies": [],
      "backtrack_context": ["specs/discover_history.json"],
      "outputs": ["specs/discover.json", "specs/discover_history.json"],
      "checkpoint": "required",
      "constraint_dimensions": [
        "tech_stack", "time", "platform", "exclusions", "budget", "existing_assets"
      ],
      "states": {
        "initial": "direction",
        "direction": {
          "on": {
            "SELECT": "mvp",
            "MERGE": "mvp",
            "REJECT_ALL": "direction"
          }
        },
        "mvp": {
          "on": {
            "APPROVE": "lock",
            "BACKTRACK": "direction"
          }
        },
        "lock": {
          "on": {
            "APPROVE": "$complete",
            "REVISE": "lock",
            "FORCE_OVERRIDE": "$complete",
            "BACKTRACK_MVP": "mvp",
            "BACKTRACK_DIR": "direction"
          },
          "guards": {
            "APPROVE": {
              "6cs_all_pass": true,
              "no_unresolved_conflicts": true,
              "invariants_extracted": true
            },
            "FORCE_OVERRIDE": {
              "note": "User acknowledges unresolved issues and proceeds anyway"
            }
          }
        }
      },
      "allowed_actions": {
        "direction": [
          { "type": "SELECT", "params": { "index": "number" } },
          { "type": "MERGE", "params": { "indices": "number[]", "note": "string" } },
          { "type": "REJECT_ALL", "params": { "reason": "string" } }
        ],
        "mvp": [
          { "type": "APPROVE" },
          { "type": "BACKTRACK" }
        ],
        "lock": [
          { "type": "APPROVE" },
          { "type": "REVISE", "params": { "requirement_ids": "string[]", "changes": "string" } },
          { "type": "FORCE_OVERRIDE", "params": { "acknowledged_issues": "string[]" } },
          { "type": "BACKTRACK_MVP" },
          { "type": "BACKTRACK_DIR" }
        ]
      }
    },
    "spec": {
      "command": "/spec",
      "description": "Constrained design expansion to module-level specifications",
      "context_dependencies": ["specs/discover.json"],
      "backtrack_context": ["specs/build_report.json"],
      "outputs": ["specs/spec.json", "specs/spec_review.json"],
      "checkpoint": "conditional",
      "checkpoint_trigger": "review_issues_found OR high_impact_auto_decisions_exist OR information_gap_with_options",
      "states": {
        "initial": "expanding",
        "expanding": {
          "on": {
            "COMPLETE": "self_reviewing",
            "CONTRADICTION": "$backtrack:discover",
            "GAP_HIGH_IMPACT": "awaiting_user",
            "L0_ISSUE": "expanding"
          }
        },
        "awaiting_user": {
          "on": {
            "USER_DECISION": "expanding"
          },
          "allowed_actions": [
            { "type": "USER_DECISION", "params": { "choice": "string" } }
          ]
        },
        "self_reviewing": {
          "on": {
            "REVIEW_CLEAN": "$complete",
            "REVIEW_HAS_ISSUES": "awaiting_review",
            "REVIEW_FIXABLE": "expanding"
          }
        },
        "awaiting_review": {
          "on": {
            "APPROVED": "$complete",
            "CHANGES_REQUESTED": "expanding"
          },
          "allowed_actions": [
            { "type": "APPROVED" },
            { "type": "CHANGES_REQUESTED", "params": { "changes": "string" } }
          ]
        }
      }
    },
    "build": {
      "command": "/build",
      "description": "TDD implementation per spec with tracer bullet and auto-acceptance",
      "context_dependencies": ["specs/spec.json", "specs/discover.json"],
      "backtrack_context": [],
      "outputs": ["specs/tests.json", "specs/build_report.json"],
      "test_review_checkpoint": "optional",
      "max_retries_per_module": 3,
      "states": {
        "initial": "planning",
        "planning": {
          "on": {
            "PLAN_READY": "testing",
            "L3_ISSUE": "diagnosing"
          }
        },
        "testing": {
          "on": {
            "TESTS_GENERATED_AUTO": "tracer_bullet",
            "TESTS_GENERATED_REVIEW": "awaiting_test_review",
            "L3_ISSUE": "diagnosing"
          },
          "guards": {
            "TESTS_GENERATED_REVIEW": { "test_review_checkpoint": "required" },
            "TESTS_GENERATED_AUTO": { "test_review_checkpoint": "optional" }
          }
        },
        "awaiting_test_review": {
          "on": {
            "APPROVED": "tracer_bullet",
            "REQUEST_CHANGES": "testing"
          },
          "allowed_actions": [
            { "type": "APPROVED" },
            { "type": "REQUEST_CHANGES", "params": { "changes": "string" } }
          ]
        },
        "tracer_bullet": {
          "on": {
            "TRACER_PASS": "implementing",
            "TRACER_L0L1_FAIL": "tracer_bullet",
            "TRACER_L2L3_FAIL": "diagnosing",
            "SKIP": "implementing"
          },
          "guards": {
            "SKIP": { "guardrails.enhancement.tracer_bullet.enabled": false }
          }
        },
        "implementing": {
          "on": {
            "ALL_MODULES_DONE": "verifying",
            "L0_ISSUE": "env_waiting",
            "L1_RESOLVED": "implementing",
            "L2_ISSUE": "awaiting_user",
            "L3_ISSUE": "diagnosing"
          }
        },
        "env_waiting": {
          "on": {
            "ENV_RESOLVED": "implementing",
            "ENV_EXHAUSTED_WITH_ALT": "awaiting_user",
            "ENV_EXHAUSTED_NO_ALT": "diagnosing"
          }
        },
        "awaiting_user": {
          "on": {
            "ACCEPT_DEGRADATION": "amending",
            "CUT_FEATURE": "replanning",
            "MODIFY_SPEC": "$backtrack:spec",
            "RETRY_DIFFERENT_APPROACH": "implementing",
            "BACKTRACK_DISCOVER": "$backtrack:discover"
          },
          "allowed_actions": [
            { "type": "ACCEPT_DEGRADATION", "params": { "detail": "string" } },
            { "type": "CUT_FEATURE", "params": { "feature": "string" } },
            { "type": "MODIFY_SPEC" },
            { "type": "RETRY_DIFFERENT_APPROACH", "params": { "hint": "string?" } },
            { "type": "BACKTRACK_DISCOVER" }
          ]
        },
        "amending": {
          "on": {
            "AMENDMENT_RECORDED": "implementing"
          }
        },
        "replanning": {
          "on": {
            "REPLAN_READY": "implementing",
            "REPLAN_INCOMPLETE": "diagnosing"
          }
        },
        "diagnosing": {
          "on": {
            "BACKTRACK_SPEC": "$backtrack:spec",
            "BACKTRACK_DISCOVER": "$backtrack:discover"
          },
          "allowed_actions": [
            { "type": "BACKTRACK_SPEC" },
            { "type": "BACKTRACK_DISCOVER" }
          ]
        },
        "verifying": {
          "on": {
            "ALL_PASS": "accepting",
            "FAILURES": "implementing"
          }
        },
        "accepting": {
          "on": {
            "ACCEPTANCE_PASS": "$complete",
            "ACCEPTANCE_FAIL_L2": "awaiting_user",
            "ACCEPTANCE_FAIL_L3": "diagnosing"
          }
        }
      }
    }
  },
  "backtrack_triggers": [
    { "from": "spec", "to": "discover", "condition": "contradiction_in_discover_json" },
    { "from": "build", "to": "spec", "condition": "spec_interface_infeasible" },
    { "from": "build", "to": "discover", "condition": "requirement_level_fundamental_issue" }
  ],
  "backtrack_strategy": "full_rerun"
}
```

## 4. Stage 1: /discover — Requirement Space Explorer

### 4.1 Positioning

AI Native requirement space explorer. Not "AI playing BA" but "AI as possibility generator, human as decision-maker." AI generates a multi-dimensional requirement space; human selects and prunes; each selection triggers real-time reconvergence.

### 4.2 AI Role

Evaluates product directions **from first principles**. Specific capabilities:

- **Parallel divergence:** Generates multiple product directions simultaneously
- **Active challenge:** Pushes back on unreasonable requirements by surfacing costs and risks (not questioning user authority). Challenges apply equally to user-stated and AI-inferred requirements.
- **Simultaneous emergence:** Requirements, technical feasibility, competitive risks, effort estimates, and failure scenarios appear in the same output
- **Real-time downstream impact:** When a requirement is confirmed, immediately surfaces technical implications — presented in product-impact language
- **Search-grounded analysis (full mode):** Layer 1 and Layer 2 use search to ground competitive analysis and feasibility assessments. **Search fallback:** If search fails or returns low-quality results, AI marks `grounding: "ai_judgment_only"` and informs user the analysis is unverified.

### 4.3 Three-Layer Convergence Funnel

#### Step 0 — Constraint Collection + Mode Recommendation

AI presents a constraint dimension checklist for the user to quickly check/fill/skip:

- **Tech stack limitations:** Yes / No -> specifics
- **Time constraints:** Yes / No -> specific deadline
- **Target platform:** Web / iOS / Android / Desktop / Undecided
- **Explicit exclusions:** Yes / No -> specifics
- **Budget/resource constraints:** Yes / No -> specifics
- **Existing assets:** Yes / No -> reusable code/design/data

All items may be skipped. The checklist dimensions are declared in workflow.json as `constraint_dimensions`, customizable per project.

**After collection, AI recommends `full` or `lite` mode** based on constraint complexity and project scope. User can override.

#### Layer 1 — Direction Selection

**Full mode:**
- AI searches for competitive landscape and market context
- AI outputs 3-5 product directions, each with: one-sentence description, key differentiator, biggest risk
- All directions satisfy declared constraints

**Lite mode:**
- AI recommends a single direction based on constraints (search recommended but not required)
- User confirms or provides alternative

**User decision:** Select / merge / reject all

**Completion condition:** User has selected a clear product direction

#### Layer 2 — MVP Definition + Technical Path

**Input:** Direction selected in Layer 1

**AI output:**
- Core feature list (5-10), each with: technical feasibility assessment, competitive comparison (full mode: search-grounded; lite mode: AI judgment)
- Tech stack + architecture style recommendation — **presented in product-impact language** (e.g., "modular monolith = simple ops, scales to ~10K users; microservices = complex ops, scales further")
- **Core scenarios:** 1-3 highest-priority user journeys derived from the feature list. These become the anchor for tracer bullet (Step 3) and auto-acceptance (Step 6) in /build. Defined here because MVP feature selection inherently implies which scenarios matter most.
- Rough effort estimate
- **Pre-mortem:** 3-5 most likely failure scenarios for the selected direction

**User decision:** Prune features (keep / cut / defer to V2) + confirm technical direction + confirm core scenarios

**Completion condition:** MVP feature scope locked + architecture style confirmed + core scenarios identified

#### Layer 3 — Requirement Lock

**Input:** Confirmed MVP features + technical direction from Layer 2

**AI output (presented all at once, failing items highlighted):**

**Full mode:**
- Each requirement: user story + EARS acceptance criteria + regression guard + source annotation + source_refs for search-grounded claims + downstream impact prediction
- System invariants (first-class artifacts for cross-stage traceability)
- Inter-requirement conflict detection + coverage check
- 6Cs quality assessment (see below)

**Lite mode:**
- Each requirement: user story + basic acceptance criteria (EARS optional) + source annotation
- Invariants optional
- Simplified 6Cs (Completeness + Consistency + Concreteness only)

**6Cs Assessment Model:**

| C | Assessment Method |
|---|-------------------|
| Clarity | AI judgment + confidence annotation. Low-confidence items flagged for user review |
| Conciseness | AI judgment (relatively objective) |
| Completeness | AI annotates checked scenarios, explicitly acknowledges blind spots. Search supplements coverage. |
| Consistency | Rule-checkable — cross-comparison, contradiction detection |
| Correctness | **No auto-pass for any source.** High-cost/high-risk challenges require user to choose a specific action (ACCEPT_COST / SIMPLIFY / DEFER_V2). Low-cost challenges allow simple confirmation. Confirmed = `pass_confirmed`. |
| Concreteness | Rule-checkable — EARS format compliance, quantifiable indicators |

**FORCE_OVERRIDE:** If 6Cs gate blocks and user disagrees with AI's assessment, user can force-override with acknowledged issues recorded.

**V2 enhancement:** Multi-sample consistency check — AI evaluates same requirement multiple times, inconsistent results flag low-confidence items.

**Completion condition:** All requirements pass 6Cs (or force-overridden) + no unresolved conflicts + invariants extracted (full mode) + user approval

### 4.4 Intra-Stage State Machine

(See workflow.json example in Section 3.8)

### 4.5 Backtrack Behavior

- Any layer can backtrack to any previous layer
- All history is preserved on backtrack
- AI leverages history when re-diverging
- **decision_log records exact event names** (BACKTRACK_MVP, BACKTRACK_DIR, SELECT, MERGE, REJECT_ALL, etc.) — no generalization

### 4.6 Output Artifacts

**specs/discover.json** — Contract: final locked output

```json
{
  "phase": "discover",
  "version": "3.0",
  "status": "approved",
  "mode": "full | lite",
  "constraints": {
    "tech_stack": [],
    "time": null,
    "platform": [],
    "exclusions": [],
    "budget": null,
    "existing_assets": []
  },
  "selected_direction": {
    "description": "",
    "differentiator": "",
    "rationale": "",
    "pre_mortem": [],
    "grounding": "search_verified | ai_judgment_only"
  },
  "tech_direction": {
    "stack": [],
    "architecture_style": "",
    "product_impact": "",
    "rationale": ""
  },
  "requirements": [
    {
      "id": "REQ-001",
      "user_story": "",
      "acceptance_criteria": [
        {
          "id": "REQ-001-AC-1",
          "type": "event_driven | condition | state | regression_guard",
          "ears": "WHEN ... THEN system SHALL ...",
          "source_refs": []
        }
      ],
      "source": "user_stated | ai_inferred",
      "quality_assessment": {
        "clarity": "pass | fail",
        "conciseness": "pass | fail",
        "completeness": "pass | fail",
        "consistency": "pass | fail",
        "correctness": "pass | pass_confirmed | fail | force_overridden",
        "concreteness": "pass | fail"
      },
      "downstream_impact": {
        "tech_implications": "",
        "test_complexity": "",
        "effort_estimate": ""
      }
    }
  ],
  "invariants": [
    {
      "id": "INV-001",
      "statement": "",
      "scope": "system-wide | module-specific",
      "requirement_refs": []
    }
  ],
  "core_scenarios": [
    {
      "id": "SCENARIO-001",
      "description": "Primary happy path for the core feature",
      "requirement_refs": [],
      "priority": "highest"
    }
  ],
  "mvp_features": [
    {
      "name": "",
      "feasibility": "feasible | risky | needs_research",
      "competitive_notes": "",
      "source_refs": [],
      "requirement_refs": []
    }
  ],
  "context_dependencies": []
}
```

**specs/discover_history.json** — History: exploration process record

```json
{
  "explored_directions": [
    {
      "description": "",
      "differentiator": "",
      "risk": "",
      "status": "selected | abandoned | merged",
      "abandonment_reason": ""
    }
  ],
  "pruned_features": [
    {
      "name": "",
      "reason": "",
      "deferred_to": "v2 | cut"
    }
  ],
  "decision_log": [
    {
      "layer": "direction | mvp | lock",
      "action": "SELECT | MERGE | REJECT_ALL | APPROVE | BACKTRACK_MVP | BACKTRACK_DIR | REVISE | FORCE_OVERRIDE",
      "detail": "",
      "timestamp": ""
    }
  ]
}
```

## 5. Stage 2: /spec — Constrained Design Expansion

### 5.1 Positioning

Constrained design expansion. Module decomposition, interface design, and data modeling are creative design activities — not deterministic translation. AI's design freedom exists within the constraint space defined by discover.json's requirements, invariants, and technical direction.

**Behavior boundary rule (two-tier):**
- **Core product behavior** (functionality, user flows, interactions) must be traceable to discover.json. Any core behavior not declared upstream is a violation.
- **Technical behavior** (pagination defaults, error codes, rate limiting, retry strategies) is /spec's design freedom. These are recorded in `auto_decisions` and do not require upstream traceability.

### 5.2 AI Role

- **Constrained expansion:** Within bounds of discover.json's requirements, invariants, and tech direction
- **Best practices:** Module decomposition, interface design, data modeling follow industry conventions
- **Autonomous low-risk decisions:** Recorded in `auto_decisions` with `impact_level`. Only decisions with viable alternatives are recorded.
- **No self-resolution of contradictions:** Reports and recommends backtracking

### 5.3 Input

Reads `specs/discover.json`. On backtrack from /build, also reads `specs/build_report.json` (declared in `backtrack_context`).

### 5.4 Output Artifacts

**specs/spec.json** — Contract (no process-level data)

```json
{
  "phase": "spec",
  "version": "3.0",
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

**specs/spec_review.json** — Process: self-review results (separated from contract)

```json
{
  "phase": "spec_review",
  "backward_verification": {
    "passed": true,
    "session": "independent | same_session",
    "uncovered_criteria": [],
    "invariant_violations": []
  },
  "undeclared_core_behaviors": [],
  "technical_behaviors_logged": [],
  "high_impact_decisions": [],
  "search_verification_results": [],
  "global_coherence_check": {
    "intent_alignment": "aligned | drifted",
    "complexity_growth": "proportional | over_engineered",
    "constraint_compliance": "all_met | violated",
    "detail": ""
  }
}
```

### 5.5 Verification (Core Guardrail — Cannot Be Disabled)

Verification is performed by two independent agents (defined in Section 3.6):

**Critic Agent (core — tree-level):** Spawned in an independent session (no generation history). Performs backward verification: for each acceptance criterion in discover.json, traces through the spec's module design and verifies: "If implemented per this spec, would this criterion be satisfied?" When issues found, AI attempts self-fix on spec.json (without modifying discover.json), then Critic re-verifies. Persistent failures pause for user.

**Supervisor Agent (core — forest-level):** Reads discover.json constraints + selected direction + spec.json as a whole. Checks: "Does this spec still match the user's original intent? Has complexity grown proportionally, or bloated?" When drift detected, directly pauses and notifies user — drift is always a product decision.

Results written to `specs/spec_review.json`.

### 5.6 Human Checkpoint (Conditional)

Triggered by conditions — not fixed optional/required:

- If review clean AND no high-impact auto_decisions → auto-continues
- If review has issues OR high-impact decisions exist OR information gap with multiple options → pause for user review

### 5.7 Exception Handling

| Situation | AI Behavior |
|-----------|------------|
| discover.json has contradictions | Terminate /spec, recommend backtrack to /discover |
| Information gap, no user-visible impact, obvious fill | Auto-fill as technical behavior, record in auto_decisions |
| Information gap, user-visible impact or multiple architecture options | Pause, present options to user |
| Search verification fails or unavailable | Mark `grounding: "ai_judgment_only"`, continue |

## 6. Stage 3: /build — Autonomous Executor

### 6.1 Positioning

Autonomous executor. Follows industry best practices. Implements per spec.json via per-module TDD cycles. Human involvement near zero.

### 6.2 AI Role

- **Autonomous planning:** Decides module execution order, selects highest-priority core scenario from discover.json as tracer bullet path
- **TDD cycles:** Per module — generate tests, write implementation, pass, next
- **Tiered exception handling:** L0/L1/L2/L3 with appropriate escalation
- **Best practices:** Coding standards, design patterns, testing strategies

### 6.3 Input

- `specs/spec.json`: Module specs, interfaces, dependency graph, external dependencies, NFR constraints
- `specs/discover.json`: Requirements, acceptance criteria, invariants, core scenarios

### 6.4 Execution Flow

```
Step 1: Generate execution plan + select tracer bullet path → black box
Step 2: Generate tests.json (example_cases + property_cases)
  → Optional human review (priority: property > traced-example > ai-supplemented)
Step 3: Tracer bullet (enhancement guardrail)
  → L0/L1 failures: self-fix and retry
  → L2/L3 failures: enter diagnosing
Step 4: Per-module TDD cycle (max_retries_per_module: 3)
Step 5: Full verification (all tests)
Step 6: Auto-acceptance (core guardrail)
  → Concrete mechanism: generate user operation script for each core scenario,
    simulate execution, verify key paths produce expected outcomes
  → Pass: pipeline complete
  → Fail: L2 (behavior mismatch) or L3 (fundamental issue)
Step 7: Output build report
```

### 6.5 Output Artifacts

**specs/tests.json**

```json
{
  "phase": "build",
  "artifact": "tests",
  "version": "3.0",
  "example_cases": [
    {
      "id": "TEST-001",
      "suite_type": "unit | integration | e2e | contract | state_transition",
      "module_ref": "",
      "requirement_refs": [],
      "description": "",
      "category": "normal | boundary | error | regression",
      "ears_ref": "",
      "derivation": "direct_from_ears | ai_supplemented",
      "input": "",
      "expected_output": "",
      "setup": ""
    }
  ],
  "property_cases": [
    {
      "id": "PROP-001",
      "module_ref": "",
      "invariant_ref": "INV-001",
      "property": "For any valid task, status transitions only follow the defined state machine",
      "requirement_refs": []
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

**specs/build_report.json**

```json
{
  "phase": "build",
  "artifact": "report",
  "version": "3.0",
  "execution_plan": {
    "module_order": [],
    "tracer_bullet_path": "",
    "tracer_bullet_scenario_ref": "",
    "rationale": ""
  },
  "tracer_bullet_result": {
    "status": "passed | failed_and_fixed | failed_escalated | skipped",
    "attempts": [],
    "issues": []
  },
  "module_results": [
    {
      "module_id": "",
      "status": "completed | failed | skipped",
      "tests_passed": 0,
      "tests_failed": 0,
      "retries": 0,
      "retry_history": [
        { "attempt": 1, "approach": "", "failure_reason": "" }
      ],
      "issues": [
        { "level": "L0 | L1 | L2 | L3", "description": "", "resolution": "" }
      ]
    }
  ],
  "test_summary": {
    "total": 0,
    "passed": 0,
    "failed": 0
  },
  "acceptance_result": {
    "status": "passed | failed | skipped",
    "scenarios_walked": [
      { "scenario_ref": "", "result": "pass | fail", "mismatch_detail": "" }
    ]
  },
  "contract_amendments": [
    {
      "type": "ACCEPT_DEGRADATION | CUT_FEATURE",
      "detail": "",
      "affected_requirements": [],
      "affected_modules": [],
      "timestamp": ""
    }
  ],
  "auto_decisions": [],
  "diagnostic_report": {
    "failed_module": "",
    "failure_analysis": "",
    "recommended_backtrack_target": "spec | discover",
    "rationale": ""
  },
  "global_coherence_check": {
    "intent_alignment": "aligned | drifted",
    "complexity_growth": "proportional | over_engineered",
    "constraint_compliance": "all_met | violated",
    "detail": ""
  },
  "unresolved_issues": []
}
```

### 6.6 Tiered Exception Handling

| Level | Condition | AI Behavior |
|-------|-----------|-------------|
| **L0 — Environment/external** | Runtime infrastructure issues (API down, lib bug, env config) | Auto-retry. Persistent → pause, suggest operations. **Retry exhaustion escalates:** to L2 if alternatives exist, to L3 if irreplaceable. |
| **L1 — Self-resolve** | Does not affect spec contract | Resolve + record in auto_decisions |
| **L2 — Pause & notify** | Affects spec contract | Pause, report, await product-level decision only. Allowed: ACCEPT_DEGRADATION, CUT_FEATURE, MODIFY_SPEC, **RETRY_DIFFERENT_APPROACH**, BACKTRACK_DISCOVER. |
| **L3 — Terminate & backtrack** | Fundamental spec/requirement issue | Enter diagnosing. User decides backtrack target. |

**RETRY_DIFFERENT_APPROACH:** When AI's implementation path fails but the spec is valid, user can request AI try a different approach without entering the execution layer. AI records the failed approach and tries an alternative. **Retry counting:** RETRY_DIFFERENT_APPROACH resets the module's retry counter (user provided new direction = fresh attempt), but a module can only receive RETRY_DIFFERENT_APPROACH at most 2 times. Exceeded → L3.

**Contract amendment flow:** ACCEPT_DEGRADATION → enters `amending` state → records amendment in build_report.json → annotates spec.json/discover.json → returns to implementing. This prevents contract drift.

### 6.7 Replanning Behavior

When /build issues CUT_FEATURE and enters replanning, the specific steps are:
1. Remove the feature's modules from dependency graph
2. Identify cascade impacts (other modules that depended on removed modules)
3. Remove associated test cases from tests.json
4. Recalculate execution plan order
5. If cascade makes system fundamentally incomplete → REPLAN_INCOMPLETE → diagnosing
6. Otherwise → REPLAN_READY → resume implementing

### 6.8 Retry Mechanism

- `max_retries_per_module`: Configurable (default: 3)
- Exhaustion → always L3 (terminate and backtrack). No "human takes over /build" branch.
- `max_retry_different_approach_per_module`: 2. User-triggered retries reset the AI retry counter but have their own cap.
- Diagnostic report includes: failed module, retry history with each approach attempted, failure analysis, recommended backtrack target.

## 7. Artifact Directory Structure

```
specs/
├── discover.json            Contract: locked requirements + invariants + core scenarios
├── discover_history.json    History: exploration process and decision log
├── spec.json                Contract: module-level specifications
├── spec_review.json         Process: self-review and verification results
├── tests.json               Contract: test cases (example + property, separated)
└── build_report.json        Report: execution results, amendments, diagnostics
```

## 8. Evolution Roadmap

| Version | Focus |
|---------|-------|
| V1 | Greenfield pipeline on Claude Code. md slash commands. Full re-run on backtrack. Core + enhancement guardrails. Independent session review. |
| V1.5 | True lite mode (reduced schemas). Brownfield support (read existing codebase as context). Search fallback hardening. |
| V2 | Context management. Incremental backtrack. Multi-sample 6Cs. Mutation testing. Dynamic constraint dimensions. |
| V3 | Memory system: cross-project experience. Consistency checks on spec drift. |
| V4 | iOS runtime adapter. Parallel module execution (requires auto-generated API mocks from V2+). |

## 9. Research References

### Adopted Practices

| Practice | Source | How Used |
|----------|--------|----------|
| EARS syntax | Kiro (Amazon) | Layer 3 acceptance criteria format |
| 6Cs framework | Copilot4DevOps (Microsoft) | Layer 3 quality gate (pass/fail + confidence) |
| Regression guard (SHALL CONTINUE TO) | Kiro (Amazon) | Layer 3 requirement format |
| Least-to-Most prompting | LLMREI paper | Layer 1-3 progressive depth |
| Steering / Constitution | GitHub Spec Kit, Kiro | Step 0 constraint checklist |
| Backward verification | Self-Verification research | /spec core guardrail |
| Pre-mortem | Gary Klein | /discover Layer 2 failure scenarios |
| Design by Contract (invariants) | Bertrand Meyer | Cross-stage invariant chain |
| Property-based testing | Kiro, Hypothesis | /build property test cases |
| Tracer bullet | The Pragmatic Programmer | /build Step 3 skeleton validation |
| SelfCheckGPT (multi-sample) | Confident AI | V2 6Cs enhancement |
| Actor-Adversary-Critic | Academic research | /spec review architecture |
| Mutation testing | Meta ACH system | V2 test quality verification |
| Independent session verification | Multi-agent research (planner-coder gap) | /spec independent review session |

### NoPilot's Differentiation

- Cross-stage traceability (requirement → invariant → module → interface → test) with structured JSON
- Tiered guardrails: core (cannot disable) vs enhancement (degradable) — designing for AI capability growth
- "Failure routes to decision layer" with RETRY_DIFFERENT_APPROACH — user stays in decision space even when AI execution fails
- Invariants as first-class cross-stage artifacts bridging requirements and property-based tests
- Contract amendment mechanism preventing drift between upstream specs and downstream reality
