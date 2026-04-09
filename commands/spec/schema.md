<!-- nopilot-managed v<%=VERSION%> -->

# spec/schema — Phase 2 Artifact Generation

When `/spec` is running from a feature-scoped discover artifact, write all spec artifacts to the same feature artifact root (`specs/features/feat-{featureSlug}/`). Greenfield mode writes to `specs/`.

Write the spec artifact. For small projects, use a single file. For larger projects with many modules, use a directory structure:

- **Single file:** `spec.json` under the current artifact root — suitable when the module count is small
- **Directory structure:** `spec/index.json` + `spec/mod-{id}-{name}.json` under the current artifact root — suitable when the module count is large. `index.json` contains the top-level structure (dependency_graph, external_dependencies, global_error_strategy, auto_decisions, contract_amendments, context_dependencies) and a `module_refs` array listing the module file names. Each `mod-{id}-{name}.json` contains a single module definition.

Use the following structure (shown as single-file format; directory format splits modules into separate files):

```json
{
  "phase": "spec",
  "version": "4.0",
  "status": "approved",
  "modules": [
    {
      "id": "MOD-001",
      "name": "",
      "responsibility": "",
      "source_root": "src/module/",
      "owned_files": ["src/module/**", "tests/module/**"],
      "interfaces": [
        {
          "type": "api | internal | event",
          "name": "",
          "input_schema": {},
          "output_schema": {},
          "errors": [],
          "api_detail": null,
          "requirement_refs": [],
          "acceptance_criteria_refs": []
        }
      ],
      "data_models": [
        {
          "name": "",
          "fields": [
            { "name": "", "type": "", "constraints": "" }
          ],
          "relationships": [
            { "target": "", "type": "has_many | belongs_to | has_one" }
          ]
        }
      ],
      "state_machine": null,
      "nfr_constraints": {
        "performance": null,
        "security": null,
        "other": null
      },
      "requirement_refs": [],
      "invariant_refs": []
    }
  ],
  "dependency_graph": {
    "edges": [
      { "from": "", "to": "", "type": "calls | subscribes | depends" }
    ]
  },
  "external_dependencies": [
    {
      "name": "",
      "purpose": "",
      "module_refs": [],
      "alternatives": [],
      "test_strategy": "mock | sandbox | real"
    }
  ],
  "global_error_strategy": {
    "api_error_format": "",
    "external_service": "",
    "logging": ""
  },
  "auto_decisions": [
    {
      "decision": "",
      "alternatives": [],
      "rationale": "",
      "impact": "",
      "impact_level": "low | medium | high"
    }
  ],
  "contract_amendments": [],
  "context_dependencies": ["discover.json or discover/index.json under the current artifact root"]
}
```

Ensure every interface has `requirement_refs` and `acceptance_criteria_refs` for traceability.
Ensure every module declares a non-empty `owned_files` list; Lash packaging and `/lash-build` use these entries as the worker ownership boundary and halt when they are missing or empty.
Ensure every module has `invariant_refs` where applicable.

Emit event: `COMPLETE` → enters `reviewing` state.
