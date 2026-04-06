<!-- nopilot-managed v<%=VERSION%> -->

# Step 4: Per-Module TDD Cycle

## Feature Mode Annotation

**If `mode=feature`**: When creating worktrees for parallel module implementation, branch from the current `HEAD` (existing code) instead of empty branches. This ensures Workers receive the full existing codebase as their starting point.

Command pattern: `git worktree add -b feat/{featureSlug}/{module} ../.worktree-{module} HEAD`

Workers must read the profile L1 layer (`.nopilot/profile/l1-arch.json`) to understand which existing modules and directories their work touches. Regression guard test cases must be executed against the inherited existing code.

**If `mode=greenfield`**: Standard TDD cycle from clean state (branch from empty/initial state).

---

## Cycle per Module (MOD-xxx)

For each module in execution plan order:

1. Extract module's tests from the tests artifact → write test code
2. Confirm tests fail (red)
3. Write minimal implementation to pass (green)
4. Refactor if needed
5. Mark module complete, proceed to next

When all modules complete: emit `ALL_MODULES_DONE`

---

## Exception Handling During Implementation

- **L0 (environment):** API down, lib bug, env config → auto-retry → emit `L0_ISSUE` → enters `env_waiting` state. On resolution → emit `ENV_RESOLVED` → return to implementing. Persistent with alternatives → emit `ENV_EXHAUSTED_WITH_ALT` → enters `awaiting_user`. No alternatives → emit `ENV_EXHAUSTED_NO_ALT` → enters `diagnosing`.
- **L1 (no contract impact):** Resolve + record in auto_decisions → emit `L1_RESOLVED`
- **L2 (contract impact):** Pause → emit `L2_ISSUE`. Present options: ACCEPT_DEGRADATION, CUT_FEATURE, MODIFY_SPEC, RETRY_DIFFERENT_APPROACH, BACKTRACK_DISCOVER
- **L3 (fundamental issue):** Enter diagnosing → emit `L3_ISSUE`. Present diagnostic report. User chooses: `BACKTRACK_SPEC` (emit → `$backtrack:spec`) or `BACKTRACK_DISCOVER` (emit → `$backtrack:discover`). **Cost awareness:** Before confirming backtrack, inform user of estimated re-run time for all downstream stages.

---

## Retry Limits

- `max_retries_per_module: 3` (from workflow.json). Exhaustion → L3.
- `RETRY_DIFFERENT_APPROACH`: resets module retry counter, but max 2 per module. Exhaustion → L3.

---

## ACCEPT_DEGRADATION Flow

→ amending state → record `contract_amendment` in the build report artifact → annotate upstream artifacts → emit `AMENDMENT_RECORDED` → return to implementing

---

## CUT_FEATURE Flow

→ replanning state:

1. Remove feature's modules from dependency graph
2. Identify cascade impacts
3. Remove associated tests
4. Recalculate execution order
5. If system fundamentally incomplete → emit `REPLAN_INCOMPLETE` → enters diagnosing
6. Otherwise → emit `REPLAN_READY` → resume implementing
