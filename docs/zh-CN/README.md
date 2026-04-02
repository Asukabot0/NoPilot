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

### 方式 A：项目安装（推荐）

将 NoPilot 安装到单个项目中。命令、工作流定义、CLAUDE.md 上下文，全部自包含。

```bash
git clone https://github.com/Asukabot0/NoPilot.git
cd NoPilot
./install.sh --project /path/to/your/project
```

自动完成：复制命令、`workflow.json`、`README_AGENT.md`，创建 `specs/`，并将 NoPilot 上下文追加到 `CLAUDE.md`。

### 方式 B：全局安装

让 `/discover`、`/spec`、`/build` 在所有 Claude Code 会话中可用。每个项目仍需 `--project` 来设置项目级文件。

```bash
git clone https://github.com/Asukabot0/NoPilot.git
cd NoPilot
./install.sh --global              # 命令 → ~/.claude/commands/
./install.sh --project /path/to/your/project  # 项目文件 + CLAUDE.md
```

### 开始使用

```bash
cd your-project
claude   # 打开 Claude Code
```

输入 `/discover` 开始探索你的项目空间。

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

### Supervisor + Critic 双 Agent

两个独立 Agent 提供跨阶段质量保障，都是**核心护栏**（不可关闭）：

**Supervisor — 意图守护者（望远镜）**
- 监控整体产出是否仍然符合用户最初的意图和约束
- 在阶段完成时激活：/discover、/spec、/build 完成后各跑一次
- 检测累积漂移（每个决策单独看合理，但累积起来偏离了意图）

**Critic — 独立质疑者（放大镜）**
- 在隔离会话中做对抗性质量审查（不共享生成上下文）
- 防止"同一个 AI 自己出题自己改卷"
- 在检查点激活：需求锁定、spec 反向验证、build 场景验证

### 核心概念

**制品（运行时在 `specs/` 中生成）：**
- `discover.json` — 锁定的需求、验收标准、不变量
- `discover_history.json` — 探索日志：考虑过的方向、决策记录
- `spec.json` — 模块拆分、接口定义、数据模型、依赖图
- `spec_review.json` — 反向验证和全局一致性检查结果
- `tests.json` — 从需求和不变量推导的测试用例
- `build_report.json` — 执行计划、TDD 结果、自动验收

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
├── .claude/commands/
│   ├── discover.md      # /discover slash command
│   ├── spec.md          # /spec slash command
│   ├── build.md         # /build slash command
│   ├── supervisor.md    # Supervisor agent（被命令调用）
│   └── critic.md        # Critic agent（被命令调用）
├── specs/               # 运行时制品（由命令生成）
│   ├── discover.json
│   ├── discover_history.json
│   ├── spec.json
│   ├── spec_review.json
│   ├── tests.json
│   └── build_report.json
├── workflow.json         # 主工作流定义
└── CLAUDE.md            # 你的项目上下文（添加 NoPilot 部分）
```

## V1 范围

**包含：** 三阶段工作流跑在 Claude Code 上，仅 Greenfield 项目，纯 prompt engineering，完整核心护栏（Supervisor、Critic、反向验证、自动验收）。

**不包含：** Brownfield/增量迭代（V2）、iOS 远程 Agent 工具（V4）、多模型路由（V3+）。

## License

MIT
