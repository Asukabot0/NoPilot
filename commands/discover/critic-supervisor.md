<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=CRITIC_PATH%> = platform path to critic skill, <%=SUPERVISOR_PATH%> = platform path to supervisor skill -->

# discover/critic-supervisor — Critic Integration + Supervisor Integration

### Feature Mode: Dispatch Scope

**If `mode=feature`**: Critic reads `specs/features/feat-{featureSlug}/discover.json` (or split index). Supervisor receives the feature artifact as current stage output and uses `constraints`, `selected_direction`, `tech_direction`, `design_philosophy` from the feature artifact (not the full project profile). All output files are written under `specs/features/feat-{featureSlug}/`.

**If `mode=greenfield`**: Critic and Supervisor operate on `specs/discover.json` (or split index) as defined below.

---

## Critic Integration

After both artifact files are written, the main discover flow MUST immediately enter this review gate. Discover is not complete after artifact generation alone.

The main discover flow MUST NOT:
- inline the Critic review or Supervisor review in the main agent,
- manually mark `passed: true`, `aligned: true`, or any equivalent success field,
- tell the user to continue to `/spec`,
- generate extra completion files/messages before this review gate passes.

Spawn the Critic agent for independent requirement quality verification.

<!-- DISPATCH CONTRACT
  agent: critic (sonnet)
  input_files: [specs/discover.json OR specs/discover/index.json]
  input_state: []
  output_file: specs/discover_review.json
  output_summary: { passed: bool, block_count: number, warn_count: number, 6cs_audit: { passed: bool }, invariant_verification: { passed: bool }, acceptance_criteria_verification: { passed: bool }, coverage_verification: { passed: bool } } (max 20 logical entries)
  on_error: pause and present findings to user; do not proceed to Supervisor
-->

### Critic Dispatch Instructions

1. Spawn Critic agent using the Agent tool targeting `<%=CRITIC_PATH%>`
2. Critic reads only the discover artifact (`specs/discover.json` or `specs/discover/index.json`) — no conversation history, independent session
3. Critic performs four checks:
   - **6Cs quality audit** — independently evaluate each requirement's 6Cs dimensions (see grading below)
   - **Invariant verification** — completeness, non-contradiction, scope accuracy
   - **Acceptance criteria testability** — can concrete tests be derived directly?
   - **Requirement coverage** — are all core scenarios covered? Any orphan requirements?
4. Critic writes results to `specs/discover_review.json`
5. **If issues found:** Critic attempts self-fix on the discover artifact, records the attempt in `discover_review.json.self_fix_log`, then re-verifies with a fresh Critic instance using the floating complexity-based cap from `<%=CRITIC_PATH%>`.
6. The main discover flow MUST NOT treat self-fixed output as passed until that fresh Critic instance writes a passing review.
7. If still failing after the cap and trend evaluation, pause and present findings to user.
8. **If passed:** Proceed to Supervisor check.

### 6Cs Grading: Mandatory vs Advisory

The 6Cs dimensions are split into two tiers:

#### Mandatory (must pass to APPROVE — failures block progression)
| Dimension | Rationale |
|-----------|-----------|
| **Completeness** | Missing edge cases and conditions directly cause downstream defects |
| **Consistency** | Contradictions between requirements create impossible implementations |
| **Correctness** | Incorrect requirements produce correct-looking but wrong systems |

#### Advisory (recorded as warnings — do NOT block APPROVE)
| Dimension | Rationale |
|-----------|-----------|
| **Clarity** | Ambiguity can often be resolved during /spec without re-running /discover |
| **Conciseness** | Verbosity is a quality smell, not a correctness issue |
| **Concreteness** | Vagueness is flagged for improvement but doesn't block if the intent is deducible |

In `discover_review.json`, Critic records advisory failures with `"severity": "warn"` and mandatory failures with `"severity": "block"`. Only `"block"` severity issues prevent APPROVE.

### Checkpoint: Read discover_review.json

After Critic completes, read `specs/discover_review.json` and check:
- `6cs_audit.passed == true` (only `"block"` severity issues count toward pass/fail)
- `invariant_verification.passed == true`
- `acceptance_criteria_verification.passed == true`
- `coverage_verification.passed == true`

If all four pass → proceed to Supervisor. If any failed and Critic's self-fix was exhausted → pause, present the review findings to the user, wait for resolution.

The main discover flow MUST NOT manually rewrite those pass/fail fields to force progression.

---

## Supervisor Integration

After Critic passes:

<!-- DISPATCH CONTRACT
  agent: supervisor (sonnet)
  input_files: [specs/discover.json OR specs/discover/index.json, specs/discover_review.json]
  input_state: [constraints, selected_direction, tech_direction, design_philosophy]
  output_file: specs/discover_review.json (global_coherence_check field)
  output_summary: { drift_detected: bool, drift_score: number, drift_diagnosis: string, aligned: bool } (max 20 logical entries)
  on_error: pause and present drift diagnosis to user; wait for resolution before proceeding
-->

### Supervisor Dispatch Instructions

1. Spawn Supervisor agent using the Agent tool targeting `<%=SUPERVISOR_PATH%>`
2. Pass the following from the discover artifact as the **anchor**:
   - `constraints`
   - `selected_direction`
   - `tech_direction`
   - `design_philosophy`
3. Pass the complete discover artifact (`specs/discover.json` or `specs/discover/index.json`) as the **current stage output**
4. Supervisor checks global coherence: does the requirement set match the stated intent?
5. Write the Supervisor's assessment into `specs/discover_review.json`'s `global_coherence_check` field
6. **If drift detected:** Pause, present the drift diagnosis to the user, and wait for resolution before proceeding
7. **If aligned:** Proceed — only now may the main agent present discover as complete and mention `/spec` as the next stage.

If the user resolves Critic findings manually after a failed review, the main discover flow MUST re-run Critic and wait for a fresh passing review before entering Supervisor.
