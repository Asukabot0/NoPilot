# NoPilot

[中文版](docs/zh-CN/README.md)

An AI Native personal development workflow framework for Greenfield projects.

## What It Is

NoPilot is a three-stage workflow that takes you from requirement exploration to shipping code with minimal human involvement downstream. Each stage builds on the previous, with AI handling possibility generation and execution while humans make decisions.

**Stages:**
- `/discover` — Explore the requirement space through three layers: direction selection → MVP definition → requirement lock
- `/spec` — Expand locked requirements into module-level design specifications
- `/build` — Autonomous TDD implementation with tracer bullet validation and auto-acceptance

**What you get:** Structured JSON artifacts at each stage that serve as machine-readable contracts, ensuring perfect traceability from requirements through to delivered code.

## Installation

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and configured

### Step 1: Copy NoPilot into your project

```bash
# Clone NoPilot
git clone https://github.com/Asukabot0/NoPilot.git

# Copy the framework files into your project
cp -r NoPilot/.claude/commands/ your-project/.claude/commands/
cp NoPilot/workflow.json your-project/
mkdir -p your-project/specs
```

Or add as a git subtree:

```bash
cd your-project
git subtree add --prefix=.nopilot https://github.com/Asukabot0/NoPilot.git main --squash
# Then copy the files into place
cp -r .nopilot/.claude/commands/ .claude/commands/
cp .nopilot/workflow.json ./
mkdir -p specs
```

### Step 2: Add NoPilot context to your CLAUDE.md

Add the following to your project's `CLAUDE.md` (create one if it doesn't exist):

```markdown
## NoPilot

AI Native development workflow framework.

### Commands

- `/discover` — Requirement space exploration. Three-layer convergence funnel: direction → MVP → requirement lock.
- `/spec` — Constrained design expansion. Translates discover.json into module-level specifications.
- `/build` — Autonomous TDD implementation. Generates tests, tracer bullet, per-module TDD, auto-acceptance.

### Workflow

Run commands in order: `/discover` → `/spec` → `/build`

Each command reads upstream artifacts from `specs/` and writes its own artifacts there.
Refer to `workflow.json` for state machine definitions and guardrail configuration.

### Artifacts

All structured artifacts live in `specs/`. These are machine-readable JSON contracts consumed by downstream stages.

### Agents

- **Supervisor** (intent guardian): Spawned at stage completion to check global coherence.
- **Critic** (independent challenger): Spawned at checkpoints in independent session for quality verification.

Both are core guardrails and cannot be disabled.
```

### Step 3: Start using

```bash
cd your-project
claude   # Open Claude Code
```

Then type `/discover` to begin exploring your project space.

## Why This Approach

1. **Humans are decision-makers, not executors.** You define intent and choose from possibilities. AI generates options and runs them. You never say "how" — only "which one."

2. **Less human involvement downstream.** Deep participation in `/discover` (where direction is uncertain) means you can go AFK during `/build` (where direction is locked).

3. **All dimensions appear simultaneously.** Requirements, feasibility, competitive risks, and effort emerge together so you decide with full context.

4. **Spec is contract, not document.** Every output is structured JSON consumed by downstream stages.

5. **AI autonomy with full audit trail.** Low-risk technical details are decided by AI without interrupting flow. Every decision gets recorded.

6. **Failures route to decisions, not execution.** When something breaks, it means an upstream decision needs revision, not that code needs debugging.

## Workflow

```
/discover    # Lock requirements
→ /spec      # Design to module level
→ /build     # Implement with TDD
```

Each command reads upstream artifacts from `specs/` and writes its own. All artifacts are JSON contracts consumed by downstream stages.

## Architecture

### Supervisor + Critic Agents

Two independent agents provide cross-cutting quality assurance. Both are **core guardrails** (cannot be disabled):

**Supervisor — Intent Guardian (telescope)**
- Monitors whether the overall output still matches your original intent and constraints
- Activated at stage completion: after `/discover`, `/spec`, `/build`
- Detects cumulative drift (each decision locally reasonable, but aggregate result diverged)

**Critic — Independent Challenger (magnifying glass)**
- Provides adversarial quality review in isolated session (no shared generation context)
- Prevents "same AI grades its own work" by running independently
- Activated at checkpoints: requirement lock, spec backward verification, build scenario verification

### Key Concepts

**Artifacts (generated at runtime in `specs/`):**
- `discover.json` — Locked requirements with acceptance criteria and invariants
- `discover_history.json` — Exploration log of directions considered and decisions made
- `spec.json` — Module decomposition, interfaces, data models, dependency graph
- `spec_review.json` — Backward verification and global coherence check results
- `tests.json` — Test cases derived from requirements and invariants
- `build_report.json` — Execution plan, TDD results, auto-acceptance verification

**Exception Handling (Tiered):**
- L0/L1: Environmental or low-impact → AI self-fixes
- L2: Contract-impacting → Pause for product decision (accept degradation, cut feature, modify spec, retry, backtrack)
- L3: Fundamental issue → Diagnostic report + choice to backtrack

**Backtrack Safety:**
- Max 3 backtracks total across all stages
- Cycle detection: if A→B→A→B repeats, terminate and report
- Cost awareness: users informed of re-run time before confirming backtrack

## File Structure

```
your-project/
├── .claude/commands/
│   ├── discover.md      # /discover slash command
│   ├── spec.md          # /spec slash command
│   ├── build.md         # /build slash command
│   ├── supervisor.md    # Supervisor agent (spawned by commands)
│   └── critic.md        # Critic agent (spawned by commands)
├── specs/               # Runtime artifacts (generated by commands)
│   ├── discover.json
│   ├── discover_history.json
│   ├── spec.json
│   ├── spec_review.json
│   ├── tests.json
│   └── build_report.json
├── workflow.json         # Master workflow definition
└── CLAUDE.md            # Your project context (add NoPilot section)
```

## V1 Scope

**Included:** Three-stage workflow on Claude Code, Greenfield projects, pure prompt engineering, full core guardrails (Supervisor, Critic, backward verification, auto-acceptance).

**Not included:** Brownfield/incremental iteration (V2), iOS remote agent (V4), multi-model routing (V3+).

## License

MIT
