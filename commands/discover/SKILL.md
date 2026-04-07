<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=CRITIC_PATH%> = platform path to critic skill, <%=SUPERVISOR_PATH%> = platform path to supervisor skill -->

# /discover — Requirement Space Explorer

> **[执行前确认]** 如果此 skill 是因关键词匹配自动加载的（而非用户显式输入 `/discover`），请先询问："检测到你可能需要进入 /discover 流程，要现在开始吗？" 仅在用户确认后继续。

> **[Dedup Guard]** If this skill has already been injected, do NOT re-inject. Command arguments appear in the user's message — do NOT append them to this skill text.

> **[Context Budget]** Load dispatch protocol once at start:
> ```
> Use the Skill tool to load: commands/discover/dispatch-protocol.md
> ```

You are a possibility generator. The user is the decision-maker.

## Design Principles (follow strictly)

1. Present technical decisions in **product-impact language**, not jargon
2. **Challenge** all requirements equally by surfacing costs and risks
3. All dimensions (requirements, feasibility, competitive risks, effort) appear **simultaneously**
4. Evaluate from **first principles**, not templates

---

## Mode Detection Block (runs before Step 0a)

<!-- DISPATCH CONTRACT
  task: "Detect project mode (greenfield vs feature)"
  input: ["project root path"]
  instructions: "commands/discover/mode-detection.md"
  output_file: specs/discover/mode-result.json
  output_summary: mode + rationale + profile_stale (max 20 items, <= 500 chars)
  on_error: standard
-->

Dispatch subagent → `commands/discover/mode-detection.md`. Present mode verdict to user:
- `greenfield`: proceed to Step 0a
- `feature` + profile: "Greenfield or feature mode?" (add stale warning if applicable)
- `feature` + no profile: "Existing codebase detected. Greenfield or feature?"

After user confirms: `greenfield` → Step 0a | `mode=feature` → load:
```
Use the Skill tool to load: commands/discover/idea-intake.md (Feature Mode Steps 0a-0d)
```

**Error handling**: If subagent fails, follow dispatch-protocol.md (retry or fallback).

---

## Step 0 — Greenfield Idea & Constraint Collection (mode=greenfield only)

**If `mode=feature`**: Skip. Sub-skill `idea-intake.md` handles Feature Steps 0a-0d.

### Step 0a — Idea Collection
> "What's your idea? It can be a single sentence, a paragraph, or even a vague feeling."

If too vague, ask ONE follow-up about the problem or target users.

### Step 0b — Idea Structuring
Organize into: **Problem statement**, **Target users**, **Core value proposition**, **Scope impression**. Present and confirm.

### Step 0c — Targeted Constraint Collection
Ask max 2-3 per round: Tech stack, Time, Platform, Exclusions, Budget, Existing assets. Record unasked as `null`.

### Step 0d — Mode Recommendation
Recommend `full` or `lite` mode. Wait for confirmation.

---

## Layer Routing

### Layer 1 — Direction Selection

**If `mode=feature`**: Skip Layer 1. Write `selected_direction: { description: "extend existing project", differentiator: "n/a", rationale: "feature mode", pre_mortem: [], grounding: "ai_judgment_only" }` → Layer 2.

<!-- DISPATCH CONTRACT
  task: "Competitive research + generate 3-5 product directions"
  input: ["specs/discover/index.json"]
  instructions: "Search competitive landscape. Generate directions with: description, differentiator, biggest risk, grounding."
  output_file: specs/discover/directions-draft.json
  output_summary: direction summaries (max 20 items, <= 3K chars)
  on_error: standard
-->

**Full Mode:** Dispatch subagent for competitive research. Before dispatch, write Step 0 results to artifact. Present returned direction summaries to user.
**Lite Mode:** Recommend single direction inline (no subagent needed).

**User Actions**: SELECT `<index>` / MERGE `<indices>` + `<note>` / REJECT_ALL `<reason>` (re-dispatch)

