<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->

# Lash Tracer — Module Setup (Steps 1–3)

Handles worktree creation, task package generation, and worker spawn for a single tracer module.

## Step 1: Create Worktree

```
bash "lash worktree create <module_id> --project-root <root>"
```

Read the JSON output to get `worktree_path`.

## Step 2: Generate Task Package

```
bash "lash package <module_id> <worktree_path> <platform> --spec specs/spec.json --discover specs/discover.json --tests specs/tests.json --completed <comma_separated_completed>"
```

## Step 3: Spawn Worker

```
bash "lash spawn <platform> <module_id> <worktree_path> --task 'Read .lash/task.md and implement the module using TDD. Write tests first, confirm they fail, then implement until all pass. Only modify files listed in .lash/owned_files.txt.' --instruction-file <worktree_path>/.lash/worker-instructions.md"
```

Record the `pid` and `session_id` from the JSON output.

Return to `SKILL.md` Step 4 (Wait for Completion) with `pid`, `session_id`, and `worktree_path`.
