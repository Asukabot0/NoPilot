# NoPilot Workflow Design Spec

## 1. Overview

NoPilot is an AI Native personal development workflow framework covering the full pipeline from requirement exploration to code delivery.

**What it is:**
- A three-stage workflow: `/discover` -> `/spec` -> `/build`
- Portable workflow definitions (JSON) with platform-specific runtime adapters
- V1 runs on Claude Code; future versions target a custom iOS remote agent tool

**What it is NOT:**
- Not a multi-agent orchestration engine (delegates to oh-my-claudecode, BMAD, etc.)
- Not a requirements management platform
- Not reinventing existing SDD execution tools

## 2. Design Philosophy

1. **Humans are decision-makers, not executors.** Humans define intent and make choices. AI generates possibilities and executes. Humans never need to tell AI "how" — only "which one."

2. **Less human involvement downstream.** `/discover` has deep human participation, `/spec` only on exceptions, `/build` is nearly AFK. Higher upstream decision quality means less downstream babysitting.

3. **Simultaneous emergence over linear handoff.** Requirements, technical feasibility, competitive risks, and effort estimates should appear together in the same convergence funnel, not in sequential phases. Artificial phase boundaries create information loss.

4. **Spec is contract, not document.** Every stage's output is a structured, machine-readable artifact (JSON). Not Markdown for humans to read, but contracts for downstream stages to consume programmatically.

5. **AI decides autonomously but leaves a trail.** Low-risk technical details are decided by AI without interrupting the flow. Every decision is recorded in artifacts. NoPilot is not "no oversight" — it's "no manual piloting."

6. **First principles upstream, best practices downstream.** Directional questions are reasoned from fundamentals. Execution-layer questions use proven industry solutions. Don't slow down where speed matters; don't rush where deliberation matters.

7. **Failures route back to the decision layer, never the execution layer.** Humans never need to read code, fix code, or debug code. Failure means an upstream decision needs revision, not that downstream execution needs manual intervention.

## 3. Two-Layer Architecture

### 3.1 Workflow Definition Layer (Portable)

- `workflow.json`: Declarative description including stage definitions, state machine flow control, quality gates, and checkpoints
- `specs/`: Structured artifacts produced by each stage
- `context_dependencies`: Declared in workflow.json — which upstream artifacts each stage reads
- Memory system interface (V3 extension point): Schema-level fields for cross-project experience. "What to remember" is NoPilot's concern; "how to store/retrieve" is the runtime's concern
- Context management (V2 extension point): "What to pass between stages" is NoPilot's concern (declared as context_dependencies); "how to inject into AI context window" is the runtime's concern

### 3.2 Runtime Adapter Layer (Platform-Specific)

- V1: Claude Code adapter (md slash commands in `.claude/commands/`), with optional MCP server or scripts as additional guardrails for models with poor instruction following
- Adapters may integrate with existing agent harnesses (oh-my-claudecode, BMAD, etc.) — NoPilot does not reinvent orchestration engines
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
| /spec | /discover | Spec expansion reveals contradictions in discover.json (e.g., architecture style cannot satisfy a performance constraint) |
| /build | /spec | Implementation finds spec interface definitions infeasible or contradictory, classified as contract-level issue |
| /build | /discover | Build's tiered exception handling classifies the issue as L3 — root cause is in the requirements layer, spec layer cannot fix it |

On backtrack, V1 re-runs all downstream stages from scratch (full re-run). Incremental updates are a V2+ optimization.

### 3.4 Checkpoint Interaction Model

- **Definition (A):** workflow.json defines structured legal actions for each checkpoint (APPROVE, SELECT, MERGE, BACKTRACK, etc.) with typed parameters
- **Interaction (B):** Users interact in natural language; the adapter parses intent and maps to structured actions, with confirmation when ambiguous

### 3.5 Black Box Mechanism

Spans `/spec` and `/build`. An `auto_decisions[]` array in each artifact records:

- What was decided
- What alternatives existed
- Rationale for the choice
- Impact scope

Users do not need to approve these. They can review at any time. Disagreement is resolved by modifying and re-running the stage.

### 3.6 Complete workflow.json Example

