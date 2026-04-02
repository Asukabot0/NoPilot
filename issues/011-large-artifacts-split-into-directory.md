# 011 - 大型产物应拆分为目录结构，而非单个文件

## 来源

所有阶段产物：`discover.json`、`spec.json`、`tests.json`、`build_report.json` 等

## 问题描述

当前所有产物都是单个 JSON 文件。对于复杂项目，文件会非常大，导致：

- agent 读取时消耗大量上下文，而它可能只需要其中一部分
- 多 agent 无法并行写同一个文件
- 人类审阅时难以定位和 review
- 与多 agent 协作模式天然矛盾

## 期望行为

大型产物改为**目录结构 + index 文件**，按合理维度拆分。例如：

### spec 产物

```
specs/spec/
├── index.json          # 全局信息：依赖图、错误策略、模块列表
├── mod-001-auth.json   # 认证模块详细设计
├── mod-002-tasks.json  # 任务模块详细设计
└── mod-003-notify.json # 通知模块详细设计
```

### discover 产物

```
specs/discover/
├── index.json          # 约束、方向、设计哲学、全局信息
├── requirements.json   # 需求列表
├── scenarios.json      # 核心场景
└── history.json        # 探索历史和决策日志
```

### 拆分原则

- 小型产物保持单文件，不强制拆分
- 大型产物按语义维度拆分（如按模块、按职责）
- index 文件记录全局信息和子文件索引
- 下游 agent 可按需加载，不必全量读取
