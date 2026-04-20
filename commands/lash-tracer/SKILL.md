---
name: lash-tracer
description: Lash tracer bullet phase — validates module integration through end-to-end trace paths
---
<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->

# Lash Tracer Bullet Phase

You are executing the tracer bullet phase of a Lash build. Implement the thinnest E2E slice to validate core architectural assumptions before parallel work begins.

You receive: tracer module list, platform assignment, project root.

## Loop: For Each Tracer Module

For each module in the tracer list, run these steps in order:

1. **Module setup (Steps 1–3):** `Use the Skill tool to load: commands/lash-tracer/module-setup.md`

2. **Wait for worker (Step 4):** `Use the Skill tool to load: commands/lash-tracer/poll-worker.md`

3. **Tests and failure classification (Steps 5–6):** `Use the Skill tool to load: commands/lash-tracer/test-handler.md`

4. **Code review (Step 7):**
   <!-- DISPATCH CONTRACT
     agent: critic (sonnet)
     input_files: [worktree_path/owned_files, .lash/module-spec.json, .lash/interfaces.json]
     output_file: specs/tracer-critic-result.json
     output_summary: { passed: bool, issues: string[] } (max 20 logical entries)
     on_error: send issues to Worker via lash resume; max 2 rounds; pause for user if still failing
   -->
   `Use the Skill tool to load: commands/lash-tracer/module-critic.md`
   <!-- eta: ~2 min per module -->

5. **Merge and update state (Steps 8–9):** `Use the Skill tool to load: commands/lash-tracer/module-merge.md`

## Output

Report back to the calling agent: tracer result (success/failure), modules completed, any issues encountered.

**Error handling:** If any sub-skill file cannot be found, stop immediately and output:
> "Missing sub-skill: `commands/lash-tracer/<file>` — expected at `<absolute path>`. Run `nopilot doctor` to repair your installation, then re-run `/lash-build`."