```json
{
  "name": "nopilot",
  "version": "1.0",
  "stages": {
    "discover": {
      "command": "/discover",
      "description": "Requirement space exploration and convergence",
      "context_dependencies": [],
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
            "BACKTRACK_MVP": "mvp",
            "BACKTRACK_DIR": "direction"
          },
          "guards": {
            "APPROVE": {
              "6cs_all_pass": true,
              "no_unresolved_conflicts": true
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
          { "type": "BACKTRACK_MVP" },
          { "type": "BACKTRACK_DIR" }
        ]
      }
    },
    "spec": {
      "command": "/spec",
      "description": "Faithful translation to module-level specifications",
      "context_dependencies": ["specs/discover.json"],
      "outputs": ["specs/spec.json"],
      "checkpoint": "optional",
      "states": {
        "initial": "translating",
        "translating": {
          "on": {
            "COMPLETE": "$complete",
            "CONTRADICTION": "$backtrack:discover",
            "GAP_HIGH_IMPACT": "awaiting_user"
          }
        },
        "awaiting_user": {
          "on": {
            "USER_DECISION": "translating"
          }
        }
      }
    },
    "build": {
      "command": "/build",
      "description": "TDD implementation per spec",
      "context_dependencies": ["specs/spec.json", "specs/discover.json"],
      "outputs": ["specs/tests.json", "specs/build_report.json"],
      "test_review_checkpoint": "optional",
      "max_retries_per_module": 3,
      "states": {
        "initial": "planning",
        "planning": {
          "on": { "PLAN_READY": "testing" }
        },
        "testing": {
          "on": {
            "TESTS_GENERATED": "implementing",
            "TESTS_REVIEW": "awaiting_test_review"
          }
        },
        "awaiting_test_review": {
          "on": { "APPROVED": "implementing" }
        },
        "implementing": {
          "on": {
            "ALL_MODULES_DONE": "verifying",
            "L2_ISSUE": "awaiting_user",
            "L3_ISSUE": "$backtrack:spec"
          }
        },
        "awaiting_user": {
          "on": { "USER_DECISION": "implementing" }
        },
        "verifying": {
          "on": {
            "ALL_PASS": "$complete",
            "FAILURES": "implementing"
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

- **Parallel divergence:** Generates multiple product directions simultaneously, not drilling down a single path
- **Active challenge:** Pushes back on unreasonable requirements, flags areas already covered by competitors, demands differentiation
- **Simultaneous emergence:** Requirements, technical feasibility, competitive risks, and effort estimates appear in the same output
- **Real-time downstream impact:** When a requirement is confirmed, immediately surfaces technical implications

### 4.3 Three-Layer Convergence Funnel

#### Layer 1 — Direction Selection

**Step 0 (Constraint checklist):**

AI presents a constraint dimension checklist for the user to quickly check/fill/skip:

- **Tech stack limitations:** Yes / No -> specifics
- **Time constraints:** Yes / No -> specific deadline
- **Target platform:** Web / iOS / Android / Desktop / Undecided
- **Explicit exclusions:** Yes / No -> specifics
- **Budget/resource constraints:** Yes / No -> specifics
- **Existing assets:** Yes / No -> reusable code/design/data

All items may be skipped. AI then diverges within the declared constraint space.

The checklist dimensions are declared in workflow.json as `constraint_dimensions`, customizable per project.

**Step 1 (Constrained divergence):**

- AI outputs 3-5 product directions, each containing:
  - One-sentence description
  - Key differentiator (vs. other directions)
  - Biggest risk (technical, market, or feasibility)
- All directions satisfy declared constraints

**User decision:** Select one / merge multiple / reject all and request re-divergence

**Completion condition:** User has selected a clear product direction

#### Layer 2 — MVP Definition + Technical Path

**Input:** Direction selected in Layer 1

**AI output:**
- Core feature list (5-10), each with:
  - Technical feasibility assessment (feasible / risky / needs research)
  - Competitive comparison (who already does this, how well, where's the differentiation)
- Tech stack recommendation + architecture style recommendation (locked to architecture style level, e.g., "modular monolith + event bus"), with rationale
- Rough effort estimate

**User decision:** Prune features (keep / cut / defer to V2) + confirm technical direction

**Completion condition:** MVP feature scope locked + architecture style confirmed

#### Layer 3 — Requirement Lock

**Input:** Confirmed MVP features + technical direction from Layer 2

**AI output (presented all at once, failing items highlighted):**
- Full definition for each requirement:
  - User story (As a / I want / So that)
  - EARS acceptance criteria (WHEN/IF/WHILE...THEN...SHALL)
  - Regression guard (SHALL CONTINUE TO)
  - Source annotation (`user_stated` | `ai_inferred`)
  - Downstream impact prediction (tech implications, test complexity, effort estimate)
- Inter-requirement conflict detection
- Coverage check (any uncovered scenarios)
- 6Cs quality assessment (per requirement, pass/fail per dimension)

**6Cs Pass/Fail Criteria:**

| C | Pass Condition |
|---|---------------|
| Clarity | No ambiguity — different readers would interpret identically |
| Conciseness | No redundant information; every sentence carries necessary content |
| Completeness | Normal flow, error flow, and boundary conditions all covered |
| Consistency | No contradiction with other requirements |
| Correctness | Accurately reflects user intent. `user_stated` requirements auto-pass; `ai_inferred` requirements require user confirmation |
| Concreteness | Acceptance criteria can be directly mapped to test cases |

Any C failing -> requirement is flagged with reason; user must fix before gate passes.

**User decision:** Confirm / revise / add requirements per item. All failing items must be resolved.

**Completion condition:** All requirements pass 6Cs + no unresolved conflicts + user approval

### 4.4 Intra-Stage State Machine

```json
{
  "states": {
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
        "BACKTRACK_MVP": "mvp",
        "BACKTRACK_DIR": "direction"
      },
      "guards": {
        "APPROVE": {
          "6cs_all_pass": true,
          "no_unresolved_conflicts": true
        }
      }
    }
  }
}
```

### 4.5 Backtrack Behavior

- Any layer can backtrack to any previous layer
- All history is preserved on backtrack (previous selections, abandoned directions, abandonment reasons)
- AI leverages history when re-diverging to optimize output

### 4.6 Output Artifacts

**specs/discover.json** — Contract: final locked output

```json
{
  "phase": "discover",
  "version": "1.0",
  "status": "approved",
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
    "rationale": ""
  },
  "tech_direction": {
    "stack": [],
    "architecture_style": "",
    "rationale": ""
  },
  "requirements": [
    {
      "id": "REQ-001",
      "user_story": "As a [role], I want [feature], so that [benefit]",
      "acceptance_criteria": [
        {
          "id": "REQ-001-AC-1",
          "type": "event_driven",
          "ears": "WHEN [event] THEN system SHALL [response]"
        },
        {
          "id": "REQ-001-AC-2",
          "type": "regression_guard",
          "ears": "WHEN [condition] THEN system SHALL CONTINUE TO [existing behavior]"
        }
      ],
      "source": "user_stated",
      "quality_assessment": {
        "clarity": "pass",
        "conciseness": "pass",
        "completeness": "pass",
        "consistency": "pass",
        "correctness": "pass",
        "concreteness": "pass"
      },
      "downstream_impact": {
        "tech_implications": "",
        "test_complexity": "",
        "effort_estimate": ""
      }
    }
  ],
  "mvp_features": [
    {
      "name": "",
      "feasibility": "feasible",
      "competitive_notes": "",
      "requirement_refs": []
    }
  ],
  "context_dependencies": []  // Empty: discover is the root stage with no upstream dependencies
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
      "action": "SELECT | MERGE | APPROVE | BACKTRACK | REVISE",
      "detail": "",
      "timestamp": ""
    }
  ]
}
```

- `/spec` reads only `discover.json`
- Human backtracks reference `discover_history.json`
- On backtrack to `/discover`, AI reads `discover_history.json` to leverage prior exploration

## 5. Stage 2: /spec — Faithful Translator

### 5.1 Positioning

Deterministic translation. Expands `/discover`'s locked requirements + technical direction into module-level executable specifications. Follows industry best practices. No re-divergence.

### 5.2 AI Role

- **Faithful expansion:** Translates requirements and architecture direction into module-level technical details
- **Best practices:** Module decomposition, interface design, data modeling follow industry conventions
- **Autonomous low-risk decisions:** Equivalent alternatives are auto-selected and recorded in `auto_decisions`
- **No self-resolution of contradictions:** Reports issues and recommends backtracking to `/discover`

### 5.3 Input

Reads only `specs/discover.json`: requirements list, tech stack + architecture style, hard constraints.

### 5.4 Output Artifact: specs/spec.json

```json
{
  "phase": "spec",
  "version": "1.0",
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
          "api_detail": null
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
      "requirement_refs": []
    }
  ],
  "dependency_graph": {
    "edges": [
      { "from": "MOD-001", "to": "MOD-002", "type": "calls | subscribes | depends" }
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
      "impact": ""
    }
  ],
  "context_dependencies": ["specs/discover.json"]
}
```

**state_machine (optional, per module):**

```json
{
  "states": ["created", "in_progress", "completed", "archived"],
  "transitions": [
    { "from": "created", "to": "in_progress", "event": "START" }
  ],
  "illegal_transitions": [
    { "from": "completed", "to": "created", "reason": "Cannot revert completed items" }
  ]
}
```

### 5.5 Human Checkpoint

Configurable in workflow.json — `checkpoint: "optional"`:

- **Auto mode (default):** /spec completes and proceeds directly to /build
- **Review mode:** /spec pauses after completion; user reviews spec.json before proceeding

Review focus areas:
- `auto_decisions` — any disagreements with autonomous choices
- Module decomposition — reasonable boundaries and responsibilities
- Non-functional constraints — correctly assigned to modules

### 5.6 Exception Handling

| Situation | AI Behavior |
|-----------|------------|
| discover.json has contradictions | Terminate /spec, generate contradiction report, recommend backtrack to /discover |
| Information gap, obvious fill with no architecture impact | Auto-fill, record in `auto_decisions` (e.g., "Export format unspecified, defaulting to CSV + PDF") |
| Information gap, multiple options with architecture impact | Pause, present options and their impacts to user, await decision |

## 6. Stage 3: /build — Autonomous Executor

### 6.1 Positioning

Autonomous executor. Follows industry best practices. Implements per spec.json via per-module TDD cycles. Human involvement near zero.

### 6.2 AI Role

- **Autonomous planning:** Reads spec.json, decides module execution order based on dependency graph + risk assessment, outputs execution plan to black box
- **TDD cycles:** Per module — generate tests, write implementation, pass, next
- **Tiered exception handling:** Self-resolves or escalates based on severity
- **Best practices:** Coding standards, design patterns, testing strategies follow industry conventions

### 6.3 Input

- `specs/spec.json`: Module specs, interface definitions, dependency graph, external dependencies, non-functional constraints
- `specs/discover.json`: Requirements list and acceptance criteria (for E2E test generation)

### 6.4 Execution Flow

```
/build starts
    |
    v
