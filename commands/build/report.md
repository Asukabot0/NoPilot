<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=SUPERVISOR_PATH%> = platform path to supervisor skill -->

# Step 7: Report Generation + Supervisor Check

## Feature Mode Annotation

**If `mode=feature`**: Write all build artifacts to `specs/features/feat-{featureSlug}/`:
- `specs/features/feat-{featureSlug}/build_report.json` (or split: `specs/features/feat-{featureSlug}/build/index.json`)
- `specs/features/feat-{featureSlug}/build_review.json`
- `specs/features/feat-{featureSlug}/tests.json` (or split: `specs/features/feat-{featureSlug}/tests/index.json`)
- `specs/features/feat-{featureSlug}/tests_review.json`

**If `mode=greenfield`**: Write artifacts to `specs/` as defined below.

---

## Build Report Schema

Generate `specs/build_report.json` (or split — see `commands/build/artifact-split.md`) with the following structure:

```json
{
  "phase": "build",
  "version": "4.0",
  "execution_plan": {
    "module_order": [],
    "tracer_bullet_path": "",
    "rationale": ""
  },
  "tracer_bullet_result": {
    "status": "passed | failed | skipped",
    "detail": ""
  },
  "module_results": [
    {
      "module_ref": "MOD-xxx",
      "status": "completed | cut | degraded",
      "retry_history": [],
      "auto_decisions": []
    }
  ],
  "test_summary": {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "skipped": 0
  },
  "acceptance_result": {
    "scenarios_verified": [],
    "status": "all_passed | partial | failed",
    "source": "critic_agent"
  },
  "contract_amendments": [
    {
      "type": "degradation | cut_feature",
      "detail": "",
      "impact": "",
      "user_decision": ""
    }
  ],
  "auto_decisions": [
    {
      "decision": "",
      "alternatives": [],
      "rationale": "",
      "impact": "",
      "impact_level": "low | medium | high"
    }
  ],
  "unresolved_issues": [],
  "diagnostic_report": null,
  "global_coherence_check": {}
}
```

---

## DISPATCH CONTRACT — Supervisor Validation

**Spawning agent:** build agent  
**Target:** `<%=SUPERVISOR_PATH%>` (supervisor.md)  
**Tool:** Agent tool  
**Trigger:** After writing the build report artifact.

**Supervisor receives:**
- **Anchor** (from discover artifact): `constraints` + `selected_direction` + `tech_direction` + `design_philosophy`
- **Decision trail:** `specs/decisions.json` (for cumulative drift analysis)
- **Current stage output:** the build report artifact (`specs/build_report.json` or `specs/build/index.json`)

**Supervisor checks:** Does the final product match original intent? Is complexity proportional?

**Supervisor uses:** quantitative drift scoring (0-100 scale) to assess alignment (see supervisor.md Drift Detection Framework).

**Supervisor writes:** assessment into the build report artifact's `global_coherence_check` field.

**output_summary:** `{ intent_alignment: "aligned|drifted", complexity_growth: "proportional|over_engineered", constraint_compliance: "all_met|violated", detail: string }` (max 20 logical entries)

**Outcomes:**
- **If drift detected:** Pause, present to user, wait for resolution.
- **If aligned:** Report completion.

---

## Profile Write Step (ALL modes — greenfield AND feature)

After the Supervisor check completes and build is confirmed aligned, trigger MOD-002 `writeProfileFromArtifacts`:

1. Read config (`.nopilot/config.json`) to check `l2_enabled` flag.
2. Call `writeProfileFromArtifacts` with:
   - `artifactsDir`: `specs/features/feat-{featureSlug}/` if `mode=feature`, otherwise `specs/`
   - `mode`: current mode (`"greenfield"` or `"feature"`)
3. Report to user what was written:
   > "Profile updated: [list of profile layers written — e.g., L0 identity, L1 stack, L3 requirements]"
4. If `PROFILE_WRITE_FAILED`: log the error and warn the user, but do not block build completion. The build is still considered complete.

---

## Decision Ledger

Append this stage's `auto_decisions` AND `contract_amendments` to `specs/decisions.json`. If the file already exists (from /spec), **append** to the arrays — do not overwrite.

Each entry gets `"stage": "build"` and a timestamp. Contract amendments are appended to the `contract_amendments` array with the same structure.

---

## Completion Message

Report completion:

> "Build complete. All tests passing. Auto-acceptance verified by independent Critic. Decision trail in specs/decisions.json. Generate visualization by running: open specs/views/build.html (or run /visualize for full dashboard). See the build report artifact entry point (`specs/build_report.json` or `specs/build/index.json`) for details."
