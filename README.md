# NoPilot

[中文版](docs/zh-CN/README.md)

An AI Native personal development workflow framework for Greenfield projects.

## What It Is

NoPilot is a three-stage workflow that takes you from requirement exploration to shipping code with minimal human involvement downstream. Each stage builds on the previous, with AI handling possibility generation and execution while humans make decisions.

**Stages:**
- `/discover` — Progressive idea collection → direction selection → MVP definition → design philosophy → requirement lock
- `/spec` — Expand locked requirements into module-level design specifications
- `/build` — Autonomous TDD implementation with tracer bullet validation and independent acceptance review
- `/visualize` — Generate interactive HTML dashboards from JSON artifacts

**What you get:** Structured JSON artifacts at each stage that serve as machine-readable contracts, with HTML visualization for human review. Perfect traceability from requirements through to delivered code.

## Long-term Vision

NoPilot's North Star is an **enterprise-grade AI delivery governance platform** — a control layer
that lets organizations adopt AI coding agents (Claude Code, Codex, Cursor, Copilot, OpenCode, …)
without losing auditability, contract integrity, or release safety.

We get there in three stages, each building on the previous:

1. **Personal layer (current — V1.x):** Single-developer Greenfield workflow framework.
   Spec-as-contract, generation-review separation, multi-agent orchestration via Lash.
2. **Team layer (V2 → V3):** Shared specs and decision ledger, PR / issue / CI-failure entry points,
   web dashboard for traceability, multi-model verification, MCP enforcement.
3. **Enterprise layer (V4 → North Star):** SSO/RBAC, audit logs, private deployment,
   compliance reports, AI Delivery Governance — risk-tiered release contracts that integrate with
   (never replace) the team's existing CI/CD, feature flags, APM, and incident management tools.

The framing is consistent across all three stages: **NoPilot governs the AI-generated change;
existing infrastructure executes it.**

## Installation

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- Codex CLI and OpenCode CLI are also supported for shared skill installation and Lash workers
- Node.js >= 20.0.0

### Install

```bash
npm install -g nopilot
```

This installs two CLIs:
- `nopilot` — Framework tools (project initialization)
- `lash` — Build runtime (multi-agent orchestration)

### Initialize a project

```bash
cd your-project
nopilot init
```

This renders the package skills from `commands/` into `~/.claude/skills/` for Claude Code and `~/.agents/skills/` for Codex/OpenCode (shared), creates the `specs/` directory, and appends Lash auto-trigger context to any existing `CLAUDE.md`, `AGENTS.md`, or `opencode.md`. Schemas and `workflow.json` stay in the npm package — run `nopilot paths` to locate them.

### Start using

Open your AI coding tool and start from the installed `discover` skill.

```bash
claude   # Claude Code: then run /discover
```

Codex and OpenCode share the installed skills under `~/.agents/skills/`.

## Why This Approach

1. **Humans are decision-makers, not executors.** You define intent and choose from possibilities. AI generates options and runs them. You never say "how" — only "which one."

2. **Less human involvement downstream.** Deep participation in `/discover` (where direction is uncertain) means you can go AFK during `/build` (where direction is locked).

3. **All dimensions appear simultaneously.** Requirements, feasibility, competitive risks, and effort emerge together so you decide with full context.

4. **Spec is contract, not document.** Every output is structured JSON consumed by downstream stages.

5. **AI autonomy with full audit trail.** Low-risk technical details are decided by AI without interrupting flow. Every decision gets recorded.

6. **Failures route to decisions, not execution.** When something breaks, it means an upstream decision needs revision, not that code needs debugging.

## Non-Goals

To keep NoPilot focused, we explicitly **do not** plan to:

- **Replace CI/CD pipelines.** Jenkins, GitHub Actions, ArgoCD, Spinnaker remain the executors.
  NoPilot produces release contracts they consume.
- **Replace feature flag platforms.** LaunchDarkly, Unleash, Statsig keep their role.
  NoPilot recommends flag configuration based on spec risk tier.
- **Replace APM / observability tools.** Sentry, Datadog, New Relic continue to monitor production.
  NoPilot consumes their signals as post-deploy verification evidence.
- **Replace incident management.** PagerDuty, Opsgenie keep handling on-call.
  NoPilot supplies change provenance and rollback recommendations when an incident is linked back.
