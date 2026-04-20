<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=CRITIC_PATH%> = platform path to critic skill -->

# Step 2: Generate tests.json

## Feature Mode Annotation

**If `mode=feature`**: Write tests artifact to `specs/features/feat-{featureSlug}/tests.json` (or split: `specs/features/feat-{featureSlug}/tests/index.json`).
**If `mode=greenfield`**: Write to `specs/tests.json` (or split into directory structure — see `commands/build/artifact-split.md`).

---

## Test Generation

From the spec artifact's interfaces plus the discover artifact's acceptance criteria and invariants, generate:

**example_cases[]:** Input/output test cases
- Each case has: id (TEST-xxx), suite_type, module_ref (MOD-xxx), requirement_refs (REQ-xxx), description, category (normal/boundary/error/regression), ears_ref, derivation (direct_from_ears/ai_supplemented), input, expected_output, setup

**property_cases[]:** Invariant-based property tests
- Each case has: id (PROP-xxx), module_ref (MOD-xxx), invariant_ref (INV-xxx), property description, requirement_refs (REQ-xxx)

**coverage_summary:** Track requirements_covered/uncovered, invariants_covered/uncovered

**coverage_guards:** invariants_uncovered_must_be_empty: true, requirements_uncovered_must_be_empty: true

Write the tests artifact to the path determined by Feature Mode above (or split — see artifact-split.md).

### Complete tests.json Schema

```json
{
  "phase": "build",
  "artifact": "tests",
  "version": "4.0",
  "example_cases": [
    {
      "id": "TEST-001",
      "suite_type": "unit | integration | e2e | contract | state_transition",
      "module_ref": "MOD-xxx",
      "requirement_refs": ["REQ-xxx"],
      "description": "",
      "category": "normal | boundary | error | regression",
      "ears_ref": "REQ-xxx-AC-n",
      "derivation": "direct_from_ears | ai_supplemented",
      "input": "",
      "expected_output": "",
      "setup": ""
    }
  ],
  "property_cases": [
    {
      "id": "PROP-001",
      "module_ref": "MOD-xxx",
      "invariant_ref": "INV-xxx",
      "property": "",
      "requirement_refs": ["REQ-xxx"]
    }
  ],
  "coverage_summary": {
    "requirements_covered": [],
    "requirements_uncovered": [],
    "invariants_covered": [],
    "invariants_uncovered": [],
    "state_transitions_covered": [],
    "illegal_transitions_tested": []
  },
  "coverage_guards": {
    "invariants_uncovered_must_be_empty": true,
    "requirements_uncovered_must_be_empty": true
  }
}
```

---

## Critic Test Review Dispatch

### Lite Mode

When `discover.json.mode == "lite"` (or `discover/index.json.mode == "lite"`): skip the independent test review. Emit `TESTS_GENERATED_AUTO` → proceed to Step 3.

### Full Mode

When `discover.json.mode == "full"` (or `discover/index.json.mode == "full"`): emit `TESTS_GENERATED_REVIEW` and run an independent Critic review. This review is **mandatory** in full mode.

---

### DISPATCH CONTRACT — Independent Critic Test Review

**Spawning agent:** build agent  
**Target:** `<%=CRITIC_PATH%>` (critic.md)  
**Tool:** Agent tool  
**Context passed to Critic:** tests artifact path, spec artifact path, discover artifact path. NO build agent conversation history.

**Critic reads:**
- `specs/tests.json` or `specs/tests/index.json` + module files
- `specs/spec.json` or `specs/spec/index.json` + module files
- `specs/discover.json` or `specs/discover/index.json` + child files as needed

*(Substitute feature paths when `mode=feature`.)*

**Critic checks:**
1. **Coverage truthfulness**: Are `requirements_covered` entries genuinely covered, or do tests only touch the surface?
2. **Boundary condition sufficiency**: Are boundary, error, and edge-case scenarios present for each requirement?
3. **Test executability**: Are `input` / `expected_output` values realistic and internally consistent?
4. **Requirement mapping accuracy**: Do `ears_ref` and `requirement_refs` correctly correspond to the intended criteria?
5. **Property test quality**: Do invariant-based property tests actually define properties that would catch violations?

**Critic writes:** `specs/tests_review.json` (or `specs/features/feat-{featureSlug}/tests_review.json`) with recommendation `pass` or `fail`.

**output_summary:** `{ recommendation: "pass|fail", coverage_issues: [...], boundary_issues: [...], executability_issues: [...] }` (max 20 logical entries)

**Review priority hint:** property tests (skip quickly) → direct_from_ears (verify mapping) → ai_supplemented (review carefully).

**Outcomes:**
- `recommendation: "pass"` → emit `TEST_REVIEW_PASSED` → user receives review summary only → proceed to Step 3.
- `recommendation: "fail"` → emit `TEST_REVIEW_FAILED` → return to test generation with Critic's findings as input → re-review with a **fresh** Critic instance (no carry-over context).

The Critic uses the floating iteration cap (see critic.md Step 4). When the cap is reached, evaluate trend (see critic.md Step 5) to decide whether to extend, stop for stronger model, or escalate to human.
