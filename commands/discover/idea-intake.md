<!-- nopilot-managed v<%=VERSION%> -->

# discover/idea-intake — Feature Mode Intake + Greenfield Layer 2

### Feature Mode: Intake Adherence

**If `mode=feature`**: This sub-skill handles Feature Steps 0a-0d and Feature Layer 2 inheritance. Read the existing profile before any collection steps. Skip constraints already captured in the profile.

**If `mode=greenfield`**: This sub-skill handles Layer 2 (MVP Definition + Technical Path) content expansion when called from SKILL.md routing.

---

## Feature Mode Steps 0a–0d (mode=feature only)

### Feature Step 0a — Feature Description

Ask:
> "What feature do you want to add to this project?"

Accept any description: a sentence, a user story, a rough idea. If too vague, ask one follow-up: "Can you say more about the problem this feature solves or who it's for?"

### Feature Step 0b — Feature Structuring

Structure the input as a feature description (not a full product concept):
- **Feature name**: Short slug-friendly name
- **Problem it solves**: What user pain or workflow gap does this address?
- **Target users**: Who will use this feature?
- **Scope impression**: Is this a small addition, a new module, or a significant subsystem?

Generate a `featureSlug` from the feature name (lowercase, hyphens, e.g., `user-notifications`). Write `featureSlug` to context.

Present summary and ask: "Is this accurate? Anything to add or correct?" Wait for confirmation.

### Feature Step 0c — Constraint Collection (feature-specific only)

Read the existing profile. Skip any constraints already captured there (tech stack, platform, budget, etc.). Ask only about feature-specific additions:
- New external integrations this feature requires
- Feature-specific time constraints or deadlines
- Feature-specific exclusions or non-goals

### Feature Step 0d — Skip mode recommendation

Mode is already `feature`. Proceed directly to Layer 1 routing (which skips Layer 1 — see SKILL.md). Proceed to Layer 2 below.

---

## Feature Mode Layer 2 — MVP Definition (mode=feature only)

**If `mode=feature`**:

- **Inherit from profile** (do not re-collect): tech stack, architecture style, NFR targets, design philosophy. Display to user: "Inherited from project profile: [list inherited fields]."
- **Collect only feature-incremental definitions**:
  - New features/capabilities this addition brings (sections 1, 4, 5 below still apply, scoped to the feature)
  - New domain entities introduced by the feature
- **Domain model collision awareness**: Present new domain entities alongside existing entities from the profile. Explicitly flag any name collisions or relationship conflicts with existing entities.
- **Skip** sections 2 (Tech Stack), 3 (Core Scenarios for full reuse — scope to feature scenarios only), 6 (Core Domain Model full redefinition — only additive entities), 7 (NFR — inherited from profile unless feature adds new ones).
- After feature requirements are defined, run MOD-005 `detectConflicts` with the new requirements and existing profile requirements. If conflicts found, present them and ask the user to resolve before APPROVE.

**If `mode=greenfield`**: This section is not used. See Greenfield Layer 2 below.

---

## Greenfield Layer 2 — MVP Definition + Technical Path (mode=greenfield)

**Input:** Selected/merged direction from Layer 1.

Search for competitive analysis on the selected direction and relevant technical trends.

Generate ALL of the following simultaneously:

### 1. Core Feature List (5-10 features)

For each feature:
- Feature name and description
- **Technical feasibility:** High / Medium / Low with brief justification
- **Competitive comparison:** How does this compare to existing solutions?
- **Source refs:** URLs or named sources if search-grounded

### 2. Tech Stack + Architecture Style

Present in **product-impact language**:
- Instead of "We'll use PostgreSQL" → "Structured data storage that handles [X users/queries] — swap cost is [low/high] if requirements change"
- Instead of "Microservices architecture" → "Independent modules that can be scaled and updated separately — adds [N weeks] to initial setup, reduces coupling risk"
- Include rationale for each choice

### 3. Core Scenarios (1-3 highest-priority user journeys)

These are the **anchor scenarios** that drive tracer bullet implementation in `/build` and auto-acceptance criteria generation.
Format: Step-by-step user journey with clear start/end states.

### 4. Rough Effort Estimate

- Team composition assumption
- Timeline range (e.g., "6-10 weeks with 2 engineers")
- Key uncertainty factors

### 5. Pre-mortem — 3-5 Most Likely Failure Scenarios

For each: What goes wrong, why it happens, early warning signs.

### 6. Core Domain Model

Identify core domain entities and relationships. This is NOT a database schema — it is a conceptual model.

Format:
- **Entities**: List each core entity with a one-line description
- **Relationships**: List key relationships (e.g., "User -[owns]-> Project")
- Keep it high-level: entity names + relationships only, no field-level detail

### 7. Non-functional Requirements

Identify and document:
- **Performance targets**: Response time expectations, throughput goals
- **Security requirements**: Authentication, authorization, data protection
- **Scale expectations**: Expected user count, data volume, growth trajectory
- **Availability/reliability**: Uptime targets, disaster recovery
- **Compliance**: Regulatory requirements if applicable (GDPR, HIPAA, etc.)
- **Accessibility**: Standards compliance if applicable (WCAG, etc.)

Only include dimensions relevant to the product. Mark each as `user_stated` or `ai_inferred`.

### User Feature Pruning

After presenting, invite user to:
- **Keep**: Feature is in MVP
- **Cut**: Feature is removed entirely
- **Defer to V2**: Feature is documented but excluded from MVP scope

### User Actions

- **APPROVE**: Accept MVP definition and tech direction, proceed to Design Philosophy extraction
- **BACKTRACK**: Return to Layer 1 to reconsider direction

---

## Design Philosophy Extraction (between Layer 2 and Layer 3)

### Feature Mode: Philosophy Skip

**If `mode=feature`**: Skip philosophy extraction entirely. The existing project's design philosophy is already captured in the profile. Proceed directly to UI Taste Exploration trigger check.

After Layer 2 is approved and before entering Layer 3, extract design philosophy from the user's decisions.

### Process

1. Review all decisions the user has made: direction selection, feature pruning, tech trade-offs, risks acknowledged
2. Identify **3-5 underlying design principles** that explain the user's decision pattern
3. Present them as concise, opinionated statements

### Format

> Based on your decisions so far, here are the design principles I see driving this product:
>
> 1. **"[Principle]"** — [one-sentence justification from user's decisions]
> 2. **"[Principle]"** — [one-sentence justification from user's decisions]
> 3. ...

### Examples

- "Humans decide, machines execute" — user consistently kept manual approval steps
- "Ship fast, fix later" — user deferred all non-critical features and accepted higher tech debt
- "Data is sacred" — user kept all data integrity features and rejected shortcuts on storage
- "Simplicity over power" — user cut advanced features in favor of a smaller, cleaner core

### User Confirmation

Present and ask: "Do these principles accurately capture your product philosophy? Feel free to edit, remove, or add any."

Wait for user confirmation. Write confirmed design philosophy to `discover.json`'s `design_philosophy` field.

---

## Layer 2 User Actions

- **APPROVE**: All quality checks pass, proceed (design philosophy extraction for greenfield, or directly to UI Taste for feature mode)
- **BACKTRACK**: Return to Layer 1 to reconsider direction

**After user APPROVE: signal SKILL.md to load `completeness.md` for Layer 2 assessment.**
