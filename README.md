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

### Option A: Project Install (recommended)

Installs NoPilot into a single project. Commands, workflow definition, and CLAUDE.md context — all self-contained.

```bash
git clone https://github.com/Asukabot0/NoPilot.git
cd NoPilot
./install.sh --project /path/to/your/project
```

This copies commands, `workflow.json`, `README_AGENT.md`, creates `specs/`, and appends NoPilot context to your `CLAUDE.md`.

### Option B: Global Install

Makes `/discover`, `/spec`, `/build` available in all Claude Code sessions. You still need `--project` per project for the project-level files.

```bash
git clone https://github.com/Asukabot0/NoPilot.git
cd NoPilot
./install.sh --global              # Commands → ~/.claude/commands/
./install.sh --project /path/to/your/project  # Project files + CLAUDE.md
```

### Start using

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
- Activated at checkpoints: requirement lock, spec backward verification, build test review, build acceptance review

### Key Concepts

**Artifacts (generated at runtime in `specs/`):**
- `discover.json` or `discover/index.json` — Locked requirements with acceptance criteria and invariants
- `discover_history.json` or `discover/history.json` — Exploration log of directions considered and decisions made
- `spec.json` or `spec/index.json` — Module decomposition, interfaces, data models, dependency graph
- `spec_review.json` — Backward verification and global coherence check results
- `tests.json` or `tests/index.json` — Test cases derived from requirements and invariants
- `tests_review.json` — Independent review of generated tests before implementation
- `build_report.json` or `build/index.json` — Execution plan, TDD results, auto-acceptance verification
- `build_review.json` — Independent acceptance review of the implemented product

For larger projects, NoPilot can split artifacts into `index.json` + child files so downstream agents load only the sections they need.

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
│   ├── critic.md        # Critic agent (spawned by commands)
│   └── visualize.md     # /visualize slash command
├── specs/               # Runtime artifacts (generated by commands)
│   ├── discover.json     # or discover/index.json + child files
│   ├── discover_history.json
│   ├── spec.json         # or spec/index.json + child files
│   ├── spec_review.json
│   ├── tests.json        # or tests/index.json + child files
│   ├── tests_review.json
│   ├── build_report.json # or build/index.json + child files
│   └── build_review.json
├── workflow.json         # Master workflow definition
└── CLAUDE.md            # Your project context (add NoPilot section)
```

## V1 Scope

**Included:** Three-stage workflow on Claude Code, Greenfield projects, pure prompt engineering, full core guardrails (Supervisor, Critic, backward verification, auto-acceptance).

**Not included:** Brownfield/incremental iteration (V2), iOS remote agent (V4), multi-model routing (V3+).

## License

MIT
