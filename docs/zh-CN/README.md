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

## 为什么这样设计

传统开发流程按维度分阶段（需求 → 设计 → 开发），每个边界都需要大量人工协调。NoPilot 反转了这个模型：

1. **人类是决策者，不是执行者。** 你定义意图、做选择。AI 生成选项并执行。你只需要说"选这个"，不需要说"怎么做"。

2. **越下游人越少。** 在 `/discover`（方向不确定）深度参与，意味着在 `/build`（方向已锁定）可以 AFK。上游决策越好，下游越不需要人兜底。

3. **多维度同时涌现。** 需求、技术可行性、竞品风险、工作量不是分阶段串行产出——它们同时出现，让你在完整上下文中做决策。

4. **Spec 是契约，不是文档。** 每个产出是结构化 JSON，由下游阶段程序化消费。需要人审查时，适配器提供人类友好的摘要视图，而非原始 JSON。

5. **AI 自主决策但留痕。** 低风险技术细节由 AI 决定，不打断流程。每个决策都被记录，随时可追溯。

6. **上游用第一性原则，下游用最佳实践。** 方向性问题从根本出发思考，执行层用成熟方案。该快的地方不慢，该慎重的地方不草率。

7. **失败回到决策层，不在执行层兜底。** 出了问题意味着上游决策需要修正，不是代码需要调试。用户请求"换个方式试"（决策），而非"修这个 bug"（代码）。

8. **约束服务于当前能力，不锁定未来可能。** 核心护栏（反向验证、自动验收）定义正确性，不可关闭。增强护栏（tracer bullet、变异测试）是辅助轮，随 AI 能力提升可逐步关闭。

## 工作流

按顺序执行：

```bash
/discover    # 锁定需求
→ /spec      # 设计到模块级
→ /build     # TDD 实现
```

每个命令从 `specs/` 读取上游制品并写入自己的产出。所有制品都是 JSON 契约。

## 架构

### Supervisor + Critic 双 Agent

两个独立 Agent 提供跨阶段质量保障，都是**核心护栏**（不可关闭）：

**Supervisor — 意图守护者（望远镜）**
- 监控整体产出是否仍然符合用户最初的意图和约束
- 在阶段完成时激活：/discover、/spec、/build 完成后各跑一次
- 检测累积漂移（每个决策单独看合理，但累积起来偏离了意图）
- 发现漂移时：暂停并呈现诊断。你来决定：接受复杂度 / 裁剪范围 / 回溯

**Critic — 独立质疑者（放大镜）**
- 在隔离会话中做对抗性质量审查（不共享生成上下文）
- 防止"同一个 AI 自己出题自己改卷"
- 只读最终制品，不读生成历史
- 在检查点激活：需求锁定、spec 反向验证、build 场景验证
- 发现问题时：先尝试自修（只改当前制品，不改上游）。自修成功则继续，失败则暂停交给你

**关系：** Supervisor 看方向（森林），Critic 看质量（树木）。互相独立，可并行运行。

## V1 范围

**包含：**
- 三阶段工作流，跑在 Claude Code 上作为 slash commands
- 仅支持 Greenfield 项目（从零开始的新项目）
- 纯 prompt engineering（无需外部服务）
- 完整核心护栏（Supervisor、Critic、反向验证、自动验收）
- 增强护栏：tracer bullet 开启，变异测试关闭

**不包含：**
- Brownfield/增量迭代（V2）
- iOS 远程 Agent 工具（V4）
- 多模型路由（V3+）
- 自定义记忆/上下文管理（V2+）

## 快速开始

1. **阅读设计 spec：** `docs/superpowers/specs/2026-04-02-nopilot-workflow-design.md`
2. **查看实施计划：** `docs/superpowers/plans/2026-04-02-nopilot-v1.md`
3. **了解工作流定义：** `workflow.json` 包含所有状态机、护栏和检查点逻辑
4. **在 Claude Code 中运行：** 从 `/discover` 开始探索你的项目空间

## 核心概念

**制品：**
- `specs/discover.json` — 锁定的需求、验收标准、不变量
- `specs/discover_history.json` — 探索日志：考虑过的方向、裁剪的功能、决策记录
- `specs/spec.json` — 模块拆分、接口定义、数据模型、依赖图
- `specs/spec_review.json` — 反向验证和全局一致性检查结果
- `specs/tests.json` — 从需求和不变量推导的测试用例
- `specs/build_report.json` — 执行计划、TDD 结果、自动验收、契约修订

**关键决策点：**
- `/discover` Layer 1：选择产品方向
- `/discover` Layer 2：定义 MVP 功能和技术路径
- `/discover` Layer 3：锁定需求（6Cs 质量门控）
- `/spec` 检查点：审查设计后再进入 build（无问题时自动跳过）
- `/build` 检查点：审查测试后再开始实现（默认可选）

**分级异常处理：**
- L0/L1：环境问题或低影响问题 → AI 自行解决
- L2：影响 spec 契约 → 暂停等待产品决策（接受降级、砍功能、改 spec、换方式重试、回溯）
- L3：根本性问题 → 诊断报告 + 选择回溯到 spec 或 discover

**回溯安全：**
- 总回溯上限 3 次
- 循环检测：A→B→A→B 时终止并报告
- 成本提醒：回溯前告知预估重跑时间

## 演进路线

**V1：** Claude Code slash commands，仅 Greenfield，完整增强护栏
**V1.5：** 真正轻量的 lite 模式，Brownfield 支持
**V2：** 增量迭代、记忆系统、上下文管理优化
**V3：** 跨项目经验积累、spec 漂移检测
**V4：** iOS 远程 Agent 异步编排

---

实现细节、Agent 提示词和状态机定义参见：
- `/discover` 命令：`.claude/commands/discover.md`
- `/spec` 命令：`.claude/commands/spec.md`
- `/build` 命令：`.claude/commands/build.md`
- Supervisor Agent：`.claude/commands/supervisor.md`
- Critic Agent：`.claude/commands/critic.md`
- 工作流定义：`workflow.json`
