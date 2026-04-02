# NoPilot

AI Native personal development workflow framework.

## Commands

- `/discover` — Requirement space exploration. Three-layer convergence funnel: direction → MVP → requirement lock.
- `/spec` — Constrained design expansion. Translates discover.json into module-level specifications.
- `/build` — Autonomous TDD implementation. Generates tests, tracer bullet, per-module TDD, auto-acceptance.

## Workflow

Run commands in order: `/discover` → `/spec` → `/build`

Each command reads upstream artifacts from `specs/` and writes its own artifacts there.
Refer to `workflow.json` for state machine definitions and guardrail configuration.

## Artifacts

All structured artifacts live in `specs/`. These are machine-readable JSON contracts consumed by downstream stages.

## Agents

- **Supervisor** (intent guardian): Spawned at stage completion to check global coherence.
- **Critic** (independent challenger): Spawned at checkpoints in independent session for quality verification.

Both are core guardrails and cannot be disabled.
