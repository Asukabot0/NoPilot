<!-- nopilot-managed v<%=VERSION%> -->
<!-- Placeholders: <%=CRITIC_PATH%> = platform path to critic skill, <%=SUPERVISOR_PATH%> = platform path to supervisor skill -->

# spec/review-runner — Phase 3: Critic + Supervisor Dispatch

When `/spec` is running from a feature-scoped discover artifact, read and write review artifacts under the same feature artifact root. Greenfield mode uses `specs/`.

After writing spec.json, spawn two independent review agents. These agents run in **separate sessions with no access to the generation conversation history** — this separation is critical to prevent self-approval bias.

## DISPATCH CONTRACT — Critic Agent

```
DISPATCH CONTRACT
agent: Critic
skill: <%=CRITIC_PATH%>
session: independent (no conversation history)
reads:
  - discover.json OR discover/index.json under the current artifact root
  - spec.json OR spec/index.json under the current artifact root
must NOT read: generation conversation history
task:
  - Perform backward verification: for each acceptance criterion, can the spec satisfy it?
  - Check for undeclared core behaviors
  - Use floating iteration cap based on review complexity: simple=3, medium=5, complex=7-10
  - Each self-fix iteration is reverified by a new Critic instance (no carry-over context)
  - If cap reached, evaluate trend (converging / diverging / oscillating) to decide next action
writes: spec_review.json under the current artifact root
output_summary: { passed: bool, block_count: number, warn_count: number, backward_verification: { passed: bool }, undeclared_behaviors: [...] } (max 20 logical entries)
```

**Critic Agent** (independent session, no conversation history):
- Spawn `<%=CRITIC_PATH%>` using the Agent tool in a **fresh session**
- Critic reads only the discover artifact and spec artifact (`specs/discover.json` or `specs/discover/index.json`; `specs/spec.json` or `specs/spec/index.json`) — never the generation conversation
- Critic reads only the discover artifact and spec artifact under the current artifact root — never the generation conversation
- Performs backward verification: for each acceptance criterion, can the spec satisfy it?
- Checks for undeclared core behaviors
- Uses a floating iteration cap (not a fixed number) based on review complexity — simple: 3, medium: 5, complex: 7-10
- Each self-fix iteration is reverified by a **new Critic instance** (no carry-over context from previous cycles)
- If the cap is reached, evaluates the trend (converging / diverging / oscillating) to decide next action
- Results written to `spec_review.json` under the current artifact root

## DISPATCH CONTRACT — Supervisor Agent

```
DISPATCH CONTRACT
agent: Supervisor
skill: <%=SUPERVISOR_PATH%>
session: independent (no conversation history)
reads:
  - discover.json OR discover/index.json under the current artifact root  [anchor: constraints + selected_direction + tech_direction]
  - spec.json OR spec/index.json under the current artifact root           [current stage output]
  - discover.json design_philosophy field
  - decisions.json under the current artifact root     [cumulative decision audit trail, if present]
must NOT read: generation conversation history
task:
  - Use quantitative drift scoring (0-100)
  - Check global coherence: has complexity bloated? Does design still match intent?
writes: spec_review.json under the current artifact root (global_coherence_check field)
output_summary: { drift_detected: bool, drift_score: number, drift_diagnosis: string, aligned: bool } (max 20 logical entries)
```

**Supervisor Agent** (independent session, no conversation history):
- Spawn `<%=SUPERVISOR_PATH%>` using the Agent tool in a **fresh session**
- Pass the following from the discover artifact as the **anchor**: `constraints` + `selected_direction` + `tech_direction`
- Pass the spec artifact under the current artifact root as the **current stage output**
- Supervisor also reads `design_philosophy` from discover.json and `decisions.json` under that same root for drift analysis
- Uses quantitative drift scoring (0-100) rather than binary judgment — see supervisor skill for score ranges and recommended actions
- Checks global coherence: has complexity bloated? Does the design still match intent?
- Results written to `spec_review.json` under the current artifact root in the `global_coherence_check` field
