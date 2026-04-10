# NoPilot — Agent Reference

NoPilot is an AI Native three-stage development workflow (`discover` → `spec` → `build`) distributed as installed skills for Claude Code, Codex, and OpenCode.

## Installation

### 1. Install and initialize

```bash
npm install -g nopilot
cd /path/to/project
nopilot init
```

`nopilot init` will:

- render package skills from `commands/` into `~/.claude/skills/` for Claude Code
- render the same skill set into `~/.agents/skills/` for Codex and OpenCode
- create `specs/` with `.gitkeep`
- append Lash auto-trigger context to any existing `CLAUDE.md`, `AGENTS.md`, or `opencode.md`

Result:

```
project/
├── specs/
│   └── .gitkeep
├── CLAUDE.md            # Existing project context file, if present
└── ...
```

Global skill directories populated by `nopilot init`:

```
~/.claude/skills/        # Claude Code
~/.agents/skills/        # Shared by Codex and OpenCode
```

### 2. Reference: injected context block

`nopilot init` appends this block to any existing project `CLAUDE.md`, `AGENTS.md`, or `opencode.md`:

```markdown
## NoPilot

AI Native development workflow. Run `/discover` → `/spec` → `/build` in order.

- `/discover` — Requirement space exploration (direction → MVP → requirement lock)
- `/spec` — Constrained design expansion (modules, interfaces, data models)
- `/build` — Autonomous TDD implementation (tracer bullet, per-module TDD, auto-acceptance)
- `/visualize` — Generate HTML dashboards for runtime artifacts in `specs/views/`

Artifacts live in `specs/`. Refer to `workflow.json` for state machines and guardrails.

Supervisor (intent guardian) and Critic (independent challenger) are core guardrails spawned at stage boundaries. Cannot be disabled.
```

### 3. Done

Schemas and `workflow.json` remain in the npm package. Run `nopilot paths` to locate them.

---

## Technical Reference

### Commands

| Command | Reads | Writes |
|---------|-------|--------|
| `/discover` | (user input only) | `specs/discover.json` or `specs/discover/index.json`, `specs/discover_history.json` or `specs/discover/history.json`, `specs/discover_review.json` |
| `/spec` | `specs/discover.json` or `specs/discover/index.json` | `specs/spec.json` or `specs/spec/index.json`, `specs/spec_review.json` |
| `/build` | `specs/spec.json` or `specs/spec/index.json`, `specs/discover.json` or `specs/discover/index.json` | `specs/tests.json` or `specs/tests/index.json`, `specs/tests_review.json`, `specs/build_report.json` or `specs/build/index.json`, `specs/build_review.json` |
| `/visualize` | Runtime artifacts in `specs/` | `specs/views/dashboard.html` plus phase pages |

Source skills live under `commands/` as a mix of directory skills (for example `discover/`, `spec/`, `build/`, `visualize/`, `supervisor/`, `critic/`, `lash-tracer/`, `lash-verify/`) and standalone markdown entrypoints (for example `lash-build.md`, `lash-batch.md`, `lash-orchestrator.md`). `nopilot init` renders them into each platform's `skillsDir`.

### Workflow Definition

`workflow.json` contains:
- State machines for all three stages (states, events, guards)
- Backtrack triggers and safety limits (`max_backtrack_count: 3`, cycle detection)
- Enhancement guardrail toggles (`tracer_bullet`, `mutation_testing`, `multi_sample_6cs`)
- Mode (`full` or `lite`) is determined during /discover Step 0 and stored in `discover.json.mode`
- Large artifacts may use `index.json` + child files instead of a single JSON file

### Agents

Two sub-agents spawned by commands. Both **core guardrails** (cannot be disabled):

| Agent | Source Skill | Role | Spawned By |
|-------|--------------|------|------------|
| Supervisor | `commands/supervisor/SKILL.md` | Global coherence (forest) | discover, spec, build |
| Critic | `commands/critic/SKILL.md` | Independent quality verification (trees) | discover, spec, build |

**Supervisor input:** discover artifact anchor (`constraints` + `selected_direction` + `tech_direction`) + current stage output.

