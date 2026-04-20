<!-- nopilot-managed v<%=VERSION%> -->

# supervisor/decision-chain — Decision Chain Analysis

If `specs/decisions.json` exists, perform cumulative drift analysis:

1. Read the full decision trail
2. Check whether multiple individually-reasonable decisions have accumulated into a global shift away from the anchor
3. Look for patterns:
   - **Ratchet effect:** Each decision makes the product slightly more complex, and no decision simplifies — resulting in aggregate over-engineering
   - **Direction creep:** Each decision shifts the product slightly toward a different use case, and the sum of shifts is a different product
   - **Constraint relaxation:** Individual decisions each loosen a constraint slightly, and the cumulative effect is a constraint that no longer holds

If cumulative drift is detected, flag it even if each individual decision appears reasonable in isolation. The whole can drift while each part seems fine.

Record findings under `decision_chain_analysis` in the output JSON.

If `specs/decisions.json` does NOT exist, set `decision_chain_analysis.checked: false` and skip this section.
