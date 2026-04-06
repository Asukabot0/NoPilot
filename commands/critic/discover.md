<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=CRITIC_PATH%> = platform path to critic skill, <%=SUPERVISOR_PATH%> = platform path to supervisor skill -->

# Critic — /discover Review Process

### Feature Mode: Greenfield and feature-scoped discover artifact verification

---

## Input

- `specs/discover.json` or `specs/discover/index.json`

---

## What to Check

### 1. 6Cs Quality Audit (with Tiered Enforcement)

For EACH requirement in the discover artifact, independently re-evaluate the 6Cs assessment.

**Mandatory dimensions (block on failure):**

| Dimension | Severity | Audit Question |
|---|---|---|
| **Completeness** | block | Are there missing edge cases, error states, or boundary conditions that the requirement silently assumes? |
| **Consistency** | block | Does this requirement contradict any other requirement or any system invariant? |
| **Correctness** | block | Does the requirement accurately describe what the system should do, or has AI reasoning introduced subtle distortion? |

**Advisory dimensions (warn on failure, do not block APPROVE):**

| Dimension | Severity | Audit Question |
|---|---|---|
| **Clarity** | warn | Could a different engineer read this requirement and arrive at a different implementation? If yes, flag. |
| **Conciseness** | warn | Does the requirement contain redundant clauses or over-specification that could create false constraints? |
| **Concreteness** | warn | Can a test be directly derived from this requirement without additional interpretation? Vague terms like "fast", "user-friendly", "seamless" -> flag. |

**Exception:** An advisory dimension is escalated to `block` if the issue would directly cause a mandatory dimension to fail. For example, a Clarity issue so severe that it makes Correctness indeterminate becomes a block.

Flag any requirement where the original 6Cs assessment appears to have **let an unclear or untestable requirement pass**. The AI generating requirements has an incentive to approve its own work — your job is to catch that bias (see Self-Approval Bias in the AI Bias Pattern Catalog).

### 2. Invariant Verification

- **Completeness:** Are there system-wide constraints implied by the requirements but not captured as explicit invariants?
- **Non-contradiction:** Do any invariants contradict each other? Does any invariant contradict a requirement's acceptance criteria?
- **Scope accuracy:** Are `system-wide` vs `module-specific` scopes correctly assigned?

### 3. Acceptance Criteria Testability

For EACH acceptance criterion (`REQ-xxx-AC-n`):
- Can a concrete test case (input -> expected output) be derived directly from this criterion without guesswork?
- Is the EARS syntax correctly applied for its declared type (event_driven / condition / state / regression_guard)?
- Are trigger conditions and expected responses specific enough to be unambiguous?

### 4. Requirement Coverage

- Are all core scenarios (`SCENARIO-xxx`) fully covered by at least one requirement?
- Are there requirements that no scenario references (orphan requirements)?
- Are there obvious functional gaps between requirements?

---

## Output

Write to `specs/discover_review.json`:

```json
{
  "phase": "discover_review",
  "session": "independent",
  "review_complexity": "<simple|medium|complex>",
  "self_fix_cap": "<number>",
  "6cs_audit": {
    "passed": true,
    "issues": [
      {
        "requirement_id": "REQ-xxx",
        "dimension": "<clarity|conciseness|completeness|consistency|correctness|concreteness>",
        "finding": "<what is wrong>",
        "severity": "<block|warn>",
        "confidence": "<high|medium|low>",
        "ai_bias_flags": ["<bias_pattern_name>"],
        "escalation_reason": "<null, or reason if advisory dimension was escalated to block>"
      }
    ]
  },
  "invariant_verification": {
    "passed": true,
    "completeness_gaps": [
      {
        "description": "<missing invariant description>",
        "severity": "<block|warn>",
        "confidence": "<high|medium|low>"
      }
    ],
    "contradictions": [
      {
        "description": "<invariant X contradicts invariant/requirement Y>",
        "severity": "block",
        "confidence": "<high|medium|low>"
      }
    ]
  },
  "acceptance_criteria_verification": {
    "passed": true,
    "untestable_criteria": [
      {
        "criteria_id": "REQ-xxx-AC-n",
        "reason": "<why a test cannot be derived>",
        "severity": "<block|warn>",
        "confidence": "<high|medium|low>"
      }
    ]
  },
  "coverage_verification": {
    "passed": true,
    "uncovered_scenarios": ["SCENARIO-xxx"],
    "orphan_requirements": ["REQ-xxx"]
  },
  "ai_bias_detection": {
    "patterns_found": [
      {
        "bias_type": "<over_engineering|optimistic_assessment|missing_negative_paths|concept_conflation|self_approval_bias|anchoring|symmetric_completion>",
        "target_id": "<REQ-xxx or INV-xxx or general>",
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

## On Issue

1. Attempt to fix the discover artifact — adjust unclear requirements, add missing invariants, tighten vague acceptance criteria.
2. **You may ONLY modify the discover artifact (`specs/discover.json` or files under `specs/discover/`). You must NEVER invent new requirements or change the user's intent — only sharpen existing ones.**
3. After fix, a fresh Critic instance re-runs verification from the top (no prior-cycle context).
4. If fix succeeds: record what was fixed in `self_fix_log`, mark all checks as passed.
5. If still failing after reaching the self-fix cap:
   - Evaluate trend (see Step 5 in framework).
   - If converging: extend by 2 iterations.
   - If diverging or oscillating: stop and report — the calling command (`/discover`) will pause for user intervention.