Step 1: Generate execution plan
    AI reads spec.json dependency graph + risk assessment
    Outputs module execution order + rationale -> black box
    |
    v
Step 2: Generate tests.json
    Derives all test cases from spec.json interfaces + discover.json acceptance criteria
    |
    +-- Optional human checkpoint (configurable in workflow.json)
    |   +-- Review mode: pause, user reviews, then proceed
    |   +-- Auto mode: proceed directly
    |
    v
Step 3: Per-module TDD cycle
    For each module (in execution plan order):
    +-- 3a. Extract module's tests from tests.json -> write test code
    +-- 3b. Confirm tests fail (red)
    +-- 3c. Write minimal implementation to pass tests (green)
    +-- 3d. Refactor (if needed)
    +-- 3e. Mark module complete, next
    |
    +-- Retry limit: max_retries_per_module (configurable, default 3)
    |   Exceeded -> L3: terminate /build, generate diagnostic report,
    |   recommend backtrack to /spec or /discover
    |
    v
Step 4: Full verification
    All modules complete -> run all tests (unit + integration + E2E)
    |
    v
Step 5: Output build report
```

### 6.5 Output Artifacts

**specs/tests.json** — Test artifact (optional human review)

```json
{
  "phase": "build",
  "artifact": "tests",
  "test_suites": [
    {
      "type": "unit | integration | e2e | contract | state_transition",
      "module_ref": "MOD-001",
      "requirement_refs": ["REQ-001"],
      "cases": [
        {
          "id": "TEST-001",
          "description": "",
          "category": "normal | boundary | error | regression",
          "ears_ref": "REQ-001-AC-1",
          "input": "structured description, e.g. 'empty string'",
          "expected_output": "structured description, e.g. '400 Bad Request, message: name is required'",
          "setup": "preconditions, e.g. 'database contains 3 existing tasks'"
        }
      ]
    }
  ],
  "coverage_summary": {
    "requirements_covered": [],
    "requirements_uncovered": [],
    "state_transitions_covered": [],
    "illegal_transitions_tested": []
  },
  "context_dependencies": ["specs/spec.json", "specs/discover.json"]
}
```

**specs/build_report.json** — Execution report

```json
{
  "phase": "build",
  "artifact": "report",
  "execution_plan": {
    "module_order": [],
    "rationale": ""
  },
  "module_results": [
    {
      "module_id": "MOD-001",
      "status": "completed | failed | skipped",
      "tests_passed": 0,
      "tests_failed": 0,
      "retries": 0,
      "issues": [
        {
          "level": "L1 | L2 | L3",
          "description": "",
          "resolution": ""
        }
      ]
    }
  ],
  "test_summary": {
    "total": 0,
    "passed": 0,
    "failed": 0
  },
  "auto_decisions": [],
  "unresolved_issues": []
}
```

### 6.6 Tiered Exception Handling

| Level | Condition | AI Behavior | Examples |
|-------|-----------|-------------|----------|
| **L1 — Self-resolve** | Does not affect spec contract | Resolve + record in `auto_decisions` | Library version compatibility, code style choices, implementation detail optimization |
| **L2 — Pause & notify** | Affects spec contract | Pause execution, report problem + suggested solutions, await user decision | Interface signature change needed, feature degradation, performance constraint unachievable |
| **L3 — Terminate & backtrack** | Spec or requirement-level fundamental issue | Terminate /build, output diagnostic report, recommend backtrack target | Circular module dependencies, requirement logic contradictions exposed during implementation, retry limit exceeded |

**On L3:** Human re-enters at the decision layer (/discover or /spec), not the execution layer. If backtrack + re-run still fails, the product decision is to cut or simplify the feature — still a decision, not execution.

### 6.7 Retry Mechanism

- `max_retries_per_module`: Configurable in workflow.json (default: 3)
- On retry exhaustion: Always L3 — terminate and backtrack. There is no "human takes over /build" branch.
- Diagnostic report includes: failed module, each retry's attempted approach, failure analysis, recommended backtrack target (/spec or /discover)

### 6.8 Human Checkpoint

Single optional checkpoint at Step 2 (after tests.json generation):

- Configurable in workflow.json — `test_review_checkpoint: "optional" | "required"`
- Review focus: test coverage sufficiency, critical scenario coverage, correct requirement tracing

## 7. Artifact Directory Structure

```
specs/
+-- discover.json            Contract: locked requirements + tech direction
+-- discover_history.json    History: exploration process and decision log
+-- spec.json                Contract: module-level technical specifications
+-- tests.json               Contract: test cases with inputs/expected outputs
+-- build_report.json        Report: execution results and diagnostics
```

## 8. Evolution Roadmap

| Version | Focus |
|---------|-------|
| V1 (now) | Core pipeline on Claude Code. Pure md slash commands. Full re-run on backtrack. |
| V2 | Context management: upstream artifact auto-injection strategies. Incremental updates on backtrack. |
| V3 | Memory system: cross-project experience accumulation. Consistency checks on spec drift. |
| V4 | iOS runtime adapter for remote agent orchestration tool. |

## 9. Research References

### Adopted Practices

| Practice | Source | How Used |
|----------|--------|----------|
| EARS syntax for acceptance criteria | Kiro (Amazon) | Layer 3 requirement format |
| 6Cs quality framework | Copilot4DevOps (Microsoft) | Layer 3 quality gate (adapted to pass/fail) |
| Regression guard syntax (SHALL CONTINUE TO) | Kiro (Amazon) | Layer 3 requirement format |
| Least-to-Most prompting for interviews | LLMREI paper (OpenAI API) | Layer 1-3 progressive depth strategy |
| Steering / Constitution layer | GitHub Spec Kit, Kiro | Layer 1 constraint checklist |
| auto_decisions black box | Original design | /spec and /build artifact field |
| Three-document gate pattern | OpenAI Codex Cookbook | Artifact-gated stage progression |

### Identified Market Gaps (NoPilot's Differentiation)

- No existing tool chains requirement completeness assessment to downstream test generation
- 6Cs scoring as a closed-loop gate (fail -> re-ask -> re-score) does not exist
- Cross-stage traceability (requirement -> module -> test case) with structured JSON artifacts is rare
- "Failure routes to decision layer" philosophy is unique — existing tools either fail silently or dump users into code-level debugging
