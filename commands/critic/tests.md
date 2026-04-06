<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=CRITIC_PATH%> = platform path to critic skill, <%=SUPERVISOR_PATH%> = platform path to supervisor skill -->

# Critic — /build Test Review Process

### Feature Mode: Applies to both greenfield and feature-scoped test artifacts

---

## Input

- `specs/tests.json` or `specs/tests/index.json`
- `specs/spec.json` or `specs/spec/index.json`
- `specs/discover.json` or `specs/discover/index.json`

---

## What to Check

### 1. Coverage Truthfulness

For EACH requirement listed in `coverage_summary.requirements_covered`:
1. Inspect the referenced test cases
2. Confirm the tests verify the requirement's actual acceptance criteria, not just a loosely related behavior
3. Record any requirement marked as covered without real verification as a `block`

### 2. Boundary Condition Sufficiency

For EACH requirement:
1. Check whether the generated tests include only happy paths
2. Look for missing boundary, error, and regression cases where the requirement implies them
3. Record meaningful missing coverage as `block` or `warn` based on downstream impact

### 3. Test Executability

Review each generated test case and property case for internal consistency:
- Are `input`, `setup`, and `expected_output` realistic and executable together?
- Do referenced modules, invariants, and requirements exist?
- Would the test fail for the right reason if the implementation were wrong?

### 4. Requirement Mapping Accuracy

Check that each `ears_ref`, `requirement_refs`, and `invariant_ref` points to the intended upstream artifact element.

### 5. Property Test Quality

Review each property test for tautologies or weak properties that would pass even if the invariant were violated.

---

## Output

Write to `specs/tests_review.json`:

```json
{
  "phase": "tests_review",
  "session": "independent",
  "review_complexity": "<simple|medium|complex>",
  "self_fix_cap": "<number>",
  "coverage_truthfulness": {
    "passed": true,
    "false_coverage_claims": [
      {
        "requirement_id": "REQ-xxx",
        "finding": "<why the claimed coverage is not real>",
        "severity": "<block|warn>",
        "confidence": "<high|medium|low>",
        "ai_bias_flags": []
      }
    ]
  },
  "boundary_condition_sufficiency": {
    "passed": true,
    "missing_cases": [
      {
        "target_id": "<REQ-xxx or TEST-xxx>",
        "finding": "<missing boundary/error/regression coverage>",
        "severity": "<block|warn>",
        "confidence": "<high|medium|low>",
        "ai_bias_flags": []
      }
    ]
  },
  "executability_verification": {
    "passed": true,
    "issues": [
      {
        "test_id": "<TEST-xxx or PROP-xxx>",
        "finding": "<what makes the test inconsistent or non-executable>",
        "severity": "<block|warn>",
        "confidence": "<high|medium|low>",
        "ai_bias_flags": []
      }
    ]
  },
  "requirement_mapping_verification": {
    "passed": true,
    "issues": [
      {
        "test_id": "<TEST-xxx or PROP-xxx>",
        "finding": "<incorrect requirement or invariant mapping>",
        "severity": "<block|warn>",
        "confidence": "<high|medium|low>",
        "ai_bias_flags": []
      }
    ]
  },
  "property_test_verification": {
    "passed": true,
    "issues": [
      {
        "property_id": "PROP-xxx",
        "finding": "<why the property is too weak or tautological>",
        "severity": "<block|warn>",
        "confidence": "<high|medium|low>",
        "ai_bias_flags": []
      }
    ]
  },
  "ai_bias_detection": {
    "patterns_found": [
      {
        "bias_type": "<over_engineering|optimistic_assessment|missing_negative_paths|concept_conflation|self_approval_bias|anchoring|symmetric_completion>",
        "target_id": "<TEST-xxx or PROP-xxx or general>",
        "evidence": "<specific observation>",
        "confidence": "<high|medium|low>"
      }
    ]
  },
  "self_fix_log": [
    {
      "iteration": 1,
      "fixes_applied": ["<what was fixed>"],
      "reverify_result": "<passed|still_failing>",
      "remaining_blocks": 0,
      "remaining_warns": 0
    }
  ],
  "trend_evaluation": {
    "assessed": false,
    "trend": "<converging|diverging|oscillating|null>",
    "action": "<extended|stop_stronger_model|stop_human_decision|null>",
    "detail": "<explanation or null>"
  },
  "recommendation": "<pass|fail>",
  "detail": "<explanation if recommendation is not pass>"
}
```

---

## On Issue

1. Attempt to fix the tests artifact to align with the discover and spec artifacts.
2. **You may ONLY modify the tests artifact (`specs/tests.json` or files under `specs/tests/`). You must NEVER modify upstream artifacts.**
3. After fix, a fresh Critic instance re-runs verification from the top (no prior-cycle context).
4. If fix succeeds: record what was fixed in `self_fix_log`, mark passed, and set `recommendation: "pass"`.
5. If still failing after reaching the self-fix cap:
   - Evaluate trend (see Step 5 in framework).
   - If converging: extend by 2 iterations.
   - If diverging or oscillating: stop and report with `recommendation: "fail"`.
