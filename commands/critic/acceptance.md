<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=CRITIC_PATH%> = platform path to critic skill, <%=SUPERVISOR_PATH%> = platform path to supervisor skill -->

# Critic — /build Acceptance Review Process

### Feature Mode: Scenario walkthrough against actual code; no spec.json tracing

---

## Input

- `specs/discover.json` or `specs/discover/index.json`
- The actual implemented code in the project
- `specs/build_report.json` or `specs/build/index.json` only if already available from a prior run; treat it as supplemental context, not as the source of truth

---

## What to Check

### Independent Scenario Walkthrough

For EACH core scenario (`SCENARIO-xxx`) in the discover artifact:
1. Read the scenario's step-by-step user journey
2. Trace the journey through the **actual implemented code** (not spec.json — real code)
3. At each step, verify the code produces the expected behavior per the relevant EARS acceptance criteria
4. Record your independent pass/fail result for this scenario

The purpose of this check is to answer: **"Does 'all tests pass' actually mean 'the product meets user intent'?"** Tests can pass while missing the point.

---

## Output

Write to `specs/build_review.json`:

```json
{
  "phase": "build_review",
  "session": "independent",
  "review_complexity": "<simple|medium|complex>",
  "self_fix_cap": "<number>",
  "scenario_walkthroughs": [
    {
      "scenario_id": "SCENARIO-xxx",
      "critic_result": "<pass|fail>",
      "evidence": "<what the code did and why that passed or failed>",
      "confidence": "<high|medium|low>",
      "ai_bias_flags": []
    }
  ],
  "acceptance_summary": {
    "status": "<all_passed|partial|failed>",
    "passed_scenarios": ["SCENARIO-xxx"],
    "failed_scenarios": [
      {
        "scenario_id": "SCENARIO-xxx",
        "expected_behavior": "<what should happen per acceptance criteria>",
        "actual_behavior": "<what the code actually does>",
        "severity": "block",
        "confidence": "<high|medium|low>",
        "ai_bias_flags": []
      }
    ]
  },
  "ai_bias_detection": {
    "patterns_found": [
      {
        "bias_type": "<over_engineering|optimistic_assessment|missing_negative_paths|concept_conflation|self_approval_bias|anchoring|symmetric_completion>",
        "target_id": "<SCENARIO-xxx or general>",
        "evidence": "<specific observation>",
        "confidence": "<high|medium|low>"
      }
    ]
  },
  "self_fix_log": [],
  "trend_evaluation": {
    "assessed": false,
    "trend": null,
    "action": null,
    "detail": null
  },
  "recommendation": "<pass|L2|L3>",
  "detail": "<explanation if recommendation is not pass>"
}
```

---

## On Issue

Critic does NOT self-fix code. Instead:

1. **If mismatches are minor** (behavior partially correct, edge case missed): set `recommendation: "L2"` — the calling command (`/build`) routes to L2 product-level decision.
2. **If mismatches are fundamental** (core scenario fails, primary user journey broken): set `recommendation: "L3"` — the calling command routes to L3 diagnostic + backtrack.
3. Include enough detail in `scenario_walkthroughs` and `acceptance_summary.failed_scenarios` for the user or calling command to understand exactly where implementation diverged from intended behavior.
