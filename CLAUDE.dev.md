## NoPilot

AI Native development workflow. Run `/discover` → `/spec` → `/build` in order.

- `/discover` — Requirement space exploration (direction → MVP → requirement lock)
- `/spec` — Constrained design expansion (modules, interfaces, data models)
- `/build` — Autonomous TDD implementation (tracer bullet, per-module TDD, auto-acceptance)
- `/visualize` — Generate HTML dashboards for runtime artifacts in `specs/views/`

Artifacts live in `specs/`. Refer to `workflow.json` for state machines and guardrails.

Supervisor (intent guardian) and Critic (independent challenger) are core guardrails spawned at stage boundaries. Cannot be disabled.

## NoPilot Domain Skill 触发规则

`/discover`、`/spec`、`/build`、`/lash-build`、`/visualize` 是工作流执行入口，触发会创建或修改 `specs/` 产物。
检测到相关意图时，**必须先询问用户确认**，不得自动触发。
只有用户明确表示"开始"、"执行"、"是的"后，才加载对应 skill。
显式输入 `/discover` 等命令视为已确认，直接执行。

## Lash (Auto-triggered Multi-Agent Build Orchestrator)

Lash is integrated into NoPilot as a TypeScript npm package. Install via `npm install -g nopilot`, which provides both CLIs:
- `nopilot` — Framework tools (`/discover`, `/spec`, `/visualize`)
- `lash` — Build runtime (orchestration, Worker management, verification)

When ALL of the following conditions are met:
1. Spec artifact exists: `specs/spec.json` OR `specs/spec/index.json` (design is complete)
2. Discover artifact exists: `specs/discover.json` OR `specs/discover/index.json` (requirements are locked)
3. User intent involves building, implementing, or coding the designed system

→ Invoke `/lash-build` to orchestrate a multi-agent parallel build.

When conditions 1-2 are met but user has not expressed build intent:
→ Mention that Lash is available: "Specs are ready. I can start a multi-agent parallel build whenever you are ready."

Lash treats each AI coding platform (Claude Code, Codex, OpenCode) as a Worker agent. Spawns Workers via CLI, isolates them in git worktrees, runs tests externally, and applies Module Critic + Build Critic + Supervisor quality gates per NoPilot contract. Lash auto-detects single-file vs split-directory format for spec and discover artifacts.

NoPilot schemas and workflow definition are in the npm package. Run `nopilot paths` to locate them.
