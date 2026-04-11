# NoPilot Open Questions

Issues 以 GitHub Issues 为唯一真相源：https://github.com/Asukabot0/NoPilot/issues

## 研究方向

- Brownfield 支持（V1.5 计划）: 现有代码库的增量工作流，含 feature-scoped 目录隔离
- MCP/Script 强制层（V2 计划）: 为弱指令遵循模型提供程序化约束
- 多模型验证（V2 计划）: Critic/Supervisor 使用不同模型打破同模型偏见
- 阶段纠偏恢复是否需要下沉到显式 `phase_reset` 状态事件，而不仅依赖阶段 SKILL.md + `lash state resume` 的权威回读
- Workflow Benchmark（新）: 定义平台无关 trace schema，降低 transcript 格式差异对判分的影响
- Workflow Benchmark（新）: 研究 outcome/process/efficiency 三维评分在回归守卫与排行榜场景下的不同权重
- Workflow Benchmark（新）: 研究 case 难度校准与重复运行稳定性统计，避免单次 run 偶然性干扰比较结果
- Workflow Benchmark（新）: 明确 semantic event 的形式化判定规则，避免 extractor 随 prompt 漂移
- Workflow Benchmark（新）: 研究 process fail run 的 efficiency 展示与是否完全排除出总分
- Workflow Benchmark（新）: 评估 contract case 与 prompt behavior case 是否需要拆榜，避免短期 prompt 行为污染长期合同回归指标
