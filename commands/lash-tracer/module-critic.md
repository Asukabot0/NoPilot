<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->
<!-- DISPATCH CONTRACT: Invoked as an independent subagent by the tracer orchestrator. -->
<!-- Input: worktree_path, module_id, platform, session_id -->
<!-- Output: { passed: boolean, issues: string[] } -->
<!-- output_summary: { passed: bool, issues: string[] } (max 20 logical entries) -->
<!-- eta: ~2 min per module -->

# Lash Tracer — Module Critic (Step 7)

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

If **passed**: return to `SKILL.md` and proceed to Step 5 (module-merge).

If **not passed**: send issues to Worker:
```
bash "lash resume <platform> <session_id> <worktree_path> --feedback 'Module Critic found issues: <issue_list>. Please fix.'"
```
After fix, re-run tests (test-handler) then re-review. Max 2 Critic rounds. If still failing, pause for user.
