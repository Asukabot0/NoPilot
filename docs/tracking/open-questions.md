# NoPilot Open Questions

Issues 以 GitHub Issues 为唯一真相源：https://github.com/Asukabot0/NoPilot/issues

## 研究方向

- Brownfield 支持（V1.5 计划）: 现有代码库的增量工作流，含 feature-scoped 目录隔离
- MCP/Script 强制层（V2 计划）: 为弱指令遵循模型提供程序化约束
- 多模型验证（V2 计划）: Critic/Supervisor 使用不同模型打破同模型偏见
- 阶段纠偏恢复是否需要下沉到显式 `phase_reset` 状态事件，而不仅依赖阶段 SKILL.md + `lash state resume` 的权威回读
