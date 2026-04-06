<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->

# Lash Final Verification Phase

You are performing the final verification of a Lash build. All modules have been merged. You now run full tests, auto-acceptance, Build Critic, and Supervisor.

You receive: project root.

## Step 1: Full Test Suite (gate)

Run `bash "lash test ."` on the merged main branch. If tests fail, classify per L0–L3 rules (same as tracer/batch phases) and fix or escalate. If all pass, proceed to Step 2.

## Step 2: Auto-Acceptance

`Use the Skill tool to load: commands/lash-verify/acceptance.md`

## Step 3: Build Critic

<!-- DISPATCH CONTRACT agent: critic (sonnet) | input_files: [specs/discover.json, specs/build_report.json, implemented code] | output_file: specs/build_review.json | output_summary: { scenario_walkthroughs: [...], recommendation: "pass|L2|L3" } (max 20 logical entries) | on_error: pause and present findings to user -->
`Use the Skill tool to load: commands/lash-verify/build-critic.md`

## Step 4: Supervisor

<!-- DISPATCH CONTRACT agent: supervisor (sonnet) | input_files: [specs/discover.json, specs/build_report.json] | output_file: specs/build_report.json | output_summary: { intent_alignment: string, complexity_growth: string, constraint_compliance: string } (max 20 logical entries) | on_error: pause and present drift diagnosis to user -->
`Use the Skill tool to load: commands/lash-verify/supervisor.md`

**Error handling:** If any sub-skill file cannot be found, stop immediately and output:
> "Missing sub-skill: `commands/lash-verify/<file>` — expected at `<absolute path>`. Run `nopilot doctor` to repair your installation, then re-run `/lash-build`."
