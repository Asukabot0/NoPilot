<!-- nopilot-managed v<%=VERSION%> -->
<!-- DISPATCH CONTRACT target: dispatched by SKILL.md; output <= 500 chars, max 20 items -->

# discover/artifact-writer — Artifact Generation (dispatch target)

You are a subagent. Your job: read the current discover artifact state and finalize all JSON files. Do NOT interact with the user directly. Return a brief confirmation summary to the main agent.

### Feature Mode: Artifact Output Path

**If `mode=feature`**: Write all artifacts to `specs/features/feat-{featureSlug}/` instead of `specs/`. Specifically:
- `specs/features/feat-{featureSlug}/discover.json` (or split: `specs/features/feat-{featureSlug}/discover/index.json`)
- `specs/features/feat-{featureSlug}/discover_history.json`
- `specs/features/feat-{featureSlug}/discover_review.json`
- Mockups (if UI Taste ran): `specs/features/feat-{featureSlug}/mockups/`

In the discover artifact, add a `profile_ref` field pointing to the project profile:
```json
{ "profile_ref": ".nopilot/profile/" }
```
Feature artifacts reference the profile by path — they do not copy profile data into the feature artifact.

After writing, output:
> "Feature discover artifacts written to specs/features/feat-{featureSlug}/. Run /spec to continue."

**If `mode=greenfield`**: Write artifacts to `specs/` as defined below.

---

## Artifact Generation (after Layer 3 approval)

Write the discover artifacts to the `specs/` directory.

### Format Selection

For small projects, use the single-file format:
- `specs/discover.json`
- `specs/discover_history.json`

For larger projects with many requirements or scenarios, use the split format:
- `specs/discover/index.json` — global fields (`constraints`, `selected_direction`, `design_philosophy`, `tech_direction`, `domain_model`, `non_functional_requirements`, `mvp_features`, `context_dependencies`)
- `specs/discover/requirements.json` — `requirements[]`, `invariants[]`
- `specs/discover/scenarios.json` — `core_scenarios[]`
- `specs/discover/history.json` — the history artifact previously stored in `specs/discover_history.json`

The JSON schemas below are shown in single-file form; in split mode, move the corresponding sections into the child files above and keep the index file as the entry point.

---

### specs/discover.json Schema

```json
{
  "phase": "discover",
  "version": "4.0",
  "status": "approved",
  "mode": "<full|lite>",
  "constraints": {
    "tech_stack": [],
    "time": null,
    "platform": [],
    "exclusions": [],
    "budget": null,
    "existing_assets": []
  },
  "selected_direction": {
    "description": "",
    "differentiator": "",
    "rationale": "",
    "pre_mortem": [],
    "grounding": "<search_verified|ai_judgment_only>"
  },
  "design_philosophy": [
    {
      "principle": "",
      "justification": "",
      "source_decisions": []
    }
  ],
  "tech_direction": {
    "stack": [],
    "architecture_style": "",
    "product_impact": "",
    "rationale": ""
  },
  "domain_model": {
    "entities": [
      { "name": "", "description": "" }
    ],
    "relationships": [
      { "from": "", "to": "", "type": "", "description": "" }
    ]
  },
  "non_functional_requirements": [
    {
      "category": "<performance|security|scale|availability|compliance|accessibility>",
      "description": "",
      "target": "",
      "source": "<user_stated|ai_inferred>",
      "priority": "<must_have|should_have|nice_to_have>"
    }
  ],
  "requirements": [
    {
      "id": "REQ-001",
      "user_story": "",
      "acceptance_criteria": [
        {
          "id": "REQ-001-AC-1",
          "type": "<event_driven|condition|state|regression_guard>",
          "ears": "",
          "source_refs": []
        }
      ],
      "source": "<user_stated|ai_inferred>",
      "downstream_impact": {
        "tech_implications": "",
        "test_complexity": "",
        "effort_estimate": ""
      }
    }
  ],
  "invariants": [
    {
      "id": "INV-001",
      "statement": "",
      "scope": "<system-wide|module-specific>",
      "requirement_refs": []
    }
  ],
  "core_scenarios": [
    {
      "id": "SCENARIO-001",
      "description": "",
      "requirement_refs": [],
      "priority": "highest"
    }
  ],
  "mvp_features": [
    {
      "name": "",
      "feasibility": "",
      "competitive_notes": "",
      "source_refs": [],
      "requirement_refs": []
    }
  ],
  "context_dependencies": [],
  "ui_taste": null
}
```

---

### specs/discover_history.json Schema

```json
{
  "explored_directions": [
    {
      "description": "",
      "differentiator": "",
      "risk": "",
      "status": "<selected|abandoned|merged>",
      "abandonment_reason": ""
    }
  ],
  "pruned_features": [
    {
      "name": "",
      "reason": "",
      "deferred_to": "<v2|cut>"
    }
  ],
  "decision_log": [
    {
      "layer": "<direction|mvp|lock>",
      "action": "<SELECT|MERGE|REJECT_ALL|APPROVE|BACKTRACK|BACKTRACK_MVP|BACKTRACK_DIR|REVISE|FORCE_OVERRIDE>",
      "detail": "",
      "timestamp": "<ISO 8601>"
    }
  ],
  "completeness_snapshots": [
    {
      "layer": "<1|2|3>",
      "dimensions": {
        "core_feature_definition": 0,
        "user_scenario_coverage": 0,
        "technical_constraints": 0,
        "boundary_conditions": 0,
        "non_functional_requirements": 0
      },
      "gaps_noted": [],
      "timestamp": "<ISO 8601>"
    }
  ]
}
```

---

### Subagent Output Format (return this to main agent)

After writing all files, return ONLY this summary:

```
written: [list of file paths written]
format: single | split
```

Keep total output under 500 chars. The main agent will present the completion message to the user.