- **Write to production databases or invoke paid third-party APIs without human approval.**
- **Promise L5 fully-autonomous delivery.** Risk-tier L3 (security, payments, permissions,
  data migration, compliance) always requires human approval, by design.

### Risk-tier Autonomy (at a glance)

| Tier | Scope | Autonomy | Approval |
|---|---|---|---|
| **L1** | Docs, configs, internal tools, low-risk UI tweaks | Auto-PR + auto-merge to non-prod | None required (audited) |
| **L2** | Standard business features | Auto-PR + auto-verification | Human approval before prod |
| **L3** | Security, auth/permissions, payments, data migration, compliance | NoPilot only produces evidence + rollback plan | Human approval **always required** |

> **Orthogonal to the L0–L3 exception tiers.** Exception tier describes "how a failure is routed",
> risk tier describes "how autonomously a task may execute". Both coexist.

## Workflow

```
/discover    # Collect idea → explore directions → lock requirements
→ /spec      # Design to module level
→ /build     # Implement with TDD
→ /visualize # Generate HTML dashboards for human review
```

Each command reads upstream artifacts from `specs/` and writes its own. All artifacts are JSON contracts consumed by downstream stages.

## Architecture

### Supervisor + Critic Agents

Two independent agents provide cross-cutting quality assurance. Both are **core guardrails** (cannot be disabled):

**Supervisor — Intent Guardian (telescope)**
- Monitors whether the overall output still matches your original intent and constraints
- Systematic drift detection: scope creep, gold plating, tech-driven drift, requirement dilution, constraint erosion
- Quantitative drift scoring (0-100) with recommended actions, not just binary pass/fail
- Checks design philosophy compliance and decision chain analysis

**Critic — Independent Challenger (magnifying glass)**
- The **sole quality evaluator** — generating agents must never self-approve their own output
- AI bias detection catalog: over-engineering, optimistic assessment, missing negative paths, concept conflation, self-approval bias, anchoring, symmetric completion
- Floating iteration caps (3/5/7-10 by complexity) with trend evaluation at limits
- Activated at checkpoints: requirement lock, spec backward verification, build test review, build acceptance review

### Framework Principles (V4.0)

1. **Generation-review separation:** Generating agents must never evaluate their own output. All review is performed by independent Critic instances in isolated sessions.
2. **Iterative verification:** Review cycles use fresh agent instances each round to avoid anchoring bias. Iteration limits float by complexity with trend evaluation (converging → extend, diverging → escalate model, oscillating → escalate human).
3. **Agent consensus:** Before escalating to the human, the executing agent spawns a consulting agent anchored on design philosophy and first principles to attempt resolution. *(declared, incrementally adopting)*

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

After `nopilot init`, your project gets:

```
your-project/
├── specs/                   # Runtime artifacts (generated by commands)
│   ├── discover.json        # or discover/index.json + child files
│   ├── spec.json            # or spec/index.json + child files
│   ├── build_report.json    # or build/index.json + child files
│   └── ...
└── CLAUDE.md               # Project context with Lash auto-trigger
```

Global files installed by `nopilot init`:

```
~/.claude/skills/            # Claude Code skills (global, shared across projects)
├── discover/
├── spec/
├── build/
├── visualize/
├── supervisor/
├── critic/
├── lash-tracer/
├── lash-verify/
├── lash-build/
└── ...

~/.agents/skills/            # Shared by Codex and OpenCode
├── discover/
├── spec/
├── build/
├── visualize/
├── supervisor/
├── critic/
├── lash-tracer/
├── lash-verify/
├── lash-build/
└── ...
```

Package source skills live under `commands/` and are rendered into platform-specific skill directories by `nopilot init`.

Schemas (25 JSON Schema files) and `workflow.json` stay in the npm package. Run `nopilot paths` to locate them.

## Current Scope (V1.2, Schema 4.0)

**Included:** Three-stage workflow with unified skill distribution for Claude Code, Codex, and OpenCode, Greenfield projects, pure prompt engineering, full core guardrails (Supervisor with drift detection, Critic with AI bias catalog), generation-review separation, progressive idea collection, design philosophy extraction, completeness tracking, domain model and NFR outputs, artifact visualization, directory-split support for large projects, integrated Lash multi-agent build engine (TypeScript), dual CLI (`nopilot` + `lash`), npm distribution.

**Not included:** Brownfield/incremental iteration, agent consensus (declared, not yet wired), iOS remote agent, multi-model routing.

## License

MIT
