<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->

# Lash Tracer — Test Handler (Steps 5–6)

Runs external tests and classifies failures into L0–L3 levels.

## Step 5: Run External Tests

```
bash "lash test <worktree_path>"
```

## Step 6: Handle Test Results

If tests **passed**: return to `SKILL.md` and proceed to Step 4 (module-critic).

If tests **failed**:

Get classification hint:
```
bash "lash classify <worktree_path>/test_output.txt --owned-files <owned_files_comma>"
```

Read the `level` from the JSON output. Use this as a hint, but make your own final judgment by analyzing the test output:

- **L0 (environment)**: missing dependency, port conflict, config error. Try to resolve by resuming the Worker:
  ```
  bash "lash resume <platform> <session_id> <worktree_path> --feedback 'Environment error: <details>. Please fix within the worktree.'"
  ```
  Then re-test. Max 3 retries. If unresolvable, escalate to L2.

- **L1 (implementation bug)**: assertion failure, type error in owned files. Send feedback:
  ```
  bash "lash resume <platform> <session_id> <worktree_path> --feedback 'Tests failed: <test_name>: <error>. Fix the implementation.'"
  ```
  Then re-test. Max 3 retries. If exhausted, escalate to L3.

- **L2 (contract impact)**: behavior contradicts spec. STOP. Update state:
  ```
  bash "lash state update build_paused --data '{\"pause_reason\": \"l2\", \"detail\": \"<description>\"}'"
  ```
  Present the user with product-level options: ACCEPT_DEGRADATION, CUT_FEATURE, MODIFY_SPEC, RETRY_DIFFERENT_APPROACH, BACKTRACK_DISCOVER.

- **L3 (fundamental)**: architectural contradiction. STOP. Present BACKTRACK_SPEC or BACKTRACK_DISCOVER.
