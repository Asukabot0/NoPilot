
## NoPilot Domain Skill 触发规则（覆盖 superpowers 默认行为）

`/discover`、`/spec`、`/build`、`/lash-build`、`/visualize` 是工作流执行入口，触发会创建或修改 `specs/` 产物。
检测到相关意图时，**必须先询问用户确认**，不得自动触发。
只有用户明确表示"开始"、"执行"、"是的"后，才加载对应 skill。
显式输入 `/discover` 等命令视为已确认，直接执行。

## NoPilot

AI Native development workflow. Run `/discover` → `/spec` → `/build` in order.

- `/discover` — Requirement space exploration (direction → MVP → requirement lock)
- `/spec` — Constrained design expansion (modules, interfaces, data models)
- `/build` — Autonomous TDD implementation (tracer bullet, per-module TDD, auto-acceptance)
- `/visualize` — Generate HTML dashboards for runtime artifacts in `specs/views/`

Artifacts live in `specs/`. Refer to `workflow.json` for state machines and guardrails.

Supervisor (intent guardian) and Critic (independent challenger) are core guardrails spawned at stage boundaries. Cannot be disabled.

## 当前状态

V0.0.2 Released (main)。48 个 .ts 文件，16367 行 TypeScript，482 个测试。8 个 open issues。Discover UI Taste 集成待完成。

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


## Lash (Auto-triggered Multi-Agent Build Orchestrator)

When ALL of the following conditions are met:
1. Spec artifact exists: `specs/spec.json` OR `specs/spec/index.json` (design is complete)
2. Discover artifact exists: `specs/discover.json` OR `specs/discover/index.json` (requirements are locked)
3. User intent involves building, implementing, or coding the designed system

→ Invoke `/lash-build` to orchestrate a multi-agent parallel build.

Lash treats each AI coding platform (Claude Code, Codex, OpenCode) as a Worker agent.
Lash auto-detects single-file vs split-directory format for spec and discover artifacts.

NoPilot schemas and workflow definition are in the npm package.
Run `nopilot paths` to locate them.
