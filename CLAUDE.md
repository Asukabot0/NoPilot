开发时默认合并到dev;仅在发布时合并到main
## NoPilot 开发说明

> 用户侧 CLAUDE 模板在 `CLAUDE.dev.md`，供用户安装 NoPilot 后复制到自己项目使用。
> Claude **不需要**加载 `CLAUDE.dev.md`——它是分发模板，不是当前仓库的指令。

## 当前状态

V0.0.7 Released (main)。83 个 .ts 文件，22451 行 TypeScript，808 个测试。11 个 open issues。Universal Skill Engine 已上线。OpenCode 已激活（与 Codex 共享 ~/.agents/skills/）。Benchmark 评测系统已上线。

## Lash (Auto-triggered Multi-Agent Build Orchestrator)

When ALL of the following conditions are met:
1. Spec artifact exists: `specs/spec.json` OR `specs/spec/index.json` (design is complete)
2. Discover artifact exists: `specs/discover.json` OR `specs/discover/index.json` (requirements are locked)
3. User intent involves building, implementing, or coding the designed system

→ Invoke the installed Lash build prompt to orchestrate a multi-agent parallel build:
  - Claude Code: `/lash-build`
  - Codex: `/prompts:lash-build`

Lash treats each AI coding platform (Claude Code, Codex, OpenCode) as a Worker agent.
Lash auto-detects single-file vs split-directory format for spec and discover artifacts.

NoPilot schemas and workflow definition are in the npm package.
Run `nopilot paths` to locate them.

## Stage Entry and Recovery Notes

- 显式输入 `/discover`、`/spec`、`/build` 或等价阶段指令（如“进 discover”“开始 spec”）视为已确认，直接进入对应阶段，不得重复询问是否开始。
- 当用户指出流程偏差、遗漏步骤或阶段判断错误时，必须重新加载当前阶段 SKILL.md，并输出 **已完成 / 待执行 / 下一步** 摘要后再继续。
