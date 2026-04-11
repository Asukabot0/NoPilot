# NoPilot 仓库整体架构

[English README](../../README.md)

本文档描述 NoPilot 仓库当前的正式实现架构，重点回答三个问题：

1. 这个仓库由哪些稳定子系统组成
2. 这些子系统之间通过什么资产和边界协作
3. 哪些目录属于包内资产、全局安装层和项目运行时层

本文以当前 TypeScript 实现、`workflow.json`、包配置与测试为准。

## 1. 架构总览

NoPilot 不是单一 CLI，而是由两条主线组成的仓库：

1. `nopilot` CLI：负责框架初始化、技能分发、包内资产定位
2. `lash` CLI：负责多 Agent 构建运行时、Worker 编排、测试验证与状态恢复

围绕这两条主线，仓库形成五个稳定子系统：

1. Universal Skill Engine
2. Lash Build Runtime
3. Profile Sidecar
4. UI Taste
5. Workflow / Schema Assets

整体关系可概括为：

```text
npm package
├── commands/              源 skills 真相源
├── schemas/               JSON Schema 资产
├── workflow.json          工作流定义
├── dist/nopilot-cli.js    框架入口
└── dist/lash/cli.js       构建运行时入口

nopilot init
├── ~/.claude/skills/      Claude Code 全局 skills
├── ~/.agents/skills/      Codex / OpenCode 共享 skills
└── <project>/specs/       项目运行时制品目录

project runtime
├── specs/                 discover / spec / tests / build 制品
├── .lash/                 Lash 运行期工作目录
└── .nopilot/profile/      本地 sidecar 项目画像
```

## 2. 分层模型

从资产归属角度，仓库采用三层分布模型。

### 2.1 包内资产层

由 npm 包发布并随版本分发：

- `commands/`：源 skills
- `schemas/`：工作流和 profile 相关 Schema
- `workflow.json`：阶段状态机、护栏、制品结构定义
- `dist/**`：编译后的 `nopilot` 与 `lash` CLI
- `CLAUDE.dev.md`：项目级指令模板来源

这一层是“仓库真相源”。技能、Schema 和工作流定义不复制到项目目录。

### 2.2 全局安装层

由 `nopilot init` 渲染安装到用户主目录：

- `~/.claude/skills/`：Claude Code 使用
- `~/.agents/skills/`：Codex 与 OpenCode 共享

这里存放的是“平台适配后的已安装 skills”，不是仓库中的源文件副本。

### 2.3 项目运行时层

位于具体项目目录：

- `specs/`：正式工作流制品
- `.lash/`：Lash 任务包、worktree 等运行时中间产物
- `.nopilot/profile/`：本地项目画像 sidecar
- 已存在的 `CLAUDE.md` / `AGENTS.md` / `opencode.md`：由 `nopilot init` 追加 Lash 指令块

这一层承载具体项目的状态，不属于 npm 包静态资产。

## 3. 核心子系统

### 3.1 Universal Skill Engine

职责：把仓库中的统一源 skills 渲染并安装到不同平台的全局技能目录。

对应目录：

- `src/skill-engine/`
- `commands/`

核心概念：

- `PlatformAdapter`：平台适配配置，包括 `skillsDir`、`legacyDir`、`placeholderMap`
- `SourceSkill`：源技能，分为目录技能和单文件技能
- `InstallResult`：每个平台一次安装的结果

当前平台策略：

- `claude`：active，安装到 `~/.claude/skills/`
- `codex`：active，安装到 `~/.agents/skills/`
- `opencode`：active，安装到 `~/.agents/skills/`
- `gemini`：experimental，已建模但默认不参与安装

关键实现特征：

1. `commands/` 是源技能真相源
2. 安装过程是“扫描 -> 模板渲染 -> 残留占位符校验 -> 写入 skillsDir”
3. Codex 与 OpenCode 共享 `~/.agents/skills/`，安装器按 `skillsDir` 去重
4. legacy 迁移是显式流程，不会静默删除旧目录

源技能组织方式：

- 目录技能：`commands/<skill>/SKILL.md` + 同目录其他 `.md`
- 单文件技能：`commands/*.md`，安装时包装为 `<skillsDir>/<skill>/SKILL.md`

当前目录技能示例：

- `discover/`
- `spec/`
- `build/`
- `visualize/`
- `supervisor/`
- `critic/`
- `lash-tracer/`
- `lash-verify/`

当前单文件入口示例：

- `lash-build.md`
- `lash-batch.md`
- `lash-orchestrator.md`
- `lash-conflict-resolver.md`
- `lash-worker-instructions.md`

### 3.2 nopilot CLI

职责：框架级入口，不承担多代理运行时逻辑。

对应文件：

