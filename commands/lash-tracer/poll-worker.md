<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->

# Lash Tracer — Poll Worker Completion

Poll until the worker finishes. Pass `--started-at` from the spawn output to enable timeout detection:

```
bash "lash check <module_id> <worktree_path> --pid <pid> --platform <platform> --started-at <started_at>"
```

Status values:

| Status | Action |
|--------|--------|
| `running` | Wait 30 seconds, poll again |
| `completed` | Worker wrote `.lash/done.json` or exited with changes; proceed to test-handler |
| `completed_empty` | Process exited cleanly but no changes detected |
| `failed` | Worker signaled failure via `.lash/done.json` or non-zero exit |
| `timeout` | Worker exceeded timeout (default 300s); cancel with `lash cancel --pid <pid>`, then retry or escalate |