**Critic input per phase:**
- `/discover`: discover artifact only → 6Cs quality audit, invariant verification, acceptance criteria testability, coverage check → writes `discover_review.json`
- `/spec`: discover artifact + spec artifact → backward verification, undeclared behavior check → writes `spec_review.json`
- `/build` test review: tests artifact + spec artifact + discover artifact → independent test quality review → writes `tests_review.json`
- `/build` acceptance review: discover artifact + actual code → independent scenario walkthrough → writes `build_review.json`

### ID Naming

| Entity | Format | Example |
|--------|--------|---------|
| Requirement | `REQ-xxx` | `REQ-001` |
| Acceptance criterion | `REQ-xxx-AC-n` | `REQ-001-AC-1` |
| Invariant | `INV-xxx` | `INV-001` |
| Module | `MOD-xxx` | `MOD-001` |
| Core scenario | `SCENARIO-xxx` | `SCENARIO-001` |
| Test case | `TEST-xxx` | `TEST-001` |
| Property test | `PROP-xxx` | `PROP-001` |

### Traceability Chain

```
discover.json          spec.json              tests.json
REQ-xxx      ───────→  MOD-xxx                TEST-xxx
  requirement_refs ←──   requirement_refs ←──   requirement_refs
  acceptance_criteria    acceptance_criteria_refs  ears_ref

INV-xxx      ───────→  MOD-xxx                PROP-xxx
                         invariant_refs   ←──   invariant_ref

SCENARIO-xxx ───────→  tracer bullet path  ──→ auto-acceptance
```

Coverage guards in `tests.json` enforce that every REQ and INV is covered.

### State Machine Events

**discover:** `SELECT`, `MERGE`, `REJECT_ALL`, `APPROVE`, `BACKTRACK`, `REVISE`, `FORCE_OVERRIDE`, `BACKTRACK_MVP`, `BACKTRACK_DIR`

**spec:** `COMPLETE`, `CONTRADICTION`, `GAP_HIGH_IMPACT`, `USER_DECISION`, `L0_ISSUE`, `REVIEW_CLEAN`, `REVIEW_HAS_ISSUES`, `REVIEW_FIXABLE`, `APPROVED`, `CHANGES_REQUESTED`

**build:** `PLAN_READY`, `TESTS_GENERATED_REVIEW`, `TESTS_GENERATED_AUTO`, `TEST_REVIEW_PASSED`, `TEST_REVIEW_FAILED`, `TRACER_PASS`, `TRACER_L0L1_FAIL`, `TRACER_L2L3_FAIL`, `SKIP`, `ALL_MODULES_DONE`, `L0_ISSUE`, `L1_RESOLVED`, `L2_ISSUE`, `L3_ISSUE`, `ENV_RESOLVED`, `ENV_EXHAUSTED_WITH_ALT`, `ENV_EXHAUSTED_NO_ALT`, `ACCEPT_DEGRADATION`, `CUT_FEATURE`, `MODIFY_SPEC`, `RETRY_DIFFERENT_APPROACH`, `BACKTRACK_DISCOVER`, `BACKTRACK_SPEC`, `AMENDMENT_RECORDED`, `REPLAN_READY`, `REPLAN_INCOMPLETE`, `ALL_PASS`, `FAILURES`, `ACCEPTANCE_PASS`, `ACCEPTANCE_FAIL_L2`, `ACCEPTANCE_FAIL_L3`

### Exception Tiers (build)

| Tier | Impact | Action |
|------|--------|--------|
| L0 | Environment | Auto-retry |
| L1 | No contract impact | Self-resolve + record |
| L2 | Contract impact | Pause for product decision |
| L3 | Fundamental | Terminate + backtrack |

L2 accepts only: `ACCEPT_DEGRADATION`, `CUT_FEATURE`, `MODIFY_SPEC`, `RETRY_DIFFERENT_APPROACH`, `BACKTRACK_DISCOVER`. Reject code-level instructions.

### Modes

- **full**: All guardrails, independent Critic sessions, tracer bullet enabled
- **lite**: Skip Layer 1 divergence, simplified quality checks, same-session Critic, tracer bullet disabled