- `src/nopilot-cli.ts`

当前命令边界：

- `nopilot init [dir]`
- `nopilot paths`
- `nopilot version`
- `nopilot validate`（占位）
- `nopilot preview`（占位）

`init` 的稳定边界：

1. 从包内 `commands/` 安装全局 skills
2. 创建 `<project>/specs/.gitkeep`
3. 向已有的 `CLAUDE.md`、`AGENTS.md`、`opencode.md` 追加 Lash 指令块
4. 不复制 `schemas/` 和 `workflow.json` 到项目目录

因此，`nopilot` 是“初始化器 + 资产定位器”，不是实际执行 `/build` 的运行时。

### 3.3 Lash Build Runtime

职责：提供多 Agent 并行构建运行时，把 spec / discover 制品转成可执行的 Worker 任务，并在仓库外部完成验证与恢复。

对应目录：

- `src/lash/`
- `docs/lash-design-decisions.md`

Lash 在整体仓库中的角色：

- 它是 `lash` CLI 的实现
- 它与 NoPilot 的 build 流程集成，但不等于整个框架
- `/build` 是通用构建阶段入口，`/lash-build` 是采用 Lash 的多代理并行路径

主要模块：

1. `plan-generator.ts`：把 spec 依赖图转成批次计划
2. `platform-launcher.ts`：封装 Claude / Codex / OpenCode Worker 生命周期
3. `worktree-manager.ts`：管理 `.lash/worktrees/` 与分支合并
4. `task-packager.ts`：生成 `.lash/` 任务包
5. `test-runner.ts`：检测测试运行器并外部执行测试
6. `failure-classifier.ts`：把失败归类到 L0-L3
7. `build-state.ts`：持久化 `specs/build-state.json`
8. `config.ts`：读取 `lash.config.json`
9. `spec-resolver.ts`：统一解析单文件 / 目录拆分制品
10. `artifact-cleaner.ts`：清理 spec 产物

关键运行时边界：

1. 输入来自 `specs/discover.json | specs/discover/index.json` 与 `specs/spec.json | specs/spec/index.json`
2. 中间产物位于 `.lash/`
3. 状态持久化位于 `specs/build-state.json`
4. 测试结果以外部执行为准，不接受 Worker 自报通过
5. 失败按 L0-L3 分类并路由到不同恢复路径

主要运行期制品：

- `specs/tests.json` 或 `specs/tests/index.json`
- `specs/build_report.json` 或 `specs/build/index.json`
- `specs/build_review.json`
- `specs/build-state.json`
- `.lash/worktrees/<module_id>/`
- `.lash/*.md`、`owned_files.txt`、`read_only_files.txt`

### 3.4 Workflow / Schema Assets

职责：为整个框架提供机器可执行的约束定义。

对应资产：

- `workflow.json`
- `schemas/*.json`

`workflow.json` 当前承载：

1. 三阶段状态机与事件转换
2. 核心原则，如 generation-review separation
3. Supervisor / Critic 护栏定义
4. `discover/spec/tests/build` 的单文件与目录拆分结构
5. 回溯次数上限与循环检测策略

Schema 资产分为两类：

1. 主工作流制品 Schema
2. `profile-*` sidecar Schema

这些资产都留在包内，并通过 `nopilot paths` 暴露位置。

### 3.5 Profile Sidecar

职责：把项目当前的技术、架构、决策和状态沉淀为本地可复用画像，用于 feature mode、模式识别、冲突检测和回访场景。

对应目录：

- `src/profile/`

固定位置：

- `.nopilot/config.json`
- `.nopilot/profile/l0-infra.json`
- `.nopilot/profile/l1-arch.json`
- `.nopilot/profile/l2-decisions.json`
- `.nopilot/profile/l3-status.json`

这是 sidecar 记忆层，不属于 `specs/` 正式合同的一部分。

四层职责：

1. L0：语言、框架、包管理器、运行时、测试框架等基础设施
2. L1：模块、依赖方向、通信模式、设计模式
3. L2：设计哲学、架构决策、硬约束
4. L3：领域模型、测试覆盖、近期特性、`ui_taste`

数据来源：

1. 阶段制品：`discover.json`、`spec.json`、`build_report.json`、`decisions.json`
2. 仓库扫描：目录结构、配置文件、git 提交时间

关键特征：

1. 写入前做 Schema 校验
2. 可以检测 stale profile
3. 对 feature mode 提供模式判断和冲突检测
4. `.nopilot/` 设计为本地 sidecar，默认应加入 `.gitignore`

### 3.6 UI Taste

职责：在 Discover 阶段条件触发的 UI 探索子系统，用于把视觉方向沉淀为可机读约束，而不是直接产出最终前端实现。

