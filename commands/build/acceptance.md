<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=CRITIC_PATH%> = platform path to critic skill -->

# Step 6: Auto-Acceptance (core guardrail)

## Feature Mode Annotation

**If `mode=feature`**: Critic reads discover artifact from `specs/features/feat-{featureSlug}/discover.json` (or index). Critic writes results to `specs/features/feat-{featureSlug}/build_review.json`.
**If `mode=greenfield`**: Critic reads from `specs/discover.json` (or index). Critic writes to `specs/build_review.json`.

---

## Principle

The build agent does NOT perform self-verification. Acceptance is evaluated solely by an independent Critic agent. This enforces the **generation-review separation** principle — the agent that built the code must not judge whether the code meets user intent.

---

## DISPATCH CONTRACT — Independent Critic Acceptance Validation

**Spawning agent:** build agent  
**Target:** `<%=CRITIC_PATH%>` (critic.md)  
**Tool:** Agent tool  
**IMPORTANT:** Critic receives NO build agent conversation history and NO build agent context. It reads only the discover artifact and the actual implemented code.

**Critic reads:**
- The discover artifact (`specs/discover.json` or `specs/discover/index.json` + child files as needed)
- The actual implemented code

*(Substitute feature paths when `mode=feature`.)*

**Critic does NOT receive:** build agent conversation history, test output, implementation notes, or any other build context.

**Critic's task — per core scenario (SCENARIO-xxx):**

1. Read the scenario's step-by-step user journey
2. Trace the journey through the **actual implemented code**
3. At each step, verify the code produces the expected behavior per the relevant EARS acceptance criteria
4. Record independent pass/fail result for this scenario

**Critic writes:** results to `specs/build_review.json` (or feature path) with per-scenario outcomes plus a recommendation of `pass`, `L2`, or `L3`.

**output_summary:** `{ scenario_walkthroughs: [...], acceptance_alignment: { aligned: bool, mismatches: [] }, recommendation: "pass|L2|L3" }` (max 20 logical entries)

**Lite Mode:** Auto-acceptance uses simplified Critic check — verify core scenario happy path only, no exhaustive EARS criteria walkthrough.

---

## Outcomes

The build agent writes the Critic's scenario results into the build report artifact's `acceptance_result` field (sourced from Critic output, not self-assessment).

- `recommendation: "pass"` → emit `ACCEPTANCE_PASS` → proceed to Step 7.
- `recommendation: "L2"` → Critic found issues fixable at product level → emit `ACCEPTANCE_FAIL_L2` (L2 path)
- `recommendation: "L3"` → Critic found fundamental issues → emit `ACCEPTANCE_FAIL_L3` (L3 path)

The Critic uses the floating iteration cap (see critic.md Step 4). Each reverification cycle is performed by a **fresh** Critic instance (no carry-over context). When the cap is reached, evaluate trend (see critic.md Step 5).
