<!-- nopilot-managed v<%=VERSION%> -->

# spec/recovery — 纠偏恢复协议

## Feature Mode Annotation

**If `mode=feature`**: 以 `workflow.json` 的 spec 状态机和 `specs/features/feat-{featureSlug}/spec/` 当前产物为权威来源。
**If `mode=greenfield`**: 以 `workflow.json` 的 spec 状态机和 `specs/spec/` 当前产物为权威来源。

---

当用户指出 spec 流程偏差、遗漏 review 或阶段判断错误时，MUST 执行以下纠偏恢复协议：

1. 重新读取当前阶段的 `commands/spec/SKILL.md`，以及当前步骤需要的子技能，不得凭记忆补做。
2. 以 `workflow.json` 中 `stages.spec.states` 为权威流程，逐项核对 `expanding`、`awaiting_user`、`reviewing`、`awaiting_review` 的当前位置。
3. 对照当前 spec 产物、review 结果和 discover 依赖，输出 **已完成 / 待执行 / 下一步** 摘要后再继续。
4. 若发现遗漏了 review、checkpoint 或决策记录，先补齐权威流程要求，再继续后续步骤。
5. Do NOT 凭记忆继续；若状态仍不明确，先报告锚点与缺失信息。
