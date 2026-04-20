<!-- nopilot-managed v<%=VERSION%> -->

# build/recovery — 纠偏恢复协议

## Feature Mode Annotation

**If `mode=feature`**: 以 `workflow.json` 的 build 状态机、`specs/features/feat-{featureSlug}/` 产物及可用的 build state 为权威来源。
**If `mode=greenfield`**: 以 `workflow.json` 的 build 状态机、`specs/` 产物及可用的 build state 为权威来源。

---

当用户指出 build 流程偏差、遗漏评审或阶段判断错误时，MUST 执行以下纠偏恢复协议：

1. 重新读取当前阶段的 `commands/build/SKILL.md`，以及当前步骤需要的子技能，不得凭记忆补做。
2. 以 `workflow.json` 中 `stages.build.states` 为权威流程，逐项核对 `planning`、`testing`、`test_reviewing`、`tracer_bullet`、`implementing`、`env_waiting`、`awaiting_user`、`amending`、`replanning`、`diagnosing`、`verifying`、`accepting` 的当前位置。
3. 如果存在 `specs/build-state.json`，MUST 重新运行 `lash state resume`（或读取等价 resume 输出）以锚定 `phase`、`pending_action`、`session_recovery`，并与当前阶段要求交叉核对。
4. 输出 **已完成 / 待执行 / 下一步** 摘要后再继续；若发现 test review、acceptance、supervisor 或回退判断缺失，先补齐该权威步骤。
5. Do NOT 凭记忆继续；若状态仍不明确，先报告锚点与缺失信息。
