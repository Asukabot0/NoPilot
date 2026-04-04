# Lash V1.0 Release Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 2 remaining Lash V1.0 release blockers and fix the NoPilot schema version inconsistency.

**Architecture:** Three independent file-sync tasks (Tasks 1–2 are verbatim copies from NoPilot; Task 3 rewrites lash-verify.md to enforce generation-review separation; Task 4 fixes schema version numbers in NoPilot).

**Tech Stack:** Plain text / JSON / Markdown — no build step, no dependencies.

---

## Background

Lash V1.0 has two confirmed release blockers:

1. **Lash internal files still at V3.0** — `workflow.json` and `.claude/commands/build.md` in the Lash repo are V3.0; NoPilot V1.1 shipped V4.0 versions. Lash must be in sync.
2. **`lash/prompts/lash-verify.md` violates generation-review separation** — Step 2 asks the build agent to self-verify acceptance ("Pretend you have not seen…"), and Steps 3–4 are also self-executed rather than independent spawns. NoPilot V4.0 mandates Critic-only acceptance with no self-assessment.

Plus one NoPilot housekeeping issue:

3. **`schemas/*.schema.json` files say `"version": "3.0"`** — the workflow is V4.0 but the JSON Schema files were never bumped.

---

## File Map

| File | Repo | Action |
|------|------|--------|
| `workflow.json` | Lash | Replace with NoPilot's V4.0 version |
| `.claude/commands/build.md` | Lash | Replace with NoPilot's V4.0 version |
| `lash/prompts/lash-verify.md` | Lash | Rewrite Steps 2–4 for generation-review separation |
| `schemas/*.schema.json` (14 files) | NoPilot | Bump `"version": "3.0"` → `"version": "4.0"` |

---

## Task 1: Sync Lash `workflow.json` to V4.0

**Files:**
- Modify: `/home/taiyang/workspace/Lash/workflow.json`

- [ ] **Step 1: Replace Lash workflow.json with NoPilot's**

```bash
cp /home/taiyang/workspace/NoPilot/workflow.json /home/taiyang/workspace/Lash/workflow.json
```

- [ ] **Step 2: Verify version is now 4.0**

```bash
python3 -c "import json; d=json.load(open('/home/taiyang/workspace/Lash/workflow.json')); print(d['version'])"
```

Expected output: `4.0`

- [ ] **Step 3: Commit**

```bash
cd /home/taiyang/workspace/Lash
git add workflow.json
git commit -m "chore: sync workflow.json to NoPilot V4.0 schema"
```

---

## Task 2: Sync Lash `build.md` to V4.0

**Files:**
- Modify: `/home/taiyang/workspace/Lash/.claude/commands/build.md`

- [ ] **Step 1: Replace Lash build.md with NoPilot's**

```bash
cp /home/taiyang/workspace/NoPilot/.claude/commands/build.md /home/taiyang/workspace/Lash/.claude/commands/build.md
```

- [ ] **Step 2: Verify version string is 4.0**

```bash
grep '"version": "4.0"' /home/taiyang/workspace/Lash/.claude/commands/build.md
```

Expected output: one matching line.

- [ ] **Step 3: Verify generation-review separation principle is present**

```bash
grep "Generation-review separation" /home/taiyang/workspace/Lash/.claude/commands/build.md
```

Expected output: one matching line in Design Principles section.

- [ ] **Step 4: Commit**

```bash
cd /home/taiyang/workspace/Lash
git add .claude/commands/build.md
git commit -m "chore: sync build.md to NoPilot V4.0 (generation-review separation, Critic-only acceptance)"
```

---

## Task 3: Rewrite `lash-verify.md` — enforce generation-review separation

**Files:**
- Modify: `/home/taiyang/workspace/Lash/lash/prompts/lash-verify.md`

**Problem:** The current file has three violations:
- Step 2: build agent self-verifies acceptance scenarios (walks through code itself)
- Step 3: instructs the agent to "pretend you have not seen" — fake independence
- Step 4: build agent evaluates Supervisor dimensions itself

**Fix:** Remove all self-assessment. Spawn independent Critic (Step 2) and independent Supervisor (Step 3) via Agent tool.

- [ ] **Step 1: Overwrite lash-verify.md with corrected content**

Write the following content to `/home/taiyang/workspace/Lash/lash/prompts/lash-verify.md`:

