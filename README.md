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

## Why This Approach

Traditional development workflows separate concerns by phase (requirements → design → build), forcing sequential work and heavy human coordination at each boundary. NoPilot inverts the model:

1. **Humans are decision-makers, not executors.** You define intent and choose from possibilities. AI generates options and runs them. You never say "how" — only "which one."

2. **Less human involvement downstream.** Deep participation in `/discover` (where direction is uncertain) means you can go AFK during `/build` (where direction is locked). Better upstream decisions = less downstream babysitting.

3. **All dimensions appear simultaneously.** Requirements, feasibility, competitive risks, and effort don't come in separate phases — they emerge together so you decide with full context.

4. **Spec is contract, not document.** Every output is structured JSON consumed by downstream stages. When you need to review, adapters provide human-friendly summaries, not raw JSON.

5. **AI autonomy with full audit trail.** Low-risk technical details are decided by AI without interrupting flow. Every decision gets recorded so you can always trace why something happened.

6. **First principles upstream, best practices downstream.** Strategic questions are reasoned from fundamentals. Execution uses proven patterns. Speed where it counts; deliberation where it matters.

7. **Failures route to decisions, not execution.** When something breaks, it means an upstream decision needs revision, not that code needs debugging. Users request "try a different approach" (a decision), not "fix this bug" (code work).

8. **Guardrails serve current capabilities, not lock future ones.** Core guardrails (backward verification, auto-acceptance) define correctness. Enhancement guardrails (tracer bullet, mutation testing) are training wheels. As AI improves, enhancement guardrails can be individually reduced or disabled.

## Workflow

Run in order:

```bash
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
- When drift detected: pauses and presents diagnosis. You decide: accept complexity / cut scope / backtrack

**Critic — Independent Challenger (magnifying glass)**
- Provides adversarial quality review in isolated session (no shared generation context)
- Prevents "same AI grades its own work" by running independently
- Reads only final artifacts, never generation history
- Activated at checkpoints: requirement lock, spec backward verification, build scenario verification
- When issues found: attempts self-fix first (only current artifact, never upstream). If self-fix succeeds, continues. If not, pauses for you

**Relationship:** Supervisor watches direction (forest). Critic watches quality (trees). Independent, can run in parallel.

## V1 Scope

**What's included:**
- Three-stage workflow running on Claude Code as slash commands
- Greenfield projects only (new projects from scratch)
- Pure prompt engineering (no external services required)
- Full core guardrails (Supervisor, Critic, backward verification, auto-acceptance)
- Enhancement guardrails: tracer bullet enabled, mutation testing disabled

**What's not included:**
- Brownfield/incremental iteration (V2)
- iOS remote agent tool (V4)
- External model routing (V3+)
- Custom memory/context management (V2+)

## Getting Started

1. **Read the design spec:** `docs/superpowers/specs/2026-04-02-nopilot-workflow-design.md`
2. **Review the implementation plan:** `docs/superpowers/plans/2026-04-02-nopilot-v1.md`
3. **Understand workflow definition:** `workflow.json` contains all state machines, guardrails, and checkpoint logic
4. **Run in Claude Code:** Start with `/discover` to explore your project space

## Key Concepts

**Artifacts:**
- `specs/discover.json` — Locked requirements with acceptance criteria and invariants
- `specs/discover_history.json` — Exploration log of directions considered, features pruned, decisions made
- `specs/spec.json` — Module decomposition, interfaces, data models, dependency graph
- `specs/spec_review.json` — Backward verification and global coherence check results
- `specs/tests.json` — Test cases derived from requirements and invariants
- `specs/build_report.json` — Execution plan, TDD results, auto-acceptance verification, contract amendments

**Key Decision Points:**
- `/discover` Layer 1: Select product direction
- `/discover` Layer 2: Define MVP features and technical approach
- `/discover` Layer 3: Lock requirements with 6Cs quality checks
- `/spec` checkpoint: Review design before proceeding to build (auto-skip if clean)
- `/build` checkpoint: Review tests before implementation (optional by default)

**Exception Handling (Tiered):**
- L0/L1: Environmental issues or low-impact problems → AI self-fixes
- L2: Contract-impacting issues → Pause for product decision (accept degradation, cut feature, modify spec, retry different approach, backtrack)
- L3: Fundamental issues → Diagnostic report + choice to backtrack to spec or discover

**Backtrack Safety:**
- Max 3 backtracks total across all stages
- Cycle detection: if A→B→A→B repeats, terminate and report
- Cost awareness: users informed of re-run time before confirming backtrack

## Evolution Path

**V1:** Claude Code slash commands, Greenfield only, full enhancement guardrails
**V2:** Incremental iteration, custom memory systems, context management optimization
**V3:** Multi-model routing, external guardrails, advanced scheduling
**V4:** iOS remote agent with async orchestration

---

For implementation details, agent prompts, and workflow state machines, see:
- `/discover` command: `.claude/commands/discover.md`
- `/spec` command: `.claude/commands/spec.md`
- `/build` command: `.claude/commands/build.md`
- Supervisor agent: `.claude/commands/supervisor.md`
- Critic agent: `.claude/commands/critic.md`
- Workflow definition: `workflow.json`
