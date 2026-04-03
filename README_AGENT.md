# NoPilot — Agent Reference

NoPilot is an AI Native three-stage development workflow (`/discover` → `/spec` → `/build`) running as Claude Code slash commands.

## Installation

### 1. Copy files into the target project

```bash
cp -r .claude/commands/ /path/to/project/.claude/commands/
cp workflow.json /path/to/project/
mkdir -p /path/to/project/specs
```

Result:

```
project/
├── .claude/commands/
│   ├── discover.md
│   ├── spec.md
│   ├── build.md
│   ├── supervisor.md
│   ├── critic.md
│   └── visualize.md
├── specs/               # Runtime artifacts (empty until first run)
└── workflow.json
```

### 2. Add context to the project's CLAUDE.md

Append to the project's `CLAUDE.md` (create if absent):

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

No dependencies. No build step. No config beyond the above.

---

## Technical Reference

### Commands

| Command | Reads | Writes |
|---------|-------|--------|
| `/discover` | (user input only) | `specs/discover.json` or `specs/discover/index.json`, `specs/discover_history.json` or `specs/discover/history.json`, `specs/discover_review.json` |
| `/spec` | `specs/discover.json` or `specs/discover/index.json` | `specs/spec.json` or `specs/spec/index.json`, `specs/spec_review.json` |
| `/build` | `specs/spec.json` or `specs/spec/index.json`, `specs/discover.json` or `specs/discover/index.json` | `specs/tests.json` or `specs/tests/index.json`, `specs/tests_review.json`, `specs/build_report.json` or `specs/build/index.json`, `specs/build_review.json` |
| `/visualize` | Runtime artifacts in `specs/` | `specs/views/dashboard.html` plus phase pages |

Each command is defined in `.claude/commands/<name>.md`. Read the command file for full behavior.

### Workflow Definition

`workflow.json` contains:
- State machines for all three stages (states, events, guards)
- Backtrack triggers and safety limits (`max_backtrack_count: 3`, cycle detection)
- Enhancement guardrail toggles (`tracer_bullet`, `mutation_testing`, `multi_sample_6cs`)
- Mode (`full` or `lite`) is determined during /discover Step 0 and stored in `discover.json.mode`
- Large artifacts may use `index.json` + child files instead of a single JSON file

### Agents

Two sub-agents spawned by commands. Both **core guardrails** (cannot be disabled):

| Agent | Prompt | Role | Spawned By |
|-------|--------|------|------------|
| Supervisor | `.claude/commands/supervisor.md` | Global coherence (forest) | /discover, /spec, /build |
| Critic | `.claude/commands/critic.md` | Independent quality verification (trees) | /discover, /spec, /build |

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
