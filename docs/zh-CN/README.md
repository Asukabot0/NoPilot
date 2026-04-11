# NoPilot

[English](../../README.md)

面向 Greenfield 项目的 AI Native 个人开发工作流框架。

## 这是什么

NoPilot 是一个三阶段工作流，从需求探索到代码交付，下游人类参与度递减。AI 负责生成可能性和执行，人类负责做决策。

**三个阶段：**
- `/discover` — 需求空间探索：方向选择 → MVP 定义 → 需求锁定
- `/spec` — 受约束的设计展开：将锁定的需求展开为模块级技术规格
- `/build` — 自主 TDD 实现：tracer bullet 验证 + 逐模块 TDD + 自动验收

**产出：** 每个阶段输出结构化 JSON 制品，作为机器可读的契约，确保从需求到代码的完整追溯链。

## 安装

### 前置条件

- 已安装并配置 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- 如需共享 skills 安装或使用 Lash 多平台 Worker，可额外配置 Codex CLI 与 OpenCode CLI
- Node.js >= 20.0.0

### 安装

```bash
npm install -g nopilot
```

安装后系统中会有两个 CLI：
- `nopilot` — 框架工具（项目初始化、资产路径查看）
- `lash` — 构建运行时（多 Agent 编排、Worker 管理、测试验证）

### 初始化项目

```bash
cd your-project
nopilot init
```

自动完成：将包内 `commands/` 渲染安装到 Claude Code 的 `~/.claude/skills/`，并将同一套 skills 安装到 Codex / OpenCode 共享的 `~/.agents/skills/`，创建 `specs/` 目录，并将 Lash 自动触发指令追加到已有的 `CLAUDE.md`、`AGENTS.md`、`opencode.md`。

Schema 和 workflow.json 保留在 npm 包内，通过 `nopilot paths` 查看位置。

### 开始使用

先在你的 AI 编码工具中载入已安装的 `discover` skill。

```bash
cd your-project
claude   # Claude Code 中运行 /discover
```

Codex 与 OpenCode 共用 `~/.agents/skills/` 中安装的同一套 skills。

## 为什么这样设计

1. **人类是决策者，不是执行者。** 你定义意图、做选择。AI 生成选项并执行。你只需要说"选这个"，不需要说"怎么做"。

2. **越下游人越少。** 在 `/discover`（方向不确定）深度参与，意味着在 `/build`（方向已锁定）可以 AFK。

3. **多维度同时涌现。** 需求、技术可行性、竞品风险、工作量同时出现，让你在完整上下文中做决策。

4. **Spec 是契约，不是文档。** 每个产出是结构化 JSON，由下游阶段程序化消费。

5. **AI 自主决策但留痕。** 低风险技术细节由 AI 决定，不打断流程。每个决策都被记录。

6. **失败回到决策层，不在执行层兜底。** 出了问题意味着上游决策需要修正，而非代码需要调试。

## 工作流

```
/discover    # 锁定需求
→ /spec      # 设计到模块级
→ /build     # TDD 实现
```

每个命令从 `specs/` 读取上游制品并写入自己的产出。所有制品都是 JSON 契约。

## 架构

仓库级正式架构总览见：[`ARCHITECTURE.md`](./ARCHITECTURE.md)

### Supervisor + Critic 双 Agent

两个独立 Agent 提供跨阶段质量保障，都是**核心护栏**（不可关闭）：

**Supervisor — 意图守护者（望远镜）**
- 监控整体产出是否仍然符合用户最初的意图和约束
- 在阶段完成时激活：/discover、/spec、/build 完成后各跑一次
- 检测累积漂移（每个决策单独看合理，但累积起来偏离了意图）

**Critic — 独立质疑者（放大镜）**
- 在隔离会话中做对抗性质量审查（不共享生成上下文）
- 防止"同一个 AI 自己出题自己改卷"
- 在检查点激活：需求锁定、spec 反向验证、build 测试审查、build 验收审查

### 核心概念

**制品（运行时在 `specs/` 中生成）：**
- `discover.json` 或 `discover/index.json` — 锁定的需求、验收标准、不变量
- `discover_history.json` 或 `discover/history.json` — 探索日志：考虑过的方向、决策记录
- `spec.json` 或 `spec/index.json` — 模块拆分、接口定义、数据模型、依赖图
- `spec_review.json` — 反向验证和全局一致性检查结果
- `tests.json` 或 `tests/index.json` — 从需求和不变量推导的测试用例
- `tests_review.json` — 实现前对生成测试的独立审查
- `build_report.json` 或 `build/index.json` — 执行计划、TDD 结果、自动验收
- `build_review.json` — 对最终实现的独立验收审查

对于大型项目，NoPilot 可以把制品拆成 `index.json` + 子文件，避免下游 agent 每次都加载整个大 JSON。

**分级异常处理：**
- L0/L1：环境问题或低影响问题 → AI 自行解决
- L2：影响 spec 契约 → 暂停等待产品决策（接受降级、砍功能、改 spec、换方式重试、回溯）
- L3：根本性问题 → 诊断报告 + 选择回溯到 spec 或 discover

**回溯安全：**
- 总回溯上限 3 次
- 循环检测：A→B→A→B 时终止并报告
- 成本提醒：回溯前告知预估重跑时间

## 文件结构

```
your-project/
├── specs/               # 运行时制品（由命令生成）
│   ├── discover.json     # 或 discover/index.json + 子文件
│   ├── spec.json         # 或 spec/index.json + 子文件
│   ├── tests.json        # 或 tests/index.json + 子文件
│   ├── build_report.json # 或 build/index.json + 子文件
│   └── ...
├── CLAUDE.md            # 项目上下文（含 Lash 触发指令）
└── ...

~/.claude/skills/        # Claude Code 全局 skills（由 nopilot init 安装）
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

~/.agents/skills/        # Codex 与 OpenCode 共享 skills
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

包内源 skills 位于 `commands/`，由 `nopilot init` 渲染到各平台的 skills 目录。

## 当前范围 (V1.2, Schema 4.0)

**包含：** 面向 Claude Code、Codex、OpenCode 的统一 skills 分发，仅 Greenfield 项目，纯 prompt engineering，完整核心护栏（Supervisor 漂移检测、Critic AI 偏差目录），生成-审查分离，渐进式想法收集，设计哲学提取，完整性追踪，领域模型和 NFR 输出，制品可视化，大项目目录拆分，集成 Lash 多 Agent 构建引擎（TypeScript），双 CLI（`nopilot` + `lash`），npm 分发。

**不包含：** Brownfield/增量迭代、Agent 共识机制（已声明未接线）、iOS 远程 Agent、多模型路由。

## License

MIT
