<!-- nopilot-managed v<%=VERSION%> -->

# discover/recovery — 纠偏恢复协议

## Feature Mode Annotation

**If `mode=feature`**: 仍以 `workflow.json` 的 discover 状态机为权威，并结合 `specs/features/feat-{featureSlug}/discover/` 当前产物核对已完成步骤。
**If `mode=greenfield`**: 以 `workflow.json` 的 discover 状态机和 `specs/discover/` 当前产物核对已完成步骤。

---

当用户指出 discover 流程偏差、遗漏步骤或阶段判断错误时，MUST 执行以下纠偏恢复协议：

1. 重新读取当前阶段的 `commands/discover/SKILL.md`，不得凭记忆补做。
2. 以 `workflow.json` 中 `stages.discover.states` 为权威流程，逐项核对当前处于 `idea_collection`、`idea_structuring`、`constraint_collection`、`direction`、`mvp`、`design_philosophy`、`lock` 的哪一步。
3. 结合当前 discover 产物与历史记录，明确列出 **已完成 / 待执行 / 下一步**，再继续流程。
4. 若发现缺失检查点、critic/supervisor 结果或制品未写入，先补齐该权威步骤，再进入后续步骤。
5. Do NOT 凭记忆继续；若状态仍不明确，先向用户报告当前锚点与缺失信息。
