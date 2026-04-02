# NoPilot — Agent Installation Guide

[中文版](docs/zh-CN/README_AGENT.md)

You are reading this because you want to install NoPilot in a project. NoPilot is a three-stage development workflow (`/discover` → `/spec` → `/build`) that runs as Claude Code slash commands.

## Prerequisites

- Claude Code CLI installed and authenticated
- A project directory (empty or existing — V1 supports Greenfield only)

## Installation

### 1. Copy workflow files into your project

```bash
# From the NoPilot repo, copy these into your target project:
cp workflow.json /path/to/your/project/
cp -r .claude/commands/ /path/to/your/project/.claude/commands/
mkdir -p /path/to/your/project/specs
```

Your project should now have:

```
your-project/
├── workflow.json
├── .claude/
│   └── commands/
│       ├── discover.md
│       ├── spec.md
│       ├── build.md
│       ├── supervisor.md
│       └── critic.md
└── specs/                  # Artifacts will be written here at runtime
```

### 2. That's it

No dependencies. No build step. No configuration. The slash commands are self-contained.

## Usage

Run the three commands in order inside Claude Code:

```
/discover    →    /spec    →    /build
```

### /discover

Explores the requirement space. You provide a project idea, AI generates possibilities, you make decisions.

**What happens:**
1. Step 0: AI asks about constraints (tech stack, platform, timeline, etc.) and recommends `full` or `lite` mode
2. Layer 1: AI generates 3-5 product directions. You pick one.
3. Layer 2: AI expands into feature list + tech recommendation + failure scenarios. You prune and confirm.
4. Layer 3: AI generates detailed requirements with acceptance criteria. You review and approve.

**Artifacts produced:** `specs/discover.json`, `specs/discover_history.json`

### /spec

Expands requirements into module-level technical specifications. Mostly autonomous — only pauses if issues found.

**What happens:**
1. AI reads `specs/discover.json` and designs modules, interfaces, data models
2. Critic agent (independent session) verifies spec satisfies all requirements
3. Supervisor agent checks for complexity drift
4. If no issues: auto-continues. If issues found: pauses for your review.

**Artifacts produced:** `specs/spec.json`, `specs/spec_review.json`

### /build

Autonomous TDD implementation. Near-zero human involvement.

**What happens:**
1. AI generates execution plan and test cases
2. Tracer bullet: implements thinnest end-to-end slice to validate assumptions
3. Per-module TDD: test → implement → pass → next module
4. Auto-acceptance: verifies code actually matches your original intent
5. Supervisor checks final output coherence

**Artifacts produced:** `specs/tests.json`, `specs/build_report.json`, and your project code

## Modes

- **full** (default): Complete workflow with all guardrails. For real projects.
- **lite**: Reduced ceremony. Skips multi-direction divergence, simplified requirements format. AI recommends mode after constraint collection.

## Backtracking

At any point you can say "go back" and the workflow backtracks to an earlier stage. Safety limits: max 3 backtracks total, cycle detection prevents infinite loops.

## Exception Handling During /build

| Level | What Happened | AI Behavior |
|-------|--------------|-------------|
| L0 | Environment issue (API down, wrong config) | Auto-retries, then asks you to fix infra |
| L1 | Implementation detail (no contract impact) | Self-resolves silently |
| L2 | Affects spec contract | Pauses. You choose: accept degradation, cut feature, retry differently, or backtrack |
| L3 | Fundamental issue | Terminates. You decide: backtrack to /spec or /discover |

You never need to write or debug code. L2 decisions are product-level ("cut this feature"), not code-level ("fix this function").

## Customization

Edit `workflow.json` to:
- Change mode default (`full` / `lite`)
- Adjust retry limits (`max_retries_per_module`, `max_backtrack_count`)
- Toggle enhancement guardrails (`tracer_bullet`, `mutation_testing`, `multi_sample_6cs`)
- Modify constraint dimensions for Step 0

Core guardrails (Supervisor, Critic, backward verification, auto-acceptance) cannot be disabled — they define correctness.

## Artifact Reference

All artifacts are JSON files in `specs/`:

| File | Written By | Purpose |
|------|-----------|---------|
| `discover.json` | /discover | Locked requirements, tech direction, invariants, core scenarios |
| `discover_history.json` | /discover | Exploration decisions and backtrack log |
| `spec.json` | /spec | Module definitions, interfaces, data models, dependency graph |
| `spec_review.json` | /spec | Critic + Supervisor verification results |
| `tests.json` | /build | Test cases (example-based + property-based) |
| `build_report.json` | /build | Execution results, amendments, diagnostics |

Each downstream stage reads upstream artifacts automatically. You don't need to pass files manually.
