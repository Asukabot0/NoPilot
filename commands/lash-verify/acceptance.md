<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->

# Lash Verify — Auto-Acceptance (Step 2)

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

Return to `SKILL.md` and proceed to Step 3 (build-critic).
