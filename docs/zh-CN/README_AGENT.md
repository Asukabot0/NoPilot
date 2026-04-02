# NoPilot — Agent 安装指南

[English](../../README_AGENT.md)

你正在阅读这份文档，说明你想在一个项目中安装 NoPilot。NoPilot 是一个三阶段开发工作流（`/discover` -> `/spec` -> `/build`），以 Claude Code slash commands 形式运行。

## 前置条件

- 已安装并认证 Claude Code CLI
- 一个项目目录（空目录或已有项目——V1 仅支持 Greenfield）

## 安装

### 1. 将工作流文件复制到你的项目中

```bash
# 从 NoPilot 仓库复制以下文件到目标项目：
cp workflow.json /path/to/your/project/
cp -r .claude/commands/ /path/to/your/project/.claude/commands/
mkdir -p /path/to/your/project/specs
```

你的项目结构应该是：

```
your-project/
├── workflow.json
├── .claude/
│   └── commands/
│       ├── discover.md
│       ├── spec.md
│       ├── build.md
│       ├── supervisor.md
│       └── critic.md
└── specs/                  # 运行时制品写入此目录
```

### 2. 完成

无依赖。无构建步骤。无需配置。Slash commands 是自包含的。

## 使用方法

在 Claude Code 中按顺序执行三个命令：

```
/discover    ->    /spec    ->    /build
```

### /discover

探索需求空间。你提供项目想法，AI 生成可能性，你做决策。

**流程：**
1. Step 0：AI 询问约束条件（技术栈、平台、时间等）并推荐 `full` 或 `lite` 模式
2. Layer 1：AI 生成 3-5 个产品方向。你选一个。
3. Layer 2：AI 展开为功能列表 + 技术推荐 + 失败场景。你裁剪并确认。
4. Layer 3：AI 生成详细需求和验收标准。你审查并批准。

**产出制品：** `specs/discover.json`、`specs/discover_history.json`

### /spec

将需求展开为模块级技术规格。大部分自动完成——只在发现问题时暂停。

**流程：**
1. AI 读取 `specs/discover.json`，设计模块、接口、数据模型
2. Critic Agent（独立会话）验证 spec 是否满足所有需求
3. Supervisor Agent 检查复杂度是否膨胀
4. 无问题：自动继续。有问题：暂停等你审查。

**产出制品：** `specs/spec.json`、`specs/spec_review.json`

### /build

自主 TDD 实现。人类参与接近零。

**流程：**
1. AI 生成执行计划和测试用例
2. Tracer bullet：实现最薄的端到端切片验证假设
3. 逐模块 TDD：写测试 → 实现 → 通过 → 下一个模块
4. 自动验收：验证代码是否真正匹配你的原始意图
5. Supervisor 检查最终产出一致性

**产出制品：** `specs/tests.json`、`specs/build_report.json`，以及你的项目代码

## 模式

- **full**（默认）：完整工作流 + 全部护栏。适合正式项目。
- **lite**：减少仪式感。跳过多方向发散，简化需求格式。AI 在约束收集后推荐模式。

## 回溯

任何时候你都可以说"回去"，工作流会回溯到更早的阶段。安全限制：总回溯上限 3 次，循环检测防止无限循环。

## /build 阶段的异常处理

| 级别 | 发生了什么 | AI 行为 |
|------|----------|--------|
| L0 | 环境问题（API 不可用、配置错误） | 自动重试，然后请你修基础设施 |
| L1 | 实现细节（不影响契约） | 静默自行解决 |
| L2 | 影响 spec 契约 | 暂停。你选择：接受降级、砍功能、换方式重试、或回溯 |
| L3 | 根本性问题 | 终止。你决定：回溯到 /spec 还是 /discover |

你永远不需要写代码或调试代码。L2 决策是产品级别的（"砍掉这个功能"），不是代码级别的（"修这个函数"）。

## 自定义

编辑 `workflow.json` 可以：
- 更改默认模式（`full` / `lite`）
- 调整重试上限（`max_retries_per_module`、`max_backtrack_count`）
- 开关增强护栏（`tracer_bullet`、`mutation_testing`、`multi_sample_6cs`）
- 修改 Step 0 的约束维度

核心护栏（Supervisor、Critic、反向验证、自动验收）不可关闭——它们定义了正确性。

## 制品参考

所有制品是 `specs/` 目录下的 JSON 文件：

| 文件 | 写入者 | 用途 |
|------|-------|------|
| `discover.json` | /discover | 锁定的需求、技术方向、不变量、核心场景 |
| `discover_history.json` | /discover | 探索决策和回溯日志 |
| `spec.json` | /spec | 模块定义、接口、数据模型、依赖图 |
| `spec_review.json` | /spec | Critic + Supervisor 验证结果 |
| `tests.json` | /build | 测试用例（基于示例 + 基于属性） |
| `build_report.json` | /build | 执行结果、契约修订、诊断报告 |

每个下游阶段自动读取上游制品，无需手动传递文件。
