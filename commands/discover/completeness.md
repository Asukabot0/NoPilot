<!-- nopilot-managed v<%=VERSION%> -->

# discover/completeness — Completeness Assessment Protocol

### Feature Mode: Assessment Inheritance

**If `mode=feature`**: Run completeness assessment as normal, but scope "User Scenario Coverage" to feature-specific scenarios only (not full-product coverage). "Technical Constraints" inherits from profile for existing constraints — only assess feature-incremental constraints.

**If `mode=greenfield`**: Run all dimensions at full scope as defined below.

---

## Completeness Assessment Protocol

At the end of **every Layer** (Layer 1, Layer 2, Layer 3), perform and display a completeness assessment before proceeding.

### Assessment Dimensions

Evaluate the following dimensions on a 0-100% scale:

| Dimension | What it measures |
|-----------|-----------------|
| Core Feature Definition | Are the core features clearly defined and scoped? |
| User Scenario Coverage | Are primary + edge case user journeys covered? |
| Technical Constraints | Are stack, architecture, and infrastructure decisions addressed? |
| Boundary Conditions | Are concurrency, performance, scale, and failure mode limits discussed? |
| Non-functional Requirements | Are security, performance targets, compliance, and accessibility covered? |

### Display Format

```
Completeness Assessment (Layer N):
├── Core Feature Definition  ████████░░  80%  ✓ Mostly clear
├── User Scenario Coverage   ██████░░░░  60%  ⚠ Missing error/edge flows
├── Technical Constraints    ████░░░░░░  40%  ✗ Data storage undecided
├── Boundary Conditions      ██░░░░░░░░  20%  ✗ Concurrency/perf undefined
└── Non-functional Reqs      ░░░░░░░░░░   0%  ✗ Not yet discussed
```

### Thresholds

- **Layer 1 → Layer 2**: Core Feature Definition >= 60%, User Scenario Coverage >= 40%
- **Layer 2 → Layer 3**: Core Feature Definition >= 80%, User Scenario Coverage >= 70%, Technical Constraints >= 60%
- **Layer 3 → Approval**: ALL dimensions >= 70%

### Auto-generated Follow-up

For any dimension below the threshold for the current transition, automatically generate 1-2 targeted follow-up questions to fill the gap. Present these to the user before allowing progression.

If the user explicitly chooses to proceed despite gaps (e.g., "let's move on, we'll figure that out later"), record the gap as a known risk and proceed.

### Snapshot Recording

After each assessment, write a `completeness_snapshot` entry to `specs/discover_history.json` (or `specs/discover/history.json`):

```json
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
```