After user action: `Use the Skill tool to load: commands/discover/completeness.md (Layer 1 assessment)`

### Layer 2 — MVP Definition + Technical Path

**If `mode=feature`**: `Use the Skill tool to load: commands/discover/idea-intake.md (Feature Mode Layer 2)`
**If `mode=greenfield`**: Run full Layer 2. After APPROVE: `Use the Skill tool to load: commands/discover/completeness.md (Layer 2 assessment)`

After Layer 2 approved + philosophy confirmed → check for UI. Dispatch subagent for Skill: ui-taste exploration:

<!-- DISPATCH CONTRACT
  task: "Generate UI mockups via Stitch MCP or fallback"
  input: ["specs/discover/index.json"]
  instructions: "commands/discover/ui-taste.md"
  output_file: specs/mockups/index.html
  output_summary: screen id + page + description + tier (max 20 items, <= 2K chars per batch)
  on_error: standard
-->

Present screen summaries. User feedback loop:
- **Direct select** → write `ui_taste` to artifact → Layer 3
- **Text feedback** → re-dispatch with iteration instructions
- **Hybrid DNA** → re-dispatch with synthesis instructions
- **No UI** (CLI/API/backend) → record `"ui_taste": null` → Layer 3

**Error handling**: Stop, report missing file path, instruct `nopilot doctor`.

### Layer 3 — Requirement Lock

<!-- DISPATCH CONTRACT
  task: "Generate Layer 3 requirement lock table"
  input: ["specs/discover/"]
  instructions: "EARS acceptance criteria, invariants, quality checks, challenge protocol per SKILL.md Layer 3 spec."
  output_file: specs/discover/requirements.json
  output_summary: req count + invariant count + high risk items + conflicts (max 20 items, <= 3K chars)
  on_error: standard
-->

Before dispatch, write all Layer 2 decisions to artifact (INV-003). Dispatch subagent → returns requirement summary. Present challenge items (ACCEPT_COST / SIMPLIFY / DEFER_V2).

**If `mode=feature`**: subagent auto-generates `regression_guard` EARS for existing modules.
**If `mode=greenfield`**: regression guards for system invariants.

**User Actions**: APPROVE / REVISE `<req_ids>` (re-dispatch) / FORCE_OVERRIDE / BACKTRACK_MVP / BACKTRACK_DIR

After APPROVE: `Use the Skill tool to load: commands/discover/completeness.md (Layer 3 — all dims >= 70%)`

After Layer 3 approved → Artifact Generation:

<!-- DISPATCH CONTRACT
  task: "Finalize and write discover artifacts"
  input: ["specs/discover/"]
  instructions: "commands/discover/artifact-writer.md"
  output_file: specs/discover/index.json
  output_summary: written file list + format (max 20 items, <= 500 chars)
  on_error: standard
-->

Dispatch subagent → `commands/discover/artifact-writer.md`. Present confirmation.

### Critic + Supervisor Dispatch

<!-- DISPATCH CONTRACT
  agent: critic + supervisor (sonnet, sequential)
  input_files: [specs/discover.json OR specs/discover/index.json]
  output_file: specs/discover_review.json
  output_summary: { passed, block_count, warn_count, drift_detected, aligned } (max 20 logical entries)
  on_error: pause and present findings to user; wait for resolution
-->
```
Use the Skill tool to load: commands/discover/critic-supervisor.md
```

**Error handling**: If file missing, output path + `nopilot doctor` instruction.

---

## ID Naming Conventions

REQ-001..NNN | REQ-001-AC-1..N | INV-001..NNN | SCENARIO-001..NNN

---

## Backtrack Handling

1. Parse intent: BACKTRACK_MVP (→ Layer 2) or BACKTRACK_DIR (→ Layer 1)
2. Confirm: "Going back to [Layer X]. Previous choices preserved."
3. Read history artifact, reference prior decisions
4. Regenerate incorporating lessons from abandoned path
5. Add decision_log entry
