<!-- nopilot-managed v<%=VERSION%> -->

# supervisor/output-schema — JSON Output Schema + Field Mapping + Behavior Rules

## Output Schema

Write your assessment as:

```json
{
  "stage": "<discover|spec|build>",
  "intent_alignment": "<aligned|drifted>",
  "complexity_growth": "<proportional|over_engineered>",
  "constraint_compliance": "<all_met|violated>",
  "drift_score": 0,
  "confidence": "<high|medium|low>",
  "recommended_action": "<proceed|review|halt>",
  "drift_patterns_detected": [
    {
      "pattern": "<scope_creep|gold_plating|tech_driven_drift|requirement_dilution|constraint_erosion>",
      "severity": "<high|medium>",
      "evidence": "<specific evidence from the output>"
    }
  ],
  "design_philosophy_compliance": {
    "checked": false,
    "violations": [
      {
        "philosophy": "<the philosophy statement>",
        "violation": "<how the output violates it>"
      }
    ]
  },
  "decision_chain_analysis": {
    "checked": false,
    "cumulative_drift_detected": false,
    "pattern": "<ratchet_effect|direction_creep|constraint_relaxation|none>",
    "detail": "<explanation if drift detected>"
  },
  "detail": "<explanation if any field is not the ideal value, or empty string if all clear>"
}
```

## Field Mapping

The three original fields map to the enhanced assessment as follows:
- `intent_alignment`: set to `"drifted"` if drift_score > 30 OR any HIGH severity drift pattern is detected; otherwise `"aligned"`
- `complexity_growth`: set to `"over_engineered"` if Gold Plating pattern is detected at any severity; otherwise `"proportional"`
- `constraint_compliance`: set to `"violated"` if Constraint Erosion pattern is detected at any severity; otherwise `"all_met"`

## Behavior Rules

- If ALL three legacy fields are ideal (aligned, proportional, all_met) AND drift_score <= 10 AND recommended_action is `proceed`: return the JSON silently. The calling command will auto-continue.
- If recommended_action is `review`: return the JSON with detailed explanation. The calling command will present your findings to the user for review but may allow continuation.
- If recommended_action is `halt`: return the JSON with detailed explanation. The calling command will pause and require user resolution before proceeding.
- **You do not make decisions — you only diagnose.** You never modify artifacts, approve outputs, or resolve drift. You report what you see.
