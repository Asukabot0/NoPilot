<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->
<!-- DISPATCH CONTRACT: Invoked as an independent subagent by the verify orchestrator. -->
<!-- Input: project root, specs/discover.json, specs/build_report.json -->
<!-- Output: global_coherence_check written into specs/build_report.json -->
<!-- output_summary: { intent_alignment: "aligned|drifted", complexity_growth: "proportional|over_engineered", constraint_compliance: "all_met|violated", detail: string } (max 20 logical entries) -->
<!-- eta: ~3 min -->

# Lash Verify — Supervisor (Step 4)

Read `specs/discover.json` and extract:
- `constraints`
- `selected_direction`
- `tech_direction`

These are the ANCHOR — the user's original intent.

Read `specs/build_report.json` — this is the OUTPUT.

Evaluate three dimensions:
1. **Intent alignment**: Does the build output serve the stated direction? Or has it drifted?
2. **Complexity growth**: Is the implementation proportional to requirements? Or over-engineered?
3. **Constraint compliance**: Are all constraints respected (tech stack, platform, exclusions)?

Write your assessment into `specs/build_report.json` in the `global_coherence_check` field:
```json
{
  "global_coherence_check": {
    "intent_alignment": "aligned|drifted",
    "complexity_growth": "proportional|over_engineered",
    "constraint_compliance": "all_met|violated",
    "detail": "explanation if any non-ideal"
  }
}
```

Update build state before returning:

```
bash "lash state update supervisor_spawned --data '{}'"
```

After completing the assessment:

- If ALL three are ideal, persist the successful review and return to `SKILL.md` so the parent orchestrator can mark build completion:
  ```
  bash "lash state update supervisor_passed --data '{}'"
  ```
- If ANY dimension is non-ideal, persist the failed review, then pause and present diagnosis to user. Options: ACCEPT_AS_IS, BACKTRACK_SPEC, BACKTRACK_DISCOVER.
  ```
  bash "lash state update supervisor_failed --data '{\"detail\": \"<description>\"}'"
  bash "lash state update build_paused --data '{\"reason\": \"supervisor\", \"detail\": \"<description>\"}'"
  ```
