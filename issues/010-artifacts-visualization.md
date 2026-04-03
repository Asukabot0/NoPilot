# 010 - 各阶段产物应提供可视化展示，而非让用户读 JSON

## 来源

所有阶段产物：`discover.json`、`discover_history.json`、`spec.json`、`spec_review.json`、`tests.json`、`build_report.json`

## 问题描述

当前所有阶段的产物都是 JSON 文件，用户需要直接阅读原始 JSON 来理解产出内容。JSON 是机器可读的契约格式，但对人类极不友好：

- 嵌套层级深，难以快速把握全貌
- 缺少视觉层次，重要信息和细节混在一起
- 产物越复杂（如 spec.json 包含模块、接口、数据模型、依赖图），阅读体验越差
- 人类很难通过读 JSON 发现遗漏或问题

## 期望行为

每个阶段产物生成后，同时生成一份可视化展示（如本地 HTML 页面），用户通过浏览器查看。JSON 继续作为机器可读的下游契约，可视化面向人类审阅。

### 各产物的可视化建议

| 产物 | 可视化形式 |
|------|-----------|
| `discover.json` | 需求卡片、核心场景流程图、功能优先级矩阵 |
| `discover_history.json` | 决策时间线、方向对比表 |
| `spec.json` | 模块架构图、依赖关系图、接口文档、数据模型 ER 图 |
| `spec_review.json` | 检查项通过/失败仪表盘 |
| `tests.json` | 测试覆盖矩阵（需求 → 测试用例映射） |
| `build_report.json` | 构建进度、TDD 结果、auto-acceptance 状态 |

## 关联

- 与 issue 002（Layer 1 输出过长）同源，002 是这个问题在 discover 方向选择环节的具体表现
