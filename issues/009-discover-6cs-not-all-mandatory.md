# 009 - discover 阶段 6Cs 不应全部强制通过

## 来源

`.claude/commands/discover.md` Layer 3 — 6Cs Assessment（第152-162行）

## 问题描述

当前 discover 阶段要求所有 6 个维度全部通过才能 APPROVE，但 discover 的核心目的是"探索和锁定方向"，不是精细打磨需求措辞。全部强制通过会导致：

- 花过多时间在措辞打磨上，偏离探索的核心目的
- 部分维度（如 Conciseness）在 discover 阶段投入产出比很低
- 增加不必要的迭代循环次数

## 期望行为

discover 阶段的 6Cs 分为强制项和建议项：

### 强制通过（影响下游质量）

| 维度 | 原因 |
|------|------|
| **Completeness** | 需求是否覆盖所有必要条件，直接影响 spec 输入质量 |
| **Consistency** | 需求之间是否矛盾，矛盾的需求交给 spec 会导致设计冲突 |
| **Correctness** | 需求是否准确反映用户意图，方向错了后续全白做 |

### 建议项（不阻塞流程）

| 维度 | 原因 |
|------|------|
| **Conciseness** | 措辞精简是打磨功夫，不影响下游理解 |
| **Clarity** | 部分模糊性在 spec 展开设计时会自然消解 |
| **Concreteness** | discover 本身是较高层抽象，过早要求具体化可能限制设计空间 |

建议项如果不通过，记录为 warning 供参考，但不阻塞 APPROVE。
