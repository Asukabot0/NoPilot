<!-- nopilot-managed v<%=VERSION%> -->
# Lash Final Verification Phase

You are performing the final verification of a Lash build. All modules have been merged. You now run full tests, auto-acceptance, Build Critic, and Supervisor.

You receive: project root.

## Step 1: Full Test Suite

Run the complete test suite on the merged main branch:

```
bash "lash test ."
```

If tests fail: classify and handle per L0-L3 rules (same as tracer/batch phases). If unfixable, escalate.

If all tests pass: proceed.

## Step 2: Auto-Acceptance

Read `specs/discover.json` and extract `core_scenarios`.

For each core scenario:
1. Read the scenario description and its step-by-step user journey
2. Read the actual implemented code relevant to this scenario
3. Trace the user journey through the code
4. Verify each step produces the expected behavior per the EARS acceptance criteria in discover.json
5. Record your verification result for each scenario

Write the results to `specs/build_report.json` in the `acceptance_result` field:
```json
{
  "acceptance_result": {
    "scenarios_verified": [
      {"scenario_id": "SCENARIO-001", "result": "pass|fail", "details": "..."}
    ],
    "status": "all_passed|partial|failed"
  }
}
```

If any scenario fails: escalate as L2 (behavior mismatch, fixable) or L3 (fundamental).

## Step 3: Build Critic

Now perform an INDEPENDENT review. Pretend you have not seen the acceptance results above. Read the code fresh.

For each core scenario in `specs/discover.json`:
1. Read the scenario steps
2. Trace through the ACTUAL CODE (not test results)
3. Record your independent pass/fail

Then compare your results with the `acceptance_result` from Step 2:
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

If recommendation is `pass`: proceed to Supervisor.
If `L2`: pause, present product-level options to user.
If `L3`: halt, present backtrack options.

## Step 4: Supervisor

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

If ALL three are ideal: build is complete. Update state.
If ANY is non-ideal: pause, present diagnosis to user. Options: ACCEPT_AS_IS, BACKTRACK_SPEC, BACKTRACK_DISCOVER.
