<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->

# Lash Tracer — Module Merge (Steps 8–9)

Merges the worktree and updates build state after a module passes tests and critic review.

## Step 8: Merge

```
bash "lash worktree merge <module_id> --project-root <root>"
```

If merge succeeds: proceed to Step 9.
If merge conflict: update state as `merge_conflict` and report to calling agent.

## Step 9: Update State

After each significant event, update state:
```
bash "lash state update <event> --data '<json>'"
```

Events: worker_spawned, worker_completed, worker_failed, test_passed, test_failed, module_critic_passed, module_critic_failed, merge_completed, merge_conflict.

Return to `SKILL.md` loop to process the next tracer module, or report final result if all modules are done.
