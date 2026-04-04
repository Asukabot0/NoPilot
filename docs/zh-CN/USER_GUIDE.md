# NoPilot 使用者参考文档

> 版本: V1.2 (Schema 4.0) | 最后更新: 2026-04-04

---

## 目录

- [1. 项目概览](#1-项目概览)
  - [1.1 NoPilot 是什么](#11-nopilot-是什么)
  - [1.2 设计理念](#12-设计理念)
  - [1.3 技术栈](#13-技术栈)
  - [1.4 当前状态](#14-当前状态)
- [2. 快速开始](#2-快速开始)
  - [2.1 前置条件](#21-前置条件)
  - [2.2 安装](#22-安装)
  - [2.3 初始化项目](#23-初始化项目)
  - [2.4 运行第一个工作流](#24-运行第一个工作流)
- [3. 核心概念](#3-核心概念)
  - [3.1 三阶段流水线](#31-三阶段流水线)
  - [3.2 制品体系](#32-制品体系)
  - [3.3 Supervisor -- 意图守护者](#33-supervisor----意图守护者)
  - [3.4 Critic -- 独立挑战者](#34-critic----独立挑战者)
  - [3.5 生成与审查分离](#35-生成与审查分离)
  - [3.6 可追溯性 ID](#36-可追溯性-id)
  - [3.7 回溯安全机制](#37-回溯安全机制)
  - [3.8 分级异常处理](#38-分级异常处理)
- [4. 三阶段工作流详解](#4-三阶段工作流详解)
  - [4.1 Discover 阶段](#41-discover-阶段)
  - [4.2 Spec 阶段](#42-spec-阶段)
  - [4.3 Build 阶段](#43-build-阶段)
  - [4.4 Visualize 命令](#44-visualize-命令)
- [5. Lash 构建编排器](#5-lash-构建编排器)
  - [5.1 Lash 是什么](#51-lash-是什么)
  - [5.2 架构概览](#52-架构概览)
  - [5.3 自动触发条件](#53-自动触发条件)
  - [5.4 配置](#54-配置)
  - [5.5 执行计划生成](#55-执行计划生成)
  - [5.6 Worker 生命周期](#56-worker-生命周期)
  - [5.7 任务打包](#57-任务打包)
  - [5.8 Git Worktree 隔离](#58-git-worktree-隔离)
  - [5.9 测试运行器](#59-测试运行器)
  - [5.10 失败分类器](#510-失败分类器)
  - [5.11 构建状态管理](#511-构建状态管理)
- [6. UI Taste 系统](#6-ui-taste-系统)
  - [6.1 系统定位](#61-系统定位)
  - [6.2 架构概览](#62-架构概览)
  - [6.3 Provider 层](#63-provider-层)
  - [6.4 引擎层](#64-引擎层)
  - [6.5 工具层](#65-工具层)
  - [6.6 编排流程](#66-编排流程)
- [7. CLI 参考](#7-cli-参考)
  - [7.1 nopilot CLI](#71-nopilot-cli)
  - [7.2 lash CLI](#72-lash-cli)
- [8. Schema 参考](#8-schema-参考)
  - [8.1 Schema 体系总览](#81-schema-体系总览)
  - [8.2 Discover Schema](#82-discover-schema)
  - [8.3 Spec Schema](#83-spec-schema)
  - [8.4 Build Schema](#84-build-schema)
  - [8.5 Tests Schema](#85-tests-schema)
  - [8.6 辅助 Schema](#86-辅助-schema)
- [9. 架构决策](#9-架构决策)
  - [9.1 为什么是三阶段流水线](#91-为什么是三阶段流水线)
  - [9.2 为什么生成与审查分离](#92-为什么生成与审查分离)
  - [9.3 为什么用 JSON 作为制品格式](#93-为什么用-json-作为制品格式)
  - [9.4 为什么 Lash 从 Python 迁移到 TypeScript](#94-为什么-lash-从-python-迁移到-typescript)
  - [9.5 为什么用 Git Worktree 隔离 Worker](#95-为什么用-git-worktree-隔离-worker)
  - [9.6 为什么外部测试验证](#96-为什么外部测试验证)
- [10. 工作流状态机](#10-工作流状态机)
  - [10.1 workflow.json 结构](#101-workflowjson-结构)
  - [10.2 Discover 状态机](#102-discover-状态机)
  - [10.3 Spec 状态机](#103-spec-状态机)
  - [10.4 Build 状态机](#104-build-状态机)
  - [10.5 回溯触发器](#105-回溯触发器)
- [11. 项目文件结构](#11-项目文件结构)
- [12. 常见问题](#12-常见问题)
- [13. 路线图](#13-路线图)

---

## 1. 项目概览

### 1.1 NoPilot 是什么

NoPilot 是面向 Greenfield 项目的 AI Native 个人开发工作流框架。它将一个项目从零到交付的过程拆分为三个递进阶段：需求探索、设计展开、自主实现。

核心定位：**人类做决策，AI 生成和执行。** 你只需要说"选哪个"，不需要说"怎么做"。

```
人类的角色     AI 的角色
─────────     ────────
定义意图       生成可能性
做选择         执行选择
审批关键节点   自主处理低风险决策
```

NoPilot 的下游参与度递减模型：

- `/discover`（方向不确定）-- 深度参与，每个关键决策都需要你确认
- `/spec`（方向已锁定）-- 中度参与，只在发现矛盾或高影响决策时暂停
- `/build`（设计已完成）-- 低度参与，可以 AFK，AI 自主 TDD 实现

### 1.2 设计理念

1. **人类是决策者，不是执行者。** 你定义意图、做选择。AI 生成选项并执行。
2. **越下游人越少。** 在 Discover 阶段深度参与，意味着在 Build 阶段可以放手。
3. **多维度同时涌现。** 需求、技术可行性、竞品风险、工作量同时出现，让你在完整上下文中做决策。
4. **Spec 是契约，不是文档。** 每个产出是结构化 JSON，由下游阶段程序化消费。
5. **AI 自主决策但留痕。** 低风险技术细节由 AI 决定，不打断流程。每个决策都被记录到 `decisions.json`。
6. **失败回到决策层，不在执行层兜底。** 出了问题意味着上游决策需要修正，而非代码需要调试。

### 1.3 技术栈

| 组件 | 技术 |
|------|------|
| 语言 | TypeScript (ES2022, strict mode) |
| 运行时 | Node.js >= 18.19.0 |
| CLI 框架 | Commander.js |
| 测试 | Vitest 3.0 |
| 包管理 | pnpm |
| TypeScript 版本 | 5.7+ |

### 1.4 当前状态

- **版本**: V1.2 Delivered (Schema 4.0)
- **代码规模**: 13 个 TypeScript 源文件，3835 行代码
- **测试**: 202 个测试用例
- **分发**: `npm install -g nopilot`，提供双 CLI (`nopilot` + `lash`)
- **Open Issues**: #17 (Lite 模式), #21 (Preview 命令)

---

## 2. 快速开始

### 2.1 前置条件

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 已安装并配置
- Node.js >= 18.19.0

### 2.2 安装

```bash
npm install -g nopilot
```

安装完成后，系统中会有两个 CLI 可用：

| CLI | 用途 |
|-----|------|
| `nopilot` | 框架工具：项目初始化、版本查看 |
| `lash` | 构建运行时：多 Agent 编排、Worker 管理、测试验证 |

验证安装：

```bash
nopilot version
```

### 2.3 初始化项目

```bash
mkdir my-project && cd my-project
git init
nopilot init
```

`nopilot init` 会完成以下操作：

1. 复制 `commands/*.md` 到 `.claude/commands/`（13 个 slash command 文件）
2. 复制 `schemas/*.json` 到 `schemas/`（14 个 JSON Schema 文件）
3. 复制 `workflow.json` 到项目根目录
4. 向已有的 `CLAUDE.md`、`AGENTS.md`、`opencode.md` 追加 Lash 自动触发指令

如果需要覆盖已有文件：

```bash
nopilot init --force
```

初始化后的项目结构：

```
my-project/
├── .claude/commands/        # Slash commands
│   ├── discover.md          # /discover 命令
│   ├── spec.md              # /spec 命令
│   ├── build.md             # /build 命令
│   ├── visualize.md         # /visualize 命令
│   ├── supervisor.md        # Supervisor agent
│   ├── critic.md            # Critic agent
│   ├── lash-build.md        # Lash 编排主流程
│   ├── lash-tracer.md       # Lash tracer bullet
│   ├── lash-batch.md        # Lash 批次执行
│   ├── lash-verify.md       # Lash 最终验证
│   ├── lash-conflict-resolver.md
│   ├── lash-orchestrator.md
│   └── lash-worker-instructions.md
├── schemas/                 # 14 个 JSON Schema (v4.0)
├── specs/                   # 运行时制品（由命令生成）
├── workflow.json            # 工作流状态机定义
└── CLAUDE.md                # 项目上下文（含 Lash 触发指令）
```

### 2.4 运行第一个工作流

```bash
cd my-project
claude                       # 打开 Claude Code
```

在 Claude Code 中依次执行：

```
/discover                    # 第一步：探索需求空间，锁定需求
/spec                        # 第二步：将需求展开为模块级设计
/build                       # 第三步：自主 TDD 实现
```

每个阶段从 `specs/` 读取上游制品，写入自己的产出。所有制品都是 JSON 格式的机器可读契约。

典型的端到端流程耗时：

| 阶段 | 人类参与度 | 典型耗时 |
|------|-----------|---------|
| `/discover` | 高 -- 每个决策点需确认 | 30-60 分钟 |
| `/spec` | 中 -- 仅在矛盾/高影响决策时暂停 | 10-30 分钟 |
| `/build` | 低 -- 可 AFK，仅 L2 异常需介入 | 取决于项目规模 |

---

## 3. 核心概念

### 3.1 三阶段流水线

NoPilot 的核心是一条三阶段流水线，每个阶段产出结构化 JSON 制品供下游消费：

```
                 制品流
                 ─────
/discover ──→ discover.json ──→ /spec ──→ spec.json ──→ /build ──→ build_report.json
   │                              │                        │
   │ 需求锁定                     │ 设计展开                │ TDD 实现
   │ 方向选择                     │ 模块拆分                │ 自动验收
   │ 设计哲学                     │ 接口定义                │ 独立审查
   └──────────────────────────────┴────────────────────────┘
                        回溯通道（最多 3 次）
```

**关键属性：**

- 每个阶段有独立的状态机（定义在 `workflow.json`）
- 阶段间通过 JSON 制品传递信息，不共享运行时状态
- 回溯触发时执行完整重跑（不做增量更新）
- Supervisor 和 Critic 作为核心护栏在阶段边界激活

### 3.2 制品体系

所有制品生成在 `specs/` 目录下。小型项目使用单文件，大型项目可拆分为目录结构：

| 制品 | 单文件模式 | 目录模式 |
|------|-----------|---------|
| Discover 产出 | `specs/discover.json` | `specs/discover/index.json` + 子文件 |
| Discover 历史 | `specs/discover_history.json` | `specs/discover/history.json` |
| Discover 审查 | `specs/discover_review.json` | - |
| Spec 产出 | `specs/spec.json` | `specs/spec/index.json` + `mod-{id}-{name}.json` |
| Spec 审查 | `specs/spec_review.json` | - |
| Tests 产出 | `specs/tests.json` | `specs/tests/index.json` + `mod-{id}-{name}.json` |
| Tests 审查 | `specs/tests_review.json` | - |
| Build 报告 | `specs/build_report.json` | `specs/build/index.json` + `mod-{id}-{name}.json` |
| Build 审查 | `specs/build_review.json` | - |
| 决策账本 | `specs/decisions.json` | - |

目录拆分的触发条件：当制品超过合理的单文件大小或包含多个模块时。拆分后下游 Agent 只需加载所需的子文件，减少上下文窗口压力。

### 3.3 Supervisor -- 意图守护者

Supervisor 是 NoPilot 的"望远镜"，监控整体产出是否仍符合用户最初的意图和约束。

**激活时机：** 每个阶段完成时（`/discover`、`/spec`、`/build` 完成后各运行一次）。

**输入：**
- `discover.json` 中的 constraints、selected_direction、tech_direction、design_philosophy
- `decisions.json` 决策账本
- 当前阶段的产出

**检测的 5 种漂移模式：**

| 漂移类型 | 含义 |
|---------|------|
| Scope Creep | 范围蔓延 -- 功能不断膨胀 |
| Gold Plating | 镀金 -- 过度精致化非核心功能 |
| Tech-Driven Drift | 技术驱动漂移 -- 技术选择反过来驱动产品方向 |
| Requirement Dilution | 需求稀释 -- 核心需求被弱化 |
| Constraint Erosion | 约束侵蚀 -- 之前定义的约束被逐步放松 |

**输出：** 量化漂移评分 (0-100)，附带推荐动作。不是简单的二值 pass/fail。

**分类：** 核心护栏（`core_guardrail`），不可关闭。

### 3.4 Critic -- 独立挑战者

Critic 是 NoPilot 的"放大镜"，在隔离会话中做对抗性质量审查。

**激活时机：** 需求锁定、Spec 反向验证、Build 测试审查、Build 验收审查。

**6Cs 评分框架：**

| 维度 | 级别 | 含义 |
|------|------|------|
| Completeness（完整性） | 必须通过 (block) | 是否覆盖所有需求 |
| Consistency（一致性） | 必须通过 (block) | 各部分是否自洽 |
| Correctness（正确性） | 必须通过 (block) | 技术方案是否正确 |
| Clarity（清晰度） | 建议 (warn) | 表述是否清晰 |
| Conciseness（简洁度） | 建议 (warn) | 是否避免冗余 |
| Concreteness（具体度） | 建议 (warn) | 是否足够具体 |

**AI 偏差检测目录（7 种模式）：**
- 过度工程化
- 乐观评估
- 缺少负面路径
- 概念混淆
- 自我审批偏差
- 锚定效应
- 对称补全

**迭代上限：** 浮动制，按复杂度调整：

| 复杂度 | 最大迭代次数 |
|--------|------------|
| 简单 | 3 |
| 中等 | 5 |
| 复杂 | 7-10 |

达到上限时的策略：
- 趋势收敛 → 延长迭代
- 趋势发散 → 升级模型
- 趋势振荡 → 升级到人类

**分类：** 核心护栏（`core_guardrail`），不可关闭。

### 3.5 生成与审查分离

这是 NoPilot V4.0 的框架级原则：**生成 Agent 永远不能评估自己的产出。** 所有审查由独立的 Critic 实例在隔离会话中执行。

具体保障措施：

1. Critic 在独立的 Agent 会话中运行，不共享生成上下文
2. 每轮审查使用新的 Agent 实例，避免锚定偏差
3. 迭代上限按复杂度浮动，有趋势评估机制

这确保了"同一个 AI 不会自己出题自己改卷"。

### 3.6 可追溯性 ID

NoPilot 使用结构化 ID 建立从需求到代码的完整追溯链：

```
REQ-001 (需求)
  └→ SCENARIO-001 (场景)
       └→ MOD-001 (模块)
            └→ TEST-001 (测试用例)
```

每个 ID 的格式：
- `REQ-xxx` -- 需求项（Discover 阶段生成）
- `SCENARIO-xxx` -- 核心场景（Discover 阶段生成）
- `MOD-xxx` -- 模块（Spec 阶段生成）
- `TEST-xxx` -- 测试用例（Build 阶段生成）

模块通过 `requirement_refs` 字段反向引用需求，测试通过 `acceptance_criteria_refs` 引用验收标准。

### 3.7 回溯安全机制

当下游阶段发现上游决策有问题时，可以触发回溯。NoPilot 提供以下安全保障：

**回溯触发条件：**

| 从 | 到 | 触发条件 |
|----|----|---------|
| Spec | Discover | 发现 discover.json 中存在矛盾 |
| Build | Spec | Spec 接口不可实现 |
| Build | Discover | 需求层面的根本性问题 |

**安全机制：**

- 总回溯上限：3 次（跨所有阶段累计）
- 循环检测：如果出现 A→B→A→B 的回溯模式，终止并报告
- 成本提醒：回溯前通知预估重跑时间
- 回溯策略：完整重跑下游阶段（当前版本不支持增量回溯）

### 3.8 分级异常处理

NoPilot 定义了 L0-L3 四级异常层次，决定了异常的处理方式：

| 级别 | 含义 | 处理方式 | 示例 |
|------|------|---------|------|
| L0 | 环境问题 | AI 自行解决 | 依赖安装失败、端口占用 |
| L1 | 无合约影响 | AI 自行解决 | 实现细节调整、代码风格问题 |
| L2 | 合约违反 | 暂停等待人类产品决策 | 接口不兼容、性能达不到要求 |
| L3 | 根本性错误 | 诊断报告 + 回溯选择 | 架构方案不可行、需求冲突 |

L2 暂停时，用户有以下选项：
- 接受降级（Accept Degradation）
- 砍功能（Cut Feature）
- 修改 Spec（Modify Spec）→ 回溯到 Spec
- 换方式重试（Retry Different Approach）
- 回溯到 Discover（Backtrack Discover）

---

## 4. 三阶段工作流详解

### 4.1 Discover 阶段

**命令：** `/discover`

**目标：** 从模糊的想法到锁定的需求。三层渐进收敛：方向选择 → MVP 定义 → 需求锁定。

#### 状态机流程

```
idea_collection
  │ IDEA_CAPTURED
  ▼
idea_structuring
  │ IDEA_CONFIRMED
  ▼
constraint_collection
  │ MODE_SELECTED
  ▼
direction ◄───────── REJECT_ALL (重新生成方向)
  │ SELECT / MERGE
  ▼
mvp ◄──────────────── BACKTRACK (回到方向选择)
  │ APPROVE
  ▼
design_philosophy
  │ PHILOSOPHY_CONFIRMED
  ▼
lock ◄──────────────── REVISE (修改需求)
  │ APPROVE            BACKTRACK_MVP (回到 MVP)
  ▼                    BACKTRACK_DIR (回到方向选择)
$complete              FORCE_OVERRIDE (强制通过)
```

#### 详细步骤

**Step 0: 想法收集与结构化**

1. **想法收集 (idea_collection)**：自由输入你的项目想法，AI 捕获核心概念
2. **想法结构化 (idea_structuring)**：AI 将模糊想法整理为结构化描述，你确认
3. **约束收集 (constraint_collection)**：收集技术栈、时间、平台、排除项、预算、现有资产等约束

**Step 1: 方向选择 (direction)**

AI 生成多个可能的产品方向，每个方向包含：
- 描述和差异化特征
- 预验尸分析（Pre-mortem）：可能的失败场景、原因、预警信号
- 依据来源（搜索验证 / AI 判断）

你的操作：
- `SELECT` -- 选择一个方向
- `MERGE` -- 合并多个方向
- `REJECT_ALL` -- 全部拒绝，要求重新生成

**Step 2: MVP 定义 (mvp)**

基于选定方向，AI 定义 MVP 范围：
- 核心特性列表和优先级
- 核心场景（用于 Tracer Bullet）
- 技术方向（技术栈、架构风格及其对产品的影响）

你的操作：
- `APPROVE` -- 批准 MVP 定义
- `BACKTRACK` -- 回到方向选择

**Step 3: 设计哲学提取 (design_philosophy)**

AI 从你之前的所有决策中提炼 3-5 条设计哲学原则，每条包含：
- 原则描述
- 理由
- 来源决策

你确认后进入需求锁定。

**Step 4: 需求锁定 (lock)**

AI 生成完整需求文档，包含：
- 需求列表（REQ-xxx），每条有验收标准
- 不变量（系统永远成立的属性）
- 核心场景（SCENARIO-xxx）
- MVP 特性列表
- 领域模型
- 非功能需求

**完整性门控：**

| 指标 | Layer 2 阈值 | Layer 3 阈值 |
|------|-------------|-------------|
| 核心特性覆盖 | >= 60% | >= 80% |
| 场景覆盖 | >= 40% | >= 70% |
| 技术可行性 | >= 60% | - |

**审查流程：**
1. Critic 执行 6Cs 审计（Completeness、Consistency、Correctness 必须通过）
2. Supervisor 执行全局一致性检查
3. 通过后锁定，失败则修正后重新审查

**锁定守卫条件：**
- `critic_review_passed: true`
- `no_unresolved_conflicts: true`
- `invariants_extracted: true`
- `completeness_threshold_met: true`

你的操作：
- `APPROVE` -- 批准锁定的需求
- `REVISE` -- 修改特定需求
- `FORCE_OVERRIDE` -- 承认未解决的问题并强制通过
- `BACKTRACK_MVP` -- 回到 MVP 定义
- `BACKTRACK_DIR` -- 回到方向选择

#### 产出

- `specs/discover.json` -- 锁定的需求、约束、选定方向、设计哲学、技术方向、领域模型
- `specs/discover_history.json` -- 探索日志：考虑过的方向、决策记录
- `specs/discover_review.json` -- Critic 审查和 Supervisor 一致性检查结果

### 4.2 Spec 阶段

**命令：** `/spec`

**目标：** 将锁定的需求展开为模块级技术规格。

**输入依赖：** `specs/discover.json` 或 `specs/discover/index.json`

#### 状态机流程

```
expanding ◄──────────── REVIEW_FIXABLE / CHANGES_REQUESTED / USER_DECISION
  │ COMPLETE            L0_ISSUE (自行解决)
  │ CONTRADICTION → $backtrack:discover
  │ GAP_HIGH_IMPACT → awaiting_user
  ▼
reviewing
  │ REVIEW_CLEAN → $complete
  │ REVIEW_HAS_ISSUES → awaiting_review
  │ REVIEW_FIXABLE → expanding
  ▼
awaiting_review
  │ APPROVED → $complete
  │ CHANGES_REQUESTED → expanding
```

#### 展开内容

Spec 阶段将 Discover 产物分解为以下结构：

**模块 (MOD-xxx)**

每个模块包含：
- `id` -- 格式 `MOD-xxx`
- `name` -- 模块名称
- `responsibility` -- 职责描述
- `source_root` -- 源码根目录
- `owned_files` -- 拥有的文件列表
- `interfaces` -- 接口定义（类型：`api` / `internal` / `event`）
- `data_models` -- 数据模型
- `state_machine` -- 状态机（如适用）
- `nfr_constraints` -- 非功能约束
- `requirement_refs` -- 引用的需求 ID 列表
- `invariant_refs` -- 引用的不变量 ID 列表

**依赖图 (dependency_graph)**

模块间的依赖关系，用于 Build 阶段的拓扑排序。

**自动决策记录 (auto_decisions)**

AI 自主做出的技术决策，每条记录包含：
- 决策内容
- 替代方案
- 影响级别（`low` / `medium` / `high`）

高影响决策会暂停并通知人类。

**向后验证**

Spec 完成后自动执行向后验证：确保 spec 的每个模块都能追溯到 discover 中的需求，反之亦然。任何遗漏都会被标记。

#### 产出

- `specs/spec.json` -- 模块拆分、接口定义、数据模型、依赖图
- `specs/spec_review.json` -- 反向验证和全局一致性检查结果

对于大型项目：
- `specs/spec/index.json` -- 索引文件
- `specs/spec/mod-{id}-{name}.json` -- 每个模块的详细规格

### 4.3 Build 阶段

**命令：** `/build`

**目标：** 按 TDD 方式逐模块实现，自动验收。

**输入依赖：**
- `specs/spec.json` 或 `specs/spec/index.json`
- `specs/discover.json` 或 `specs/discover/index.json`

#### 状态机流程

```
planning
  │ PLAN_READY
  ▼
testing (生成测试用例)
  │ TESTS_GENERATED_REVIEW (full 模式) / TESTS_GENERATED_AUTO (lite 模式)
  ▼
test_reviewing (仅 full 模式)
  │ TEST_REVIEW_PASSED
  ▼
tracer_bullet (验证端到端可行性)
  │ TRACER_PASS
  ▼
implementing (逐模块 TDD)
  │ ALL_MODULES_DONE
  ▼
verifying (运行全量测试)
  │ ALL_PASS
  ▼
accepting (独立验收审查)
  │ ACCEPTANCE_PASS
  ▼
$complete
```

#### 关键步骤

**1. 计划制定 (planning)**

根据 Spec 的依赖图确定模块实现顺序。

**2. 测试生成 (testing)**

从需求和不变量推导测试用例。在 full 模式下，生成的测试会经过独立 Critic 审查。

**3. Tracer Bullet**

选择覆盖最少模块的核心场景，端到端实现一遍。验证架构假设和关键接口是否可行。

如果 Tracer Bullet 失败：
- L0/L1 失败 → 自行修复后重试
- L2/L3 失败 → 进入诊断流程

**4. 逐模块实现 (implementing)**

按依赖顺序，对每个模块执行 TDD 循环：
1. 红灯 -- 运行测试（预期失败）
2. 绿灯 -- 编写最少代码使测试通过
3. 重构 -- 在测试通过的前提下改善代码质量

每模块最多 3 次重试 (`max_retries_per_module: 3`)。

**5. 验证 (verifying)**

运行全量测试套件，确保所有模块协同工作。

**6. 验收 (accepting)**

独立 Critic 实例执行最终验收审查，检查实现是否满足所有 discover 中的需求和不变量。

#### 异常处理流程

```
implementing
  │ L0_ISSUE → env_waiting → ENV_RESOLVED → implementing
  │ L1_RESOLVED → implementing (自行修复)
  │ L2_ISSUE → awaiting_user → (5种选择)
  │ L3_ISSUE → diagnosing → (BACKTRACK_SPEC / BACKTRACK_DISCOVER)
```

#### 产出

- `specs/tests.json` -- 测试用例
- `specs/tests_review.json` -- 测试审查结果
- `specs/build_report.json` -- 执行计划、TDD 结果、自动验收
- `specs/build_review.json` -- 独立验收审查

### 4.4 Visualize 命令

**命令：** `/visualize`

**目标：** 从 `specs/` 中的 JSON 制品生成交互式 HTML Dashboard，供人类审查。

生成的 HTML 文件保存在 `specs/views/` 目录。

---

## 5. Lash 构建编排器

### 5.1 Lash 是什么

Lash 是 NoPilot 内置的多 Agent 构建编排器。它实现了 `/build` 阶段的并行化：将每个 AI 编码平台（Claude Code、Codex、OpenCode）作为一个 Worker Agent，通过 Git Worktree 隔离，并行执行 TDD 实现。

Lash 的核心价值：**把"一个 Agent 串行实现所有模块"变成"多个 Agent 并行实现各自模块，外部验证结果"。**

### 5.2 架构概览

```
┌─────────────────────────────────────────────────┐
│                Lash Orchestrator                │
│             (lash-build.md prompt)              │
├─────────────────────────────────────────────────┤
│                                                 │
│ Plan Generator / State Manager / Task Packager  │
│                        │                        │
│                        ▼                        │
│  ┌───────────────────────────────────────────┐  │
│  │             Platform Launcher             │  │
│  │     (Claude Code / Codex / OpenCode)      │  │
│  └─────┬───────────┬───────────┬─────────────┘  │
│        │           │           │                │
│   Worker 1    Worker 2    Worker 3   ...        │
│  (worktree)  (worktree)  (worktree)             │
│        │           │           │                │
│  ┌─────▼───────────▼───────────▼─────────────┐  │
│  │                Test Runner                │  │
│  │          (外部验证，不信任自报)           │  │
│  └─────────────────────┬─────────────────────┘  │
│                        │                        │
│  ┌─────────────────────▼─────────────────────┐  │
│  │        Failure Classifier (L0-L3)         │  │
│  └─────────────────────┬─────────────────────┘  │
│                        │                        │
│  ┌─────────────────────▼─────────────────────┐  │
│  │         Worktree Manager (merge)          │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 5.3 自动触发条件

当以下条件**全部满足**时，Lash 自动启动（无需手动输入 `/build` 或 `/lash-build`）：

1. 项目中存在 `lash/` 目录
2. `specs/spec.json` 存在（设计已完成）
3. `specs/discover.json` 存在（需求已锁定）
4. 用户意图涉及构建、实现或编码

当条件 1-3 满足但用户未表达构建意图时，AI 会提示："Specs are ready. I can start a multi-agent parallel build whenever you are ready."

### 5.4 配置

Lash 通过 `lash.config.json` 配置，文件放在项目根目录。所有配置项都有默认值，该文件为可选。

**完整配置项：**

```json
{
  "platforms": ["claude-code", "codex", "opencode"],
  "platform_assignment": "round-robin",
  "platform_overrides": null,
  "critic_platform": null,
  "max_concurrency": null,
  "heartbeat_timeout": 300,
  "graceful_shutdown_seconds": 10,
  "max_retries_per_module": 3,
  "max_critic_rounds": 2,
  "max_approach_resets": 2
}
```

**配置项说明：**

| 配置项 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `platforms` | `string[]` | `["claude-code", "codex", "opencode"]` | 可用的 AI 编码平台 |
| `platform_assignment` | `string` | `"round-robin"` | 平台分配策略 |
| `platform_overrides` | `Record<string, string> \| null` | `null` | 按模块指定平台 |
| `critic_platform` | `string \| null` | `null` | Critic 使用的平台 |
| `max_concurrency` | `number \| null` | `null` | 最大并发数 |
| `heartbeat_timeout` | `number` | `300` | 心跳超时（秒） |
| `graceful_shutdown_seconds` | `number` | `10` | 优雅关闭等待时间（秒） |
| `max_retries_per_module` | `number` | `3` | 每模块最大重试次数 |
| `max_critic_rounds` | `number` | `2` | 最大评审轮数 |
| `max_approach_resets` | `number` | `2` | 最大方案重置次数 |

**按模块覆盖平台：**

```json
{
  "platform_overrides": {
    "MOD-001": "claude-code",
    "MOD-002": "codex"
  }
}
```

### 5.5 执行计划生成

`lash plan` 命令从 `spec.json` 和 `discover.json` 生成执行计划。

**核心算法：**

1. **Kahn 拓扑排序** -- 根据模块依赖图确定执行顺序
2. **贪心文件重叠检查** -- 确保同一批次中的模块不存在文件冲突
3. **循环检测** -- DFS 三色标记法，发现循环依赖时报错
4. **确定性保证** -- 所有排序使用字母序模块 ID

**Tracer Bullet 选择：** 从 `discover.json` 的 `core_scenarios` 中选择覆盖最少模块的场景。

**输出结构 (ExecutionPlan)：**

```json
{
  "spec_hash": "sha256...",
  "tracer": {
    "scenario_id": "SCENARIO-001",
    "module_ids": ["MOD-001", "MOD-003"],
    "batch": { "batch_id": "tracer", "modules": [...] }
  },
  "batches": [
    {
      "batch_id": "batch-0",
      "modules": [
        {
          "module_id": "MOD-001",
          "depends_on": [],
          "owned_files": ["src/core.ts"],
          "source_root": "src/"
        }
      ]
    },
    {
      "batch_id": "batch-1",
      "modules": [...]
    }
  ]
}
```

同一批次内的模块可以并行执行。批次之间按顺序执行。

### 5.6 Worker 生命周期

```
spawn -> heartbeat monitoring -> check -> (resume/cancel)
  │                               │
  │       Worker 运行中...        │ 检测完成状态
  │                               │
  ▼                               ▼
┌──────────┐              ┌──────────────────┐
│ Worker   │  完成信号    │ 完成检测优先级:  │
│ 进程     │─────────────→│ 1. done.json     │
│ (隔离的  │              │ 2. 超时检测      │
│ worktree)│              │ 3. 进程退出码    │
└──────────┘              │ 4. git diff 回退 │
                          └──────────────────┘
```

**支持的三个平台：**

| 平台 | 含义 |
|------|------|
| `claude-code` | Anthropic Claude Code CLI |
| `codex` | OpenAI Codex CLI |
| `opencode` | OpenCode CLI |

**完成检测优先级：**

1. **done.json 信号文件** -- Worker 写入 `.lash/done.json`（首选）
2. **超时检测** -- 超过 `heartbeat_timeout` 秒后发送探针，超过 maxProbes 后判定超时
3. **进程退出码** -- Worker 进程已退出时使用
4. **git diff 回退** -- 当以上方式都不可用时，检查 worktree 是否有代码变更

**done.json 信号文件格式：**

```json
{
  "status": "completed",
  "timestamp": "2026-04-04T10:30:00Z",
  "module_id": "MOD-001",
  "summary": "All tests passing, implementation complete",
  "test_summary": { "passed": 15, "failed": 0 }
}
```

### 5.7 任务打包

`lash package` 命令在 Worker 的 worktree 中生成 `.lash/` 任务包，包含 7 个文件：

| 文件 | 内容 |
|------|------|
| `module-spec.json` | 该模块的完整规格 |
| `interfaces.json` | 该模块依赖的和暴露的接口 |
| `tests.json` | 该模块的测试用例 |
| `owned_files.txt` | Worker 可以修改的文件列表 |
| `read_only_files.txt` | Worker 可以读取但不能修改的文件列表 |
| `task.md` | 任务描述（人类可读） |
| `worker-instructions.md` | 平台特定的 Worker 指令 |

**文件所有权边界：** Worker 只能修改 `owned_files.txt` 中列出的文件。Worktree Manager 的 `checkUnexpectedFiles` 会在合并前验证 Worker 是否越界修改。

**TDD 指令：** 任务包中包含 TDD 流程指令 -- 红灯（运行测试，预期失败）→ 绿灯（写代码使测试通过）→ 重构。

**平台特定指令：** `worker-instructions.md` 针对不同平台生成适配的指令格式。

### 5.8 Git Worktree 隔离

Lash 使用 Git Worktree 为每个 Worker 创建隔离的工作环境。

**命名约定：**

| 元素 | 格式 |
|------|------|
| 分支名 | `lash/<moduleId>` |
| Worktree 路径 | `.lash/worktrees/<moduleId>/` |

**生命周期：**

```bash
# 1. 创建 worktree
lash worktree create MOD-001

# 2. Worker 在 worktree 中工作...

# 3. 合并回主分支
lash worktree merge MOD-001

# 4. 清理
lash worktree cleanup MOD-001
```

**合并策略：**
- 使用 `--no-ff`（no fast-forward），保留合并提交记录
- 合并冲突时自动 abort 并报告冲突文件列表
- 合并前执行 `checkUnexpectedFiles` 范围检查

### 5.9 测试运行器

`lash test` 命令自动检测项目的测试框架并执行测试。

**支持的测试框架：**

| 框架 | 检测方式 | 命令 |
|------|---------|------|
| Jest (npm) | `package.json` 中有 test script | `npm test` |
| pytest | 存在 `pytest.ini`、`setup.cfg` 或 `conftest.py` | `pytest` |
| go test | 存在 `go.mod` | `go test ./...` |
| make test | 存在 `Makefile` 且包含 test target | `make test` |

**核心原则：外部验证。** Lash 永远不信任 Worker 自报的测试结果，所有测试由 Lash 在 Worker 外部独立运行。

**测试结果结构 (TestResult)：**

```json
{
  "passed": true,
  "exit_code": 0,
  "stdout": "...",
  "stderr": "...",
  "duration_seconds": 4.5,
  "summary": "202 tests passed"
}
```

### 5.10 失败分类器

`lash classify` 命令对测试失败输出进行分级分类。

**分类逻辑：**

| 级别 | 含义 | 触发动作 |
|------|------|---------|
| PASS | 测试通过 | 继续 |
| L0 | 环境错误（安装失败、网络超时等） | `env_retry` -- 重试 |
| L1 | 实现错误（逻辑错误、类型错误等） | `feedback_to_worker` -- 反馈给 Worker |
| L2 | 合约违反（接口不匹配、越界修改等） | `pause_l2` -- 暂停等待人类决策 |
| L3 | 根本性错误（架构问题、需求冲突等） | `halt_l3` -- 停止构建 |

**分类方法：** 正则模式匹配扫描 stderr 和 stdout。

**文件所有权区分：** 分类器区分 owned files（Worker 拥有的文件）和 external files（其他模块的文件）的失败。对 external files 的修改会被归为 L2。

**重试耗尽策略：** 当某模块重试次数达到 `max_retries_per_module`（默认 3）后，升级为 `escalate_l3`。

### 5.11 构建状态管理

Lash 的构建状态持久化到 `specs/build-state.json`。

**原子写入保证：** 使用"临时文件 + `fs.renameSync`"模式，防止进程崩溃导致状态文件损坏。

**21 种状态转换事件：**

| 事件 | 含义 |
|------|------|
| `worker_spawned` | Worker 已启动 |
| `worker_completed` | Worker 已完成 |
| `worker_failed` | Worker 失败 |
| `worker_timed_out` | Worker 超时 |
| `test_passed` | 测试通过 |
| `test_failed` | 测试失败 |
| `module_critic_spawned` | 模块 Critic 已启动 |
| `module_critic_passed` | 模块 Critic 通过 |
| `module_critic_failed` | 模块 Critic 失败 |
| `batch_completed` | 批次完成 |
| `merge_completed` | 合并完成 |
| `merge_conflict` | 合并冲突 |
| `build_critic_spawned` | 构建 Critic 已启动 |
| `build_critic_passed` | 构建 Critic 通过 |
| `build_critic_failed` | 构建 Critic 失败 |
| `supervisor_spawned` | Supervisor 已启动 |
| `supervisor_passed` | Supervisor 通过 |
| `supervisor_failed` | Supervisor 失败 |
| `build_paused` | 构建暂停 |
| `build_completed` | 构建完成 |
| `build_backtracked` | 构建回溯 |

**7 种构建状态：**

| 状态 | 含义 |
|------|------|
| `in_progress` | 构建进行中 |
| `completed` | 构建完成 |
| `failed` | 构建失败 |
| `backtracked` | 已回溯 |
| `paused_l2` | L2 异常暂停 |
| `paused_critic` | Critic 审查暂停 |
| `paused_supervisor` | Supervisor 审查暂停 |

**崩溃恢复：**

`lash state resume` 命令从持久化的状态文件计算恢复点：

```json
{
  "phase": "batch_execution",
  "batch_id": "batch-1",
  "module_id": "MOD-003",
  "pending_action": "retry_worker",
  "session_recovery": [
    {
      "module_id": "MOD-003",
      "session_resumable": true,
      "worktree_exists": true
    }
  ]
}
```

---

## 6. UI Taste 系统

### 6.1 系统定位

UI Taste 系统在 `/discover` 阶段的 Step 0c 激活，用于在需求探索期间确定项目的视觉设计方向。它生成高保真 UI mockup，让用户在需求锁定之前就能看到并选择设计风格。

最终产出（`UITasteConstraint`）写入 `discover.json`，作为下游阶段的设计约束。

### 6.2 架构概览

9 个模块，Provider Pattern + Engine Pattern 组合：

```
┌─────────────────────────────────────────────┐
│         TasteOrchestrator (编排层)          │
│               8 阶段生命周期                │
├─────────────────────────────────────────────┤
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │              Provider 层              │  │
│  │  ┌──────────────┐  ┌─────────────────┐│  │
│  │  │StitchProvider│  │AgentHTMLProvider││  │
│  │  │  (Tier 1)    │  │  (Tier 2)       ││  │
│  │  └──────────────┘  └─────────────────┘│  │
│  │       ProviderRegistry                │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │               Engine 层               │  │
│  │  ┌──────────────┐  ┌───────────────┐  │  │
│  │  │PreviewEngine │  │IterationEngine│  │  │
│  │  │(HTTP 预览)   │  │(迭代反馈)     │  │  │
│  │  └──────────────┘  └───────────────┘  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │                Tool 层                │  │
│  │  ┌─────────┐  ┌─────────┐  ┌────────┐ │  │
│  │  │Style    │  │Post     │  │Token   │ │  │
│  │  │Detector │  │Processor│  │Exporter│ │  │
│  │  └─────────┘  └─────────┘  └────────┘ │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 6.3 Provider 层

**DesignProvider 接口：**

所有 Provider 实现统一的 `DesignProvider` 接口：

| 方法 | 功能 |
|------|------|
| `name()` | 返回 Provider 名称 |
| `isAvailable()` | 检测可用性（5 秒超时） |
| `generateScreen(request)` | 生成单个页面的 HTML |
| `generateVariants(request)` | 生成变体 |
| `extractDesignContext(variant)` | 从变体中提取 Design DNA |
| `createDesignSystem(dna)` | 创建 Design System |
| `applyDesignSystem(projectId, ref)` | 应用 Design System |

**两个内置 Provider：**

| Provider | Tier | 特点 |
|----------|------|------|
| StitchProvider | Tier 1 | 适配 Stitch MCP，API 配额跟踪，5 种色板 |
| AgentHTMLProvider | Tier 2 | 确定性模板，始终可用，5 种配色 + 5 种布局 |

**ProviderRegistry：** 管理 Provider 注册、可用性检测（5 秒超时）和 Tier 分配。优先使用高 Tier Provider，不可用时回退到低 Tier。

### 6.4 引擎层

**PreviewEngine（HTTP 预览服务器）：**

- 启动本地 HTTP 服务器展示生成的 HTML
- 10 种设备预设（手机、平板、桌面等）
- 暗色/亮色模式切换
- 支持选择、迭代、回滚操作

**IterationEngine（迭代引擎）：**

- **DNA 合成：** 从用户选择中提取 7 个维度的 Design DNA（色板、字体、间距、圆角、阴影、动画、设计语言）
- **反馈累积：** 多轮迭代的反馈叠加，逐步收敛
- **历史回滚：** 支持回到之前的迭代轮次

### 6.5 工具层

**StyleDetector（风格检测器）：**

扫描项目中已有的设计资产：

| 扫描目标 | 检测内容 |
|---------|---------|
| Tailwind 配置 | 主题色、间距、字体 |
| CSS/SCSS 文件 | 颜色变量、字体族、间距 |
| Design Tokens | W3C DTCG 格式的 Token |

检测结果按优先级排序，生成约束文档，确保新生成的设计与已有风格一致。

**PostProcessor（后处理器）：**

| 功能 | 说明 |
|------|------|
| 字体修补 | 替换为项目指定的字体栈 |
| 资产内联 | 将外部资源转为 base64 内联 |
| 响应式注入 | 添加响应式 meta 标签和媒体查询 |

**TokenExporter（Token 导出器）：**

将 Design DNA 导出为标准格式：
- **W3C DTCG 格式** -- 跨工具互通的 Design Token 标准
- **CSS 自定义属性** -- 直接在 CSS 中使用的变量

### 6.6 编排流程

TasteOrchestrator 执行 8 阶段生命周期：

```
1. 风格检测     → StyleDetector 扫描已有设计资产
2. Provider 选择 → ProviderRegistry 选择最高可用 Tier
3. 页面处理     → 对每个页面生成基础变体和多个设计变体
4. 迭代         → PreviewEngine 展示，用户选择/反馈，IterationEngine 合成
5. 暗色/亮色配对 → 为选定变体生成暗色模式对应版本
6. 后处理       → PostProcessor 修补字体、内联资产、注入响应式
7. Token 导出   → TokenExporter 导出 Design Token
8. 保存         → 将结果写入 discover.json 的 UITasteConstraint
```

---

## 7. CLI 参考

### 7.1 nopilot CLI

框架级操作命令。

#### `nopilot init [dir]`

初始化项目。

```bash
# 初始化当前目录
nopilot init

# 初始化指定目录
nopilot init /path/to/project

# 强制覆盖已有文件
nopilot init --force
```

**执行动作：**
1. 复制 `commands/*.md` → `<dir>/.claude/commands/`
2. 复制 `schemas/*.json` → `<dir>/schemas/`
3. 复制 `workflow.json` → `<dir>/workflow.json`
4. 向 `CLAUDE.md`、`AGENTS.md`、`opencode.md` 追加 Lash 自动触发指令（幂等操作）

| 选项 | 说明 |
|------|------|
| `--force` | 覆盖已有文件（默认跳过已有文件） |

#### `nopilot version`

显示版本号。

```bash
nopilot version
# 输出: nopilot v1.0.0
```

#### `nopilot validate`

验证项目制品。V2 占位，当前未实现。

#### `nopilot preview`

预览生成的制品。Issue #21 占位，当前未实现。

### 7.2 lash CLI

Lash 构建运行时的原子子命令。所有命令输出 JSON 格式到 stdout，错误输出 JSON 格式到 stderr。

#### `lash preflight`

验证平台可用性和认证状态。

```bash
# 指定平台
lash preflight --platforms claude-code,codex

# 使用配置文件
lash preflight --config lash.config.json
```

| 选项 | 说明 |
|------|------|
| `--platforms <p1,p2>` | 逗号分隔的平台名称 |
| `--config <path>` | 配置文件路径（未指定 --platforms 时使用） |

**输出示例：**

```json
{
  "claude-code": {
    "available": true,
    "version": "1.0.0",
    "auth_ok": true,
    "error": null
  }
}
```

#### `lash plan <spec_path> <discover_path>`

从设计产物生成执行计划。

```bash
lash plan specs/spec.json specs/discover.json
```

**输出：** `ExecutionPlan` JSON（见 [5.5 执行计划生成](#55-执行计划生成)）。

#### `lash worktree create <module_id>`

为模块创建 Git Worktree。

```bash
lash worktree create MOD-001
lash worktree create MOD-001 --project-root /path/to/project
```

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--project-root <path>` | `.` | 项目根目录 |

**输出：**

```json
{
  "worktree_path": ".lash/worktrees/MOD-001/",
  "branch_name": "lash/MOD-001"
}
```

#### `lash worktree merge <module_id>`

将模块分支合并回主分支。

```bash
lash worktree merge MOD-001
```

**输出：**

```json
{
  "success": true,
  "branch_name": "lash/MOD-001",
  "conflict_files": null,
  "merge_commit": "abc123..."
}
```

#### `lash worktree cleanup <module_id>`

删除 Worktree 和分支。

```bash
lash worktree cleanup MOD-001
```

**输出：**

```json
{
  "cleaned": true,
  "module_id": "MOD-001"
}
```

#### `lash package <module_id> <worktree_path> <platform>`

在 Worker 的 worktree 中生成 `.lash/` 任务包。

```bash
lash package MOD-001 .lash/worktrees/MOD-001 claude-code \
  --spec specs/spec.json \
  --discover specs/discover.json \
  --tests specs/tests.json \
  --completed MOD-000
```

| 选项 | 必须 | 说明 |
|------|------|------|
| `--spec <path>` | 是 | spec.json 路径 |
| `--discover <path>` | 是 | discover.json 路径 |
| `--tests <path>` | 否 | tests.json 路径 |
| `--completed <m1,m2>` | 否 | 已完成的模块 ID（逗号分隔） |

**输出：**

```json
{
  "files_written": [
    ".lash/module-spec.json",
    ".lash/interfaces.json",
    ".lash/tests.json",
    ".lash/owned_files.txt",
    ".lash/read_only_files.txt",
    ".lash/task.md",
    ".lash/worker-instructions.md"
  ]
}
```

#### `lash spawn <platform> <module_id> <worktree_path>`

启动 Worker 进程。

```bash
lash spawn claude-code MOD-001 .lash/worktrees/MOD-001 \
  --task "Implement authentication module per spec" \
  --instruction-file .lash/worker-instructions.md
```

| 选项 | 必须 | 说明 |
|------|------|------|
| `--task <text>` | 是 | 任务描述 |
| `--instruction-file <path>` | 否 | Worker 指令文件路径 |

**输出：**

```json
{
  "pid": 12345,
  "session_id": "sess_abc123",
  "platform": "claude-code",
  "module_id": "MOD-001",
  "worktree_path": ".lash/worktrees/MOD-001",
  "started_at": "2026-04-04T10:00:00Z"
}
```

#### `lash check <module_id> <worktree_path>`

轮询 Worker 完成状态。

```bash
lash check MOD-001 .lash/worktrees/MOD-001 \
  --pid 12345 \
  --platform claude-code \
  --started-at 2026-04-04T10:00:00Z \
  --timeout 300
```

| 选项 | 必须 | 说明 |
|------|------|------|
| `--pid <pid>` | 是 | Worker 进程 ID |
| `--platform <name>` | 否 | 平台名称（默认 `claude-code`） |
| `--started-at <iso>` | 否 | 启动时间（ISO 格式，用于超时检测） |
| `--timeout <seconds>` | 否 | 超时秒数（默认 300） |

**输出：**

```json
{
  "status": "completed",
  "exit_code": 0,
  "has_diff": true
}
```

`status` 可能的值：`running`、`completed`、`completed_empty`、`failed`、`timeout`

#### `lash resume <platform> <session_id> <worktree_path>`

向暂停的 Worker 发送反馈。

```bash
lash resume claude-code sess_abc123 .lash/worktrees/MOD-001 \
  --feedback "Fix the type error in auth.ts line 42"
```

| 选项 | 必须 | 说明 |
|------|------|------|
| `--feedback <text>` | 是 | 反馈文本 |

#### `lash cancel`

终止 Worker 进程。

```bash
lash cancel --pid 12345
lash cancel --pid 12345 --graceful 15
```

| 选项 | 必须 | 说明 |
|------|------|------|
| `--pid <pid>` | 是 | Worker 进程 ID |
| `--graceful <seconds>` | 否 | 优雅关闭等待时间（默认 10 秒） |

#### `lash test <path>`

检测测试运行器并执行测试。

```bash
lash test .
lash test src/auth --filter "login"
```

| 选项 | 说明 |
|------|------|
| `--filter <expr>` | 测试过滤表达式 |

#### `lash classify <output_file>`

分类测试失败的严重程度。

```bash
lash classify test-output.json
lash classify test-output.json --owned-files "src/auth.ts,src/user.ts"
```

| 选项 | 说明 |
|------|------|
| `--owned-files <glob1,glob2>` | 逗号分隔的文件路径（用于区分 owned/external 失败） |

**输出：**

```json
{
  "level": "L1",
  "highest_level": "L1",
  "reasons": [
    {
      "level": "L1",
      "pattern_matched": "TypeError",
      "evidence": "TypeError: Cannot read property 'id' of undefined",
      "file": "src/auth.ts",
      "line": 42,
      "in_owned_files": true
    }
  ]
}
```

#### `lash state create`

创建初始构建状态。

```bash
lash state create --spec-hash sha256abc123
lash state create --spec-hash sha256abc123 --state-path custom/state.json
```

| 选项 | 必须 | 说明 |
|------|------|------|
| `--spec-hash <hash>` | 是 | Spec 文件的哈希值 |
| `--state-path <path>` | 否 | 状态文件路径（默认 `specs/build-state.json`） |

#### `lash state update <event_name>`

记录状态转换。

```bash
lash state update worker_completed --data '{"module_id": "MOD-001"}'
lash state update test_passed --data '{"module_id": "MOD-001"}' --state-path custom/state.json
```

| 选项 | 说明 |
|------|------|
| `--data <json>` | 转换数据（JSON 格式） |
| `--state-path <path>` | 状态文件路径（默认 `specs/build-state.json`） |

#### `lash state resume`

从持久化状态计算恢复点。

```bash
lash state resume
lash state resume --state-path custom/state.json
```

---

## 8. Schema 参考

### 8.1 Schema 体系总览

NoPilot 使用 14 个 JSON Schema（v4.0，基于 JSON Schema draft 2020-12）定义所有制品的结构。

Schema 文件位于 `schemas/` 目录：

| 分类 | Schema 文件 | 用途 |
|------|------------|------|
| **Discover** | `discover.schema.json` | Discover 主制品 |
| | `discover_index.schema.json` | Discover 目录模式索引 |
| | `discover_history.schema.json` | 探索历史日志 |
| | `discover_review.schema.json` | Discover 审查结果 |
| **Spec** | `spec.schema.json` | Spec 主制品 |
| | `spec_index.schema.json` | Spec 目录模式索引 |
| | `spec_review.schema.json` | Spec 审查结果 |
| **Tests** | `tests.schema.json` | 测试用例 |
| | `tests_index.schema.json` | Tests 目录模式索引 |
| | `tests_review.schema.json` | Tests 审查结果 |
| **Build** | `build_report.schema.json` | Build 报告 |
| | `build_index.schema.json` | Build 目录模式索引 |
| | `build_review.schema.json` | Build 审查结果 |
| **辅助** | `decisions.schema.json` | 决策账本 |

### 8.2 Discover Schema

`discover.schema.json` 的必需字段：

```
phase           : "discover"
version         : string (e.g., "4.0")
status          : "approved" | "draft" | "in_progress"
mode            : "full" | "lite"
constraints     : { tech_stack, exclusions, existing_assets, time?, platform?, budget? }
selected_direction : { description, differentiator, rationale, grounding, pre_mortem? }
tech_direction  : { stack, architecture_style, product_impact?, rationale? }
requirements    : array of REQ-xxx objects
invariants      : array of system invariants
core_scenarios  : array of SCENARIO-xxx objects
mvp_features    : array of MVP features
context_dependencies : array
```

可选字段：

```
design_philosophy : array of { principle, justification, source_decisions? }
domain_model      : object
nfr               : non-functional requirements
ui_taste          : UITasteConstraint
```

`constraints` 对象结构：

| 字段 | 类型 | 必须 | 含义 |
|------|------|------|------|
| `tech_stack` | `string[]` | 是 | 技术栈约束 |
| `exclusions` | `string[]` | 是 | 排除项 |
| `existing_assets` | `string[]` | 是 | 现有资产 |
| `time` | `string \| null` | 否 | 时间约束 |
| `platform` | `string[]` | 否 | 平台约束 |
| `budget` | `string \| null` | 否 | 预算约束 |

`selected_direction` 对象结构：

| 字段 | 类型 | 必须 | 含义 |
|------|------|------|------|
| `description` | `string` | 是 | 方向描述 |
| `differentiator` | `string` | 是 | 差异化特征 |
| `rationale` | `string` | 是 | 选择理由 |
| `grounding` | `"search_verified" \| "ai_judgment_only"` | 是 | 依据来源 |
| `pre_mortem` | `array` | 否 | 预验尸分析 |

### 8.3 Spec Schema

`spec.schema.json` 的必需字段：

```
phase               : "spec"
version             : string
status              : "approved" | "draft" | "in_progress"
modules             : array of module objects
dependency_graph    : object
external_dependencies : array
global_error_strategy : object
auto_decisions      : array
contract_amendments : array
context_dependencies : array
```

模块对象必需字段：

| 字段 | 类型 | 含义 |
|------|------|------|
| `id` | `string` (格式 `MOD-xxx`) | 模块 ID |
| `name` | `string` | 模块名称 |
| `responsibility` | `string` | 职责描述 |
| `interfaces` | `array` | 接口定义 |
| `data_models` | `array` | 数据模型 |
| `requirement_refs` | `string[]` | 引用的需求 ID |

模块对象可选字段：

| 字段 | 类型 | 含义 |
|------|------|------|
| `source_root` | `string` | 源码根目录 |
| `owned_files` | `string[]` | 拥有的文件 |
| `state_machine` | `object` | 状态机定义 |
| `nfr_constraints` | `object` | 非功能约束 |
| `invariant_refs` | `string[]` | 引用的不变量 ID |

接口类型：

| 类型 | 含义 |
|------|------|
| `api` | 外部 API 接口 |
| `internal` | 模块间内部接口 |
| `event` | 事件驱动接口 |

### 8.4 Build Schema

`build_report.schema.json` 定义构建报告的结构，记录每个模块的 TDD 执行结果、测试通过率、异常处理记录。

`build_index.schema.json` 定义目录模式下的索引文件结构。

`build_review.schema.json` 定义独立验收审查结果的结构。

### 8.5 Tests Schema

`tests.schema.json` 定义测试用例的结构，包含从需求和不变量推导的测试用例。

`tests_index.schema.json` 定义目录模式下的索引文件结构。

`tests_review.schema.json` 定义测试审查结果的结构。

### 8.6 辅助 Schema

**decisions.schema.json** -- 决策账本

记录跨阶段的所有决策（人类决策和 AI 自动决策），作为统一的审计轨迹。

---

## 9. 架构决策

### 9.1 为什么是三阶段流水线

**问题：** 直接从想法到代码，容易产生"边想边做"的混乱局面，需求不清导致频繁返工。

**决策：** 将流程强制拆分为 Discover → Spec → Build 三个阶段，每个阶段有明确的输入和输出。

**收益：**
- 上游决策锁定后，下游执行不再受方向变更干扰
- 每个阶段的产出是机器可读的 JSON 契约，不是模糊的自然语言文档
- 回溯有明确的目标阶段，不会在"需求还是实现"之间摇摆

**代价：** 对简单项目可能感觉流程偏重（V1.5 计划通过 Lite 模式缓解）。

### 9.2 为什么生成与审查分离

**问题：** 同一个 AI 生成产出后自我评估，存在系统性偏差（锚定效应、自我肯定偏差）。

**决策：** 生成 Agent 和审查 Agent 运行在不同会话中，不共享上下文。每轮审查使用新的 Agent 实例。

**收益：**
- 消除"自己出题自己改卷"的问题
- 每轮审查的 Agent 不受前一轮审查结论的锚定影响
- 可以检测 7 种已知的 AI 偏差模式

**代价：** 额外的 API 调用成本和时间。

### 9.3 为什么用 JSON 作为制品格式

**问题：** 自然语言文档难以被下游 Agent 精确消费，导致信息丢失和误解。

**决策：** 所有制品使用结构化 JSON，配有 JSON Schema 定义。

**收益：**
- 下游 Agent 可以精确读取特定字段，而非从自然语言中提取信息
- Schema 验证可以在写入时拦截格式错误
- 跨阶段追溯链（REQ → MOD → TEST）通过 ID 引用实现，不依赖文本匹配

**代价：** JSON 的人类可读性不如 Markdown（通过 `/visualize` 命令生成 HTML Dashboard 缓解）。

### 9.4 为什么 Lash 从 Python 迁移到 TypeScript

**问题：** NoPilot 本身是 TypeScript 项目，Lash 作为独立的 Python 包增加了安装复杂度和维护成本。

**决策：** V1.2 将 Lash 从 Python 3.10 重写为 TypeScript，合并为 NoPilot 的一部分。

**收益：**
- 单一 `npm install -g nopilot` 安装两个 CLI
- 统一的类型系统和测试框架
- 无需 Python 运行时作为外部依赖

**代价：** 一次性的迁移工程量。

### 9.5 为什么用 Git Worktree 隔离 Worker

**问题：** 多个 Worker 同时修改同一代码库，文件冲突不可避免。

**决策：** 每个 Worker 在独立的 Git Worktree 中工作，通过 `--no-ff` 合并回主分支。

**收益：**
- Worker 之间零文件系统干扰
- 合并冲突在合并时才出现，不影响 Worker 的开发过程
- Worktree 的 `owned_files` 边界确保 Worker 不会越界修改其他模块

**代价：** 磁盘空间（每个 Worktree 是仓库的一个检出副本）。

### 9.6 为什么外部测试验证

**问题：** AI Worker 可能"通过"测试的方式是修改测试本身，或者错误地报告测试通过。

**决策：** Lash 在 Worker 外部独立运行测试，永远不信任 Worker 自报的测试结果。

**收益：**
- 消除 Worker 自报结果的信任问题
- 测试执行环境与 Worker 环境隔离
- 统一的测试结果格式便于失败分类

**代价：** 额外的测试执行时间。

---

## 10. 工作流状态机

### 10.1 workflow.json 结构

`workflow.json` 是 NoPilot 的主工作流定义文件，定义了所有阶段的状态机、护栏配置和回溯规则。

顶层结构：

```json
{
  "name": "nopilot",
  "version": "4.0",
  "max_backtrack_count": 3,
  "backtrack_cycle_detection": true,
  "framework_principles": { ... },
  "agents": {
    "supervisor": { ... },
    "critic": { ... }
  },
  "enhancement_guardrails": { ... },
  "artifact_structure": { ... },
  "stages": {
    "discover": { ... },
    "spec": { ... },
    "build": { ... }
  },
  "backtrack_triggers": [ ... ],
  "backtrack_strategy": "full_rerun"
}
```

### 10.2 Discover 状态机

```
States:
  idea_collection → idea_structuring → constraint_collection
    → direction → mvp → design_philosophy → lock → $complete

Transitions:
  idea_collection   + IDEA_CAPTURED      → idea_structuring
  idea_structuring  + IDEA_CONFIRMED     → constraint_collection
  constraint_collection + MODE_SELECTED  → direction
  direction         + SELECT / MERGE     → mvp
  direction         + REJECT_ALL         → direction
  mvp               + APPROVE            → design_philosophy
  mvp               + BACKTRACK          → direction
  design_philosophy + PHILOSOPHY_CONFIRMED → lock
  lock              + APPROVE            → $complete
  lock              + REVISE             → lock
  lock              + FORCE_OVERRIDE     → $complete
  lock              + BACKTRACK_MVP      → mvp
  lock              + BACKTRACK_DIR      → direction
```

### 10.3 Spec 状态机

```
States:
  expanding → reviewing → $complete
  expanding → awaiting_user → expanding
  reviewing → awaiting_review → $complete / expanding

Transitions:
  expanding       + COMPLETE         → reviewing
  expanding       + CONTRADICTION    → $backtrack:discover
  expanding       + GAP_HIGH_IMPACT  → awaiting_user
  expanding       + L0_ISSUE         → expanding
  awaiting_user   + USER_DECISION    → expanding
  reviewing       + REVIEW_CLEAN     → $complete
  reviewing       + REVIEW_HAS_ISSUES → awaiting_review
  reviewing       + REVIEW_FIXABLE   → expanding
  awaiting_review + APPROVED         → $complete
  awaiting_review + CHANGES_REQUESTED → expanding
```

### 10.4 Build 状态机

```
States:
  planning → testing → test_reviewing → tracer_bullet
    → implementing → verifying → accepting → $complete
  implementing → env_waiting / awaiting_user / diagnosing
  implementing → amending / replanning

Key Transitions:
  planning        + PLAN_READY             → testing
  testing         + TESTS_GENERATED_REVIEW → test_reviewing  (full mode)
  testing         + TESTS_GENERATED_AUTO   → tracer_bullet   (lite mode)
  test_reviewing  + TEST_REVIEW_PASSED     → tracer_bullet
  tracer_bullet   + TRACER_PASS            → implementing
  tracer_bullet   + TRACER_L0L1_FAIL       → tracer_bullet
  tracer_bullet   + TRACER_L2L3_FAIL       → diagnosing
  implementing    + ALL_MODULES_DONE       → verifying
  implementing    + L2_ISSUE               → awaiting_user
  implementing    + L3_ISSUE               → diagnosing
  verifying       + ALL_PASS               → accepting
  accepting       + ACCEPTANCE_PASS        → $complete
  accepting       + ACCEPTANCE_FAIL_L2     → awaiting_user
  accepting       + ACCEPTANCE_FAIL_L3     → diagnosing
  diagnosing      + BACKTRACK_SPEC         → $backtrack:spec
  diagnosing      + BACKTRACK_DISCOVER     → $backtrack:discover
```

### 10.5 回溯触发器

```json
[
  {
    "from": "spec",
    "to": "discover",
    "condition": "contradiction_in_discover_json"
  },
  {
    "from": "build",
    "to": "spec",
    "condition": "spec_interface_infeasible"
  },
  {
    "from": "build",
    "to": "discover",
    "condition": "requirement_level_fundamental_issue"
  }
]
```

回溯策略：`full_rerun` -- 触发回溯后完整重跑目标阶段及其所有下游阶段。

安全机制：
- `max_backtrack_count: 3` -- 跨所有阶段累计最多 3 次回溯
- `backtrack_cycle_detection: true` -- 检测 A→B→A→B 循环并终止

---

## 11. 项目文件结构

完整的 NoPilot 项目（初始化后 + 运行完工作流）的文件结构：

```
your-project/
├── .claude/
│   └── commands/                    # Slash commands (由 nopilot init 创建)
│       ├── discover.md              # /discover 命令定义
│       ├── spec.md                  # /spec 命令定义
│       ├── build.md                 # /build 命令定义
│       ├── visualize.md             # /visualize 命令定义
│       ├── supervisor.md            # Supervisor agent 定义
│       ├── critic.md                # Critic agent 定义
│       ├── lash-build.md            # Lash 编排主流程
│       ├── lash-tracer.md           # Lash tracer bullet 阶段
│       ├── lash-batch.md            # Lash 批次执行阶段
│       ├── lash-verify.md           # Lash 最终验证阶段
│       ├── lash-conflict-resolver.md
│       ├── lash-orchestrator.md
│       └── lash-worker-instructions.md
│
├── schemas/                         # 14 个 JSON Schema (v4.0)
│   ├── discover.schema.json
│   ├── discover_index.schema.json
│   ├── discover_history.schema.json
│   ├── discover_review.schema.json
│   ├── spec.schema.json
│   ├── spec_index.schema.json
│   ├── spec_review.schema.json
│   ├── tests.schema.json
│   ├── tests_index.schema.json
│   ├── tests_review.schema.json
│   ├── build_report.schema.json
│   ├── build_index.schema.json
│   ├── build_review.schema.json
│   └── decisions.schema.json
│
├── specs/                           # 运行时制品（由命令生成）
│   ├── discover.json                # 或 discover/index.json + 子文件
│   ├── discover_history.json        # 或 discover/history.json
│   ├── discover_review.json
│   ├── spec.json                    # 或 spec/index.json + mod-xxx.json
│   ├── spec_review.json
│   ├── tests.json                   # 或 tests/index.json + mod-xxx.json
│   ├── tests_review.json
│   ├── build_report.json            # 或 build/index.json + mod-xxx.json
│   ├── build_review.json
│   ├── build-state.json             # Lash 构建状态（如使用 Lash）
│   ├── decisions.json               # 决策账本
│   └── views/                       # /visualize 生成的 HTML
│
├── .lash/                           # Lash 运行时目录（如使用 Lash）
│   └── worktrees/                   # Worker 隔离环境
│       ├── MOD-001/
│       ├── MOD-002/
│       └── ...
│
├── lash.config.json                 # Lash 配置（可选）
├── workflow.json                    # 工作流状态机定义
├── CLAUDE.md                        # 项目上下文（含 Lash 触发指令）
└── ...                              # 你的项目源码
```

---

## 12. 常见问题

### Q: NoPilot 支持已有项目（Brownfield）吗？

目前不支持。V1.x 仅面向 Greenfield 项目。Brownfield 支持计划在 V1.5 版本实现。

### Q: 可以跳过某个阶段吗？

不可以。三个阶段是严格递进的：`/spec` 需要读取 `discover.json`，`/build` 需要读取 `spec.json`。跳过上游阶段会导致下游缺少输入。

### Q: 回溯会丢失已完成的工作吗？

当前版本（V1.2）的回溯策略是 `full_rerun`，回溯到的目标阶段及其下游阶段会完整重跑。增量回溯计划在 V2 实现。

### Q: Lash 支持哪些 AI 编码平台？

三个平台：`claude-code`（Anthropic Claude Code）、`codex`（OpenAI Codex）、`opencode`（OpenCode）。平台分配默认使用 round-robin 策略。

### Q: 如果 Worker 修改了不属于它的文件会怎样？

Lash 的 Worktree Manager 在合并前会运行 `checkUnexpectedFiles` 范围检查。如果 Worker 修改了 `owned_files.txt` 之外的文件，会被检测到并报告为异常。

### Q: 测试失败时 Lash 如何决定重试还是停止？

通过 Failure Classifier 的分级判断：
- L0（环境错误）→ 自动重试
- L1（实现错误）→ 将错误反馈给 Worker，要求修复
- L2（合约违反）→ 暂停等待人类决策
- L3（根本错误）→ 停止构建

每模块最多重试 3 次（`max_retries_per_module`），耗尽后升级为 L3。

### Q: NoPilot 必须和 Claude Code 一起使用吗？

NoPilot 的三阶段工作流（`/discover`、`/spec`、`/build`）目前设计为 Claude Code 的 slash commands。Lash 构建编排器同时支持 Claude Code、Codex 和 OpenCode 作为 Worker 平台。

### Q: 如何在团队中使用 NoPilot？

NoPilot 当前定位为"个人开发工作流"。所有制品（`specs/` 目录下的 JSON 文件）可以提交到 Git 仓库，团队成员可以查看决策历史和设计规格。多人协作的正式支持尚未规划。

### Q: Supervisor 和 Critic 可以关闭吗？

不可以。两者都被标记为 `core_guardrail`（核心护栏），这是设计决策，不是配置选项。

### Q: 制品文件太大怎么办？

NoPilot 支持目录拆分模式。例如，`specs/spec.json` 可以拆分为 `specs/spec/index.json` + `specs/spec/mod-001-auth.json` + `specs/spec/mod-002-storage.json`。下游 Agent 只加载需要的子文件。

### Q: JSON Schema 验证是自动执行的吗？

当前版本不做自动验证。Schema 文件存在于 `schemas/` 目录供参考。自动验证计划在 V2 的 MCP/Script Enforcement Layer 中实现。

### Q: Lash 的构建状态崩溃后能恢复吗？

能。Lash 使用原子写入（临时文件 + `fs.renameSync`）保证状态文件不会因进程崩溃而损坏。`lash state resume` 命令可以从持久化状态计算恢复点，继续构建。

---

## 13. 路线图

| 版本 | 状态 | 主要内容 |
|------|------|---------|
| **V1.0** | 已交付 | 核心三阶段流水线，Supervisor + Critic，异常处理，回溯安全 |
| **V1.1** | 已交付 | Schema 4.0，`/visualize`，决策账本，生成-审查分离，6Cs 框架，漂移检测 |
| **V1.2** | 已交付 | Lash Python→TypeScript 重写，合并入 NoPilot，双 CLI，202 个测试 |
| **V1.5** | 计划中 | Lite 模式（简化流程），Brownfield 支持（已有代码库），搜索加固，预飞检查 |
| **V2** | 计划中 | 增量回溯，MCP/Script 强制层，多模型验证，上下文管理 |
| **V3** | 计划中 | 跨项目记忆，Spec 漂移检测，变异测试，动态约束维度 |
| **V4** | 计划中 | iOS 运行时适配器，并行模块执行，插件架构，Web Dashboard |

---

*本文档基于 NoPilot V1.2 (Schema 4.0) 源码编写。如有疑问，以代码和 `workflow.json` 为准。*