对应目录：

- `src/ui-taste/`

在总体流程中的位置：

- 它属于 Discover 内部子流程
- 发生在 Design Philosophy 确认之后、Requirement Lock 之前
- 最终把结果写入 Discover 产物的 `ui_taste` 字段

核心组件：

1. `TasteOrchestrator`：总编排入口
2. `StyleDetector`：检测已有设计风格
3. `ProviderRegistry` / `DesignProvider`：provider 抽象与选择
4. `StitchProvider`：高保真 provider
5. `AgentHTMLProvider`：HTML fallback provider
6. `PreviewEngine`：本地预览与交互
7. `IterationEngine`：反馈、迭代、回滚
8. `PostProcessor`：字体、资源、响应式后处理
9. `TokenExporter`：导出 DTCG JSON 或 CSS tokens

稳定产物：

- `specs/mockups/*.html`
- `specs/mockups/index.html`
- `specs/mockups/tokens.json` 或 `specs/mockups/tokens.css`
- Discover 产物中的 `ui_taste`
- Profile L3 中镜像后的 `ui_taste`

## 4. 关键数据流

### 4.1 框架初始化流

```text
commands/ + platform registry
        ↓
nopilot init
        ↓
~/.claude/skills/ + ~/.agents/skills/
        ↓
project specs/ + injected agent context
```

### 4.2 主工作流制品流

```text
/discover
  ↓
specs/discover.json | specs/discover/index.json
  ↓
/spec
  ↓
specs/spec.json | specs/spec/index.json
  ↓
/build 或 /lash-build
  ↓
specs/tests.* + specs/build.* + specs/build_review.json
```

### 4.3 Lash 运行时流

```text
discover/spec artifacts
        ↓
plan-generator
        ↓
.lash/ task packages + worktrees
        ↓
platform-launcher spawns workers
        ↓
external test-runner + failure-classifier
        ↓
module critic / build critic / supervisor
        ↓
build-state + build_report + merge
```

### 4.4 Profile 回写流

```text
discover/spec/build_report/decisions
        ↓
profile extractors
        ↓
.nopilot/profile/l0-l3
        ↓
mode detection / staleness / conflict detection
```

### 4.5 UI Taste 约束流

```text
project style + provider output + user feedback
        ↓
specs/mockups/ + tokens
        ↓
discover artifact ui_taste
        ↓
profile l3 ui_taste
        ↓
feature mode / downstream design context reuse
```

## 5. 目录职责速览

### 根目录

- `package.json`：发布入口、scripts、依赖边界
- `workflow.json`：工作流机器定义
- `README.md`：对外概览
- `README_AGENT.md`：面向 Agent 的参考说明
- `CLAUDE.dev.md`：项目注入模板来源

### `commands/`

统一源 skills 仓库。

### `src/`

实现代码，按子系统拆分：

- `skill-engine/`
- `lash/`
- `profile/`
- `ui-taste/`
- `nopilot-cli.ts`

### `schemas/`

工作流和 profile 的 JSON Schema 资产。

### `docs/`

仓库文档中心：

- `docs/zh-CN/`：中文主文档
- `docs/lash-design-decisions.md`：Lash 专项架构
- `docs/design/`、`docs/plans/`：设计与计划记录
- `docs/tracking/`：进度与开放问题

### `tests/` 与 `src/**/__tests__/`

验证 CLI、运行时模块与子系统边界。

## 6. 当前架构约束

当前正式实现有几个稳定约束：

1. `nopilot` 与 `lash` 职责分离，不能混写成单一运行时
2. `commands/` 是源 skills 真相源，项目目录不保存其副本
3. Codex 与 OpenCode 共享 `~/.agents/skills/` 是正式架构决策
4. `workflow.json` 与 `schemas/` 保留在包内，不下沉到项目目录
5. `profile` 是 sidecar 层，不等同于主工作流制品
6. `ui-taste` 是 Discover 子系统，不是第四个主阶段
7. Lash 运行时必须支持单文件制品与目录拆分制品两种输入格式

## 7. 阅读路径建议

如果是第一次阅读这个仓库，建议顺序如下：

1. `README.md` 或 `docs/zh-CN/README.md`
2. 本文档 `docs/zh-CN/ARCHITECTURE.md`
3. `README_AGENT.md`
4. `docs/lash-design-decisions.md`
5. `workflow.json`
6. `src/nopilot-cli.ts`
7. `src/skill-engine/` → `src/lash/` → `src/profile/` → `src/ui-taste/`

## 8. 相关文档

- [README](../../README.md)
- [中文 README](./README.md)
- [Lash Design Decisions](../lash-design-decisions.md)
- [中文用户指南](./USER_GUIDE.md)
