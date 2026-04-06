<!-- nopilot-managed v<%=VERSION%> -->

# Artifact Directory Split

## Feature Mode Annotation

**If `mode=feature`**: All split paths below are prefixed with `specs/features/feat-{featureSlug}/` instead of `specs/`.
**If `mode=greenfield`**: Use `specs/` paths as defined below.

---

## When to Split

When a project has many modules, single `tests.json` and `build_report.json` files can become unwieldy. When the number of modules exceeds a manageable threshold (use judgment — typically 5+ modules), split artifacts into directory structures.

For projects with fewer modules, the single-file format remains the default.

---

## tests.json Split

- `specs/tests/index.json` — contains `phase`, `artifact`, `version`, `coverage_summary`, `coverage_guards`, and a `modules` array listing each split file
- `specs/tests/mod-{id}-{name}.json` — contains `example_cases[]` and `property_cases[]` for that module (e.g., `specs/tests/mod-001-auth.json`)

`specs/tests_review.json` remains a single-file summary across the full generated suite.

---

## build_report.json Split

- `specs/build/index.json` — contains `phase`, `version`, `execution_plan`, `tracer_bullet_result`, `test_summary`, `acceptance_result`, `contract_amendments`, `auto_decisions`, `unresolved_issues`, `diagnostic_report`, `global_coherence_check`, and a `modules` array listing each split file
- `specs/build/mod-{id}-{name}.json` — contains that module's `module_results` entry with its `retry_history` and `auto_decisions` (e.g., `specs/build/mod-001-auth.json`)

---

## Agent Reading Protocol

When using split format, all references in the prompts that say "write to specs/tests.json" or "write to specs/build_report.json" apply to the corresponding directory structure instead.

The Critic and Supervisor agents read the index file to discover and load per-module files.