```markdown
# Lash Final Verification Phase

You are performing the final verification of a Lash build. All modules have been merged. You now run full tests, spawn an independent Critic for acceptance walkthrough, then spawn an independent Supervisor for coherence check.

You receive: project root.

## Step 1: Full Test Suite

Run the complete test suite on the merged main branch:

```
python3 -m lash test .
```

If tests fail: classify and handle per L0-L3 rules (same as tracer/batch phases). If unfixable, escalate.

If all tests pass: proceed.

## Step 2: Critic-Only Acceptance Walkthrough (independent session)

The build agent must NOT perform self-verification. Acceptance is evaluated solely by an independent Critic agent — the agent that built the code must not judge whether the code meets user intent.

Spawn Critic agent (`.claude/commands/critic.md`) using the Agent tool:
- Critic reads: `specs/discover.json` (or `specs/discover/index.json`) and the actual implemented code — no conversation history, no build agent context
- For each core scenario (SCENARIO-xxx) in the discover artifact:
  1. Read the scenario's step-by-step user journey
  2. Trace the journey through the **actual implemented code**
  3. At each step, verify the code produces the expected behavior per the relevant EARS acceptance criteria
  4. Record independent pass/fail result for this scenario
- Critic writes results to `specs/build_review.json` with per-scenario outcomes plus a recommendation of `pass`, `L2`, or `L3`

Write the Critic's scenario results into `specs/build_report.json`'s `acceptance_result` field (sourced from Critic output, not self-assessment):

```json
{
  "acceptance_result": {
    "scenarios_verified": [
      {"scenario_id": "SCENARIO-001", "result": "pass|fail", "details": "..."}
    ],
    "status": "all_passed|partial|failed",
    "source": "critic_agent"
  }
}
```

- If `recommendation: "pass"`: proceed to Step 3.
- If `recommendation: "L2"`: pause, present product-level options to user.
- If `recommendation: "L3"`: halt, present backtrack options.

## Step 3: Supervisor Check (independent session)

Spawn Supervisor agent (`.claude/commands/supervisor.md`) using the Agent tool:
- Pass from `specs/discover.json` (or `specs/discover/index.json`) as the **anchor**: `constraints` + `selected_direction` + `tech_direction` + `design_philosophy`
- Pass `specs/decisions.json` as the **decision trail** for cumulative drift analysis
- Pass `specs/build_report.json` as the **current stage output**
- Supervisor uses quantitative drift scoring (0–100) to evaluate three dimensions:
  1. **Intent alignment**: Does the build output serve the stated direction? Or has it drifted?
  2. **Complexity growth**: Is the implementation proportional to requirements? Or over-engineered?
  3. **Constraint compliance**: Are all constraints respected (tech stack, platform, exclusions)?
- Supervisor writes its assessment into `specs/build_report.json`'s `global_coherence_check` field

If ALL three are ideal: build is complete. Update state.
If ANY is non-ideal: pause, present diagnosis to user. Options: ACCEPT_AS_IS, BACKTRACK_SPEC, BACKTRACK_DISCOVER.
```

- [ ] **Step 2: Verify self-verification language is gone**

```bash
grep -n "Pretend\|self-verif\|pretend" /home/taiyang/workspace/Lash/lash/prompts/lash-verify.md
```

Expected output: no matches.

- [ ] **Step 3: Verify Critic is spawned via Agent tool**

```bash
grep -n "Agent tool" /home/taiyang/workspace/Lash/lash/prompts/lash-verify.md
```

Expected output: two matches (one for Critic, one for Supervisor).

- [ ] **Step 4: Verify `source: critic_agent` is present in acceptance_result schema**

```bash
grep "critic_agent" /home/taiyang/workspace/Lash/lash/prompts/lash-verify.md
```

Expected output: one match.

- [ ] **Step 5: Commit**

```bash
cd /home/taiyang/workspace/Lash
git add lash/prompts/lash-verify.md
git commit -m "fix: enforce generation-review separation in lash-verify.md

Remove build agent self-verification and fake-independence Critic.
Spawn independent Critic (Step 2) and Supervisor (Step 3) via Agent tool.
acceptance_result now sourced from critic_agent, not self-assessment."
```

---

## Task 4: Bump NoPilot schema version numbers to 4.0

**Files:**
- Modify: `/home/taiyang/workspace/NoPilot/schemas/*.schema.json` (14 files)

- [ ] **Step 1: Check current state**

```bash
grep -r '"version"' /home/taiyang/workspace/NoPilot/schemas/
```

Expected: all lines show `"version": "3.0"`.

- [ ] **Step 2: Bump all schema files**

```bash
cd /home/taiyang/workspace/NoPilot
sed -i 's/"version": "3.0"/"version": "4.0"/g' schemas/*.schema.json
```

- [ ] **Step 3: Verify all updated**

```bash
grep -r '"version"' /home/taiyang/workspace/NoPilot/schemas/
```

Expected: all lines show `"version": "4.0"`.

- [ ] **Step 4: Verify no 3.0 remains**

```bash
grep -r '"version": "3.0"' /home/taiyang/workspace/NoPilot/schemas/
```

Expected output: no matches.

- [ ] **Step 5: Commit**

```bash
cd /home/taiyang/workspace/NoPilot
git add schemas/
git commit -m "chore: bump schema version numbers from 3.0 to 4.0"
```

---

## Post-Completion Checklist

After all 4 tasks:

- [ ] Lash `workflow.json` version field is `"4.0"`
- [ ] Lash `build.md` version strings are `"4.0"`, generation-review separation principle present
- [ ] `lash-verify.md` has no self-verification; spawns Critic and Supervisor via Agent tool
- [ ] NoPilot `schemas/*.schema.json` all show `"version": "4.0"`
- [ ] Lash test suite still passes: `cd /home/taiyang/workspace/Lash && python -m pytest tests/ -q`
- [ ] Update Lash ROADMAP: mark V1.0 blockers 1 & 2 as resolved

---

## ROADMAP Update (final step)

After all tasks pass, update `/home/taiyang/workspace/Lash/ROADMAP.md`:

Change the three V1.0 blocker checkboxes:
```markdown
- [x] Sync with NoPilot V1.1 (schema 4.0):
  - [x] Update local `.claude/commands/build.md` from V3.0 to V4.0
  - [x] Update `workflow.json` from V3.0 to V4.0
- [x] Fix generation-review separation in `lash-verify.md`
- [x] Restore or rewrite test suite ← already passing (172 tests)
```

And update the V1.0 status line from `Core implemented. Prompt layer + Python helper layer functional.` to `Released.`

Commit:
```bash
cd /home/taiyang/workspace/Lash
git add ROADMAP.md
git commit -m "docs: mark V1.0 blockers resolved, update release status"
```
