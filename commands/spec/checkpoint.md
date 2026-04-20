<!-- nopilot-managed v<%=VERSION%> -->

# spec/checkpoint — Phase 4: Checkpoint Decision

Read spec_review.json results. Check **three conditions**:

1. `backward_verification.passed == true` (Critic passed)
2. `global_coherence_check.intent_alignment == "aligned"` (Supervisor aligned)
3. No entries in the spec artifact's `auto_decisions` with `impact_level: "high"` (no high-impact auto decisions)

## Decision Matrix

- **All three pass** → emit `REVIEW_CLEAN` → auto-continue to /build
- **Critic self-fixed issues successfully** → emit `REVIEW_FIXABLE` → return to Phase 1 (expanding) to integrate fixes
- **Any issues remain** → emit `REVIEW_HAS_ISSUES` → present findings to user, recommend review
  - User actions: `APPROVED` → emit `APPROVED`, `CHANGES_REQUESTED` → emit `CHANGES_REQUESTED` → return to Phase 1

## Auto-Continue Condition

All three conditions must be simultaneously true for `REVIEW_CLEAN`:
- Critic backward verification passed
- Supervisor intent alignment is "aligned"
- Zero high-impact auto_decisions in the spec artifact

If any condition fails, the flow does NOT auto-continue. Present the failing condition(s) and their evidence to the user before proceeding.
