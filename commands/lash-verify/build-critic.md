<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->
<!-- DISPATCH CONTRACT: Invoked as an independent subagent by the verify orchestrator. -->
<!-- Input: project root, specs/discover.json, specs/build_report.json -->
<!-- Output: specs/build_review.json -->
<!-- output_summary: { scenario_walkthroughs: [...], acceptance_alignment: { aligned: bool, mismatches: [] }, recommendation: "pass|L2|L3" } (max 20 logical entries) -->
<!-- eta: ~5 min -->

# Lash Verify — Build Critic (Step 3)

Perform an INDEPENDENT review. Pretend you have not seen the acceptance results above. Read the code fresh.

For each core scenario in `specs/discover.json`:
1. Read the scenario steps
2. Trace through the ACTUAL CODE (not test results)
3. Record your independent pass/fail

Then compare your results with the `acceptance_result` from `specs/build_report.json`:
- If they agree: alignment confirmed
- If they DISAGREE: flag the divergence — this means the auto-acceptance has bias

Write `specs/build_review.json`:
```json
{
  "phase": "build_review",
  "session": "independent",
  "scenario_walkthroughs": [
    {"scenario_id": "SCENARIO-001", "critic_result": "pass|fail", "ai_acceptance_result": "pass|fail", "aligned": true, "divergence_detail": null}
  ],
  "acceptance_alignment": {"aligned": true, "mismatches": []},
  "recommendation": "pass|L2|L3",
  "detail": null
}
```

If recommendation is `pass`: return to `SKILL.md` and proceed to Step 4 (supervisor).
If `L2`: pause, present product-level options to user.
If `L3`: halt, present backtrack options.
