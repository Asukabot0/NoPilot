
## NoPilot

AI Native development workflow. Run `/discover` → `/spec` → `/build` in order.

- `/discover` — Requirement space exploration (direction → MVP → requirement lock)
- `/spec` — Constrained design expansion (modules, interfaces, data models)
- `/build` — Autonomous TDD implementation (tracer bullet, per-module TDD, auto-acceptance)
- `/visualize` — Generate HTML dashboards for runtime artifacts in `specs/views/`

Artifacts live in `specs/`. Refer to `workflow.json` for state machines and guardrails.

Supervisor (intent guardian) and Critic (independent challenger) are core guardrails spawned at stage boundaries. Cannot be disabled.

## 当前状态

V1.2 Delivered (Schema 4.0)。35 个 .ts 文件，约 12100 行 TypeScript，482 个测试。9 个 open issues。当前分支: feat/issue-26-spec-resolver。

## Lash (Built-in Multi-Agent Build Orchestrator)

Lash is now integrated into NoPilot as a TypeScript npm package. Install via `npm install -g nopilot`, which provides both CLIs:
- `nopilot` — Framework tools (`/discover`, `/spec`, `/visualize`)
- `lash` — Build runtime (orchestration, Worker management, verification)

**Auto-trigger conditions:** When ALL of the following are met:
1. `specs/spec.json` exists (design is complete)
2. `specs/discover.json` exists (requirements are locked)
3. User intent involves building, implementing, or coding the designed system

→ Automatically follow `lash/prompts/lash-build.md` to orchestrate a multi-agent parallel build. No explicit `/build` or `/lash-build` command is needed.

When conditions 1-2 are met but user has not expressed build intent:
→ Mention that Lash is available: "Specs are ready. I can start a multi-agent parallel build whenever you are ready."

Lash architecture: Treats each AI coding platform (Claude Code, Codex, OpenCode) as a Worker agent. Spawns Workers via CLI, isolates them in git worktrees, runs tests externally, and applies Module Critic + Build Critic + Supervisor quality gates per NoPilot contract.

