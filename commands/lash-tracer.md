# Lash Tracer Bullet Phase

You are executing the tracer bullet phase of a Lash build. Implement the thinnest E2E slice to validate core architectural assumptions before parallel work begins.

You receive: tracer module list, platform assignment, project root.

## For Each Tracer Module

### 1. Create Worktree

```
bash "lash worktree create <module_id> --project-root <root>"
```

Read the JSON output to get `worktree_path`.

### 2. Generate Task Package

```
bash "lash package <module_id> <worktree_path> <platform> --spec specs/spec.json --discover specs/discover.json --tests specs/tests.json --completed <comma_separated_completed>"
```

### 3. Spawn Worker

```
bash "lash spawn <platform> <module_id> <worktree_path> --task 'Read .lash/task.md and implement the module using TDD. Write tests first, confirm they fail, then implement until all pass. Only modify files listed in .lash/owned_files.txt.' --instruction-file <worktree_path>/.lash/worker-instructions.md"
```

Record the `pid` and `session_id` from the JSON output.

### 4. Wait for Completion

Poll until the worker finishes. Pass `--started-at` from the spawn output to enable timeout detection:
```
bash "lash check <module_id> <worktree_path> --pid <pid> --platform <platform> --started-at <started_at>"
```

Status values:
- `running` — wait 30 seconds, poll again
- `completed` — Worker wrote `.lash/done.json` or process exited with changes; proceed to step 5
- `completed_empty` — process exited cleanly but no changes detected
- `failed` — Worker signaled failure via `.lash/done.json` or non-zero exit
- `timeout` — Worker exceeded timeout (default 300s); cancel with `lash cancel --pid <pid>`, then retry or escalate

### 5. Run External Tests

```
bash "lash test <worktree_path>"
```

### 6. Handle Test Results

If tests **passed**: proceed to step 7 (Module Critic).

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

### 7. Module Critic

After tests pass, perform a code review. Read the Worker's implementation in the worktree:

1. Read the module source files (those in `owned_files`)
2. Read `.lash/module-spec.json` and `.lash/interfaces.json`
3. Review the code against the spec. Check:
   - Does the implementation satisfy all acceptance criteria?
   - Does it correctly implement the interfaces (method signatures, return types)?
   - Are there critical or high-severity issues (broken functionality, security issues, interface contract violations)?
4. Produce your assessment:
   - `passed: true` if no critical/high issues
   - `passed: false` with issue list if critical/high issues found

If **passed**: proceed to merge.

If **not passed**: send issues to Worker:
```
bash "lash resume <platform> <session_id> <worktree_path> --feedback 'Module Critic found issues: <issue_list>. Please fix.'"
```
After fix, re-run tests (step 5) then re-review. Max 2 Critic rounds. If still failing, pause for user.

### 8. Merge

```
bash "lash worktree merge <module_id> --project-root <root>"
```

If merge succeeds: update state and report.
If merge conflict: update state as `merge_conflict` and report to calling agent.

### 9. Update State

After each significant event, update state:
```
bash "lash state update <event> --data '<json>'"
```

Events: worker_spawned, worker_completed, worker_failed, test_passed, test_failed, module_critic_passed, module_critic_failed, merge_completed, merge_conflict.

## Output

Report back to the calling agent: tracer result (success/failure), modules completed, any issues encountered.
