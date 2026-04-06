<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=CRITIC_PATH%> = platform path to critic skill, <%=SUPERVISOR_PATH%> = platform path to supervisor skill -->

# Critic — /spec Review Process

### Feature Mode: Impact Audit active when mode=feature and L1 profile available

---

## Input

- `specs/discover.json` or `specs/discover/index.json`
- `specs/spec.json` or `specs/spec/index.json`

---

## What to Check

### Backward Verification

For EACH acceptance criterion in the discover artifact:
1. Find the module(s) in the spec artifact that should implement it
2. Trace through the module's interfaces and data models
3. Answer: "If implemented exactly per this spec, would this criterion be satisfied?"
4. If NO: record as uncovered criterion with severity `block`

### Invariant Verification

For EACH invariant in the discover artifact:
1. Check that no module design violates it
2. Check that the invariant is referenced in at least one module's `invariant_refs`

### Undeclared Core Behavior Check

Scan the spec artifact for any user-facing behavior (not technical behavior like pagination/error codes) that cannot be traced back to a requirement in the discover artifact.

---

## Output

Write to `specs/spec_review.json`:

```json
{
  "phase": "spec_review",
  "session": "independent",
  "review_complexity": "<simple|medium|complex>",
  "self_fix_cap": "<number>",
  "backward_verification": {
    "passed": true,
    "uncovered_criteria": [
      {
        "criteria_id": "REQ-xxx-AC-n",
        "finding": "<why the spec cannot satisfy this criterion>",
        "severity": "block",
        "confidence": "<high|medium|low>",
        "ai_bias_flags": []
      }
    ],
    "invariant_violations": [
      {
        "invariant_id": "INV-xxx",
        "module_id": "MOD-xxx",
        "finding": "<how the module violates the invariant>",
        "severity": "block",
        "confidence": "<high|medium|low>",
        "ai_bias_flags": []
      }
    ]
  },
  "undeclared_core_behaviors": [
    {
      "module_id": "MOD-xxx",
      "behavior": "<description of undeclared behavior>",
      "severity": "<block|warn>",
      "confidence": "<high|medium|low>",
      "ai_bias_flags": []
    }
  ],
  "technical_behaviors_logged": [],
  "high_impact_decisions": [],
  "ai_bias_detection": {
    "patterns_found": [
      {
        "bias_type": "<over_engineering|optimistic_assessment|missing_negative_paths|concept_conflation|self_approval_bias|anchoring|symmetric_completion>",
        "target_id": "<MOD-xxx or general>",
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
  "global_coherence_check": {}
}
```

Note: `global_coherence_check` is filled by the Supervisor agent, not by you. Leave it as empty object.

---

## Feature Mode: Impact Audit

When the spec artifact's discover source is a feature-scoped artifact (i.e., at `specs/features/feat-xxx/discover.json`) AND the project profile L1 is available at `.nopilot/profile/l1-arch.json`:

Perform an additional **Impact Audit** after the standard backward verification:

1. **Touched Modules**: Identify existing modules (from L1 `modules[]`) that the new spec modules call, extend, or depend on.
2. **Changed Interfaces**: For each touched module, identify any existing interfaces that are modified or extended by the new spec. Flag interface signature changes as `warn`; breaking changes (removed fields, changed types) as `block`.
3. **Dependency Direction Changes**: Check whether any new `dependency_graph` edges in the spec introduce direction reversals (A→B where B→A already exists in L1) or new cross-layer dependencies.
4. **Breaking Changes**: Any change that would require callers of an existing interface to be updated is a breaking change.

Record the impact audit result in `specs/features/feat-xxx/spec_review.json` under the `impact_audit` field:

```json
{
  "impact_audit": {
    "touchedModules": ["<existing module name>"],
    "changedInterfaces": ["<interface name: change description>"],
    "dependencyDirectionChanges": ["<from→to: description>"],
    "breakingChanges": [
      { "description": "<what breaks>", "severity": "block | warn" }
    ],
    "overallSeverity": "block | warn | pass"
  }
}
```

`overallSeverity` is `block` if any breaking change has severity `block`, `warn` if any has severity `warn` with no blocks, and `pass` otherwise.

This step applies only when `mode=feature` and L1 profile is available. In greenfield mode, skip impact audit entirely (INV-001). If L1 is unavailable, record `impact_audit: { skipped: true, reason: "L1 profile not available" }`.

---

## On Issue

1. Attempt to fix the spec artifact to align with the discover artifact.
2. **You may ONLY modify the spec artifact (`specs/spec.json` or files under `specs/spec/`). You must NEVER modify upstream artifacts.**
3. After fix, a fresh Critic instance re-runs verification from the top (no prior-cycle context).
4. If fix succeeds: record what was fixed in `self_fix_log`, mark passed.
5. If still failing after reaching the self-fix cap:
   - Evaluate trend (see Step 5 in framework).
   - If converging: extend by 2 iterations.
   - If diverging or oscillating: stop and report — the calling command (`/spec`) will pause for user.
