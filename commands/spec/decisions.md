<!-- nopilot-managed v<%=VERSION%> -->

# spec/decisions — Phase 5: Decision Ledger

Append this stage's auto_decisions to `specs/decisions.json` (create if not exists). This file is the unified decision audit trail across all stages.

```json
{
  "decisions": [
    {
      "stage": "spec",
      "timestamp": "<ISO 8601>",
      "decision": "",
      "alternatives": [],
      "rationale": "",
      "impact": "",
      "impact_level": "low | medium | high"
    }
  ],
  "contract_amendments": []
}
```

If the file already exists (e.g., from a previous /discover run), **append** to the `decisions` array — do not overwrite.

After appending:

> "spec artifacts written to specs/. Generate visualization by running: open specs/views/spec.html (or run /visualize for full dashboard). Run /build to continue."
