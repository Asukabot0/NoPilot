<!-- nopilot-managed v<%=VERSION%> -->

# visualize/build-page — specs/views/build.html Generation Rules

Read `specs/build_report.json` (or `specs/build/index.json` + per-module files) and optionally `specs/tests.json` (or `specs/tests/index.json`) + `specs/tests_review.json` + `specs/build_review.json`.

Generate `specs/views/build.html` with the following 6 sections:

## Section 1: Build Progress Dashboard

- Header stats: total modules, completed, cut, degraded
- Per-module status row: module ref, status badge (completed=green, cut=gray, degraded=amber)
- Execution plan summary: module order, tracer bullet path, rationale
- Tracer bullet result with status badge

## Section 2: TDD Results Summary

- Large stat cards: total tests, passed (green), failed (red), skipped (gray)
- Pass rate as a progress bar
- From `test_summary` in the build report artifact

## Section 3: Test Coverage Matrix (conditional)

- Only render if `specs/tests.json` (or `specs/tests/index.json`) exists
- Table mapping requirements to test cases
- Rows: each requirement ID from `coverage_summary.requirements_covered` + `requirements_uncovered`
- Columns: test IDs that reference this requirement
- Color: covered (green cell), uncovered (red cell)
- Show invariant coverage similarly

## Section 4: Auto-Acceptance Status

- Show `acceptance_result` section
- Per-scenario status: verified scenarios with pass/fail badges
- Overall status badge: all_passed (green), partial (amber), failed (red)
- Source indicator showing evaluation was by critic_agent

## Section 5: Contract Amendments (conditional)

- Only render if `contract_amendments[]` is non-empty
- Card per amendment showing type, detail, impact, user decision

## Section 6: Review Status (conditional)

- Render `specs/tests_review.json` when present as a test-quality review panel
- Render `specs/build_review.json` when present as an acceptance review panel
- For test review, show pass/fail status for coverage truthfulness, boundary condition sufficiency, executability, requirement mapping, and property test quality
- For acceptance review, show per-scenario walkthrough results, the `acceptance_summary.status`, and highlight failed scenarios prominently
