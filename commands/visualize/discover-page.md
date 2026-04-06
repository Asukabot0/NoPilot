<!-- nopilot-managed v<%=VERSION%> -->

# visualize/discover-page — specs/views/discover.html Generation Rules

Read `specs/discover.json` or `specs/discover/index.json`. When using the split format, also read `specs/discover/requirements.json`, `specs/discover/scenarios.json`, and optionally `specs/discover/history.json`. Also read `specs/discover_history.json` and `specs/discover_review.json` when present.

Generate `specs/views/discover.html` with the following 7 sections:

## Section 1: Requirements Card List

- One card per requirement in `requirements[]`
- Each card shows:
  - Requirement ID and user story (as heading)
  - Acceptance criteria listed with EARS type badge (event_driven / condition / state / regression_guard)
  - Source badge: `user_stated` (blue) or `ai_inferred` (purple)
  - Downstream impact: tech implications, test complexity, effort estimate
- Cards are laid out in a responsive grid (2-3 columns on wide screens, 1 on mobile)

## Section 2: Core Scenarios Flow

- For each entry in `core_scenarios[]`, display a horizontal step-flow diagram
- Show scenario ID, description, and linked requirement refs as clickable badges
- Use a timeline/flow style with connected nodes

## Section 3: Feature Priority Matrix

- Table or card grid of `mvp_features[]`
- Columns: Feature name, Feasibility badge, Competitive notes, Requirement refs
- Color-code feasibility: High (green), Medium (amber), Low (red)

## Section 4: Design Philosophy

- Display `design_philosophy[]` as large quote-style cards
- Each card shows the principle in bold, justification below, and source decisions as small tags

## Section 5: Domain Model Diagram

- Render `domain_model.entities[]` as nodes and `domain_model.relationships[]` as labeled arrows
- Use a simple CSS-based diagram (flexbox/grid with SVG arrows or CSS connectors)
- Entity nodes show name and description

## Section 6: Direction Comparison (conditional)

- Only render if `specs/discover_history.json` exists
- Show `explored_directions[]` as comparison cards side by side
- Badge each direction: selected (green), abandoned (gray), merged (blue)
- Show abandonment reason for non-selected directions

## Section 7: Review Status (conditional)

- Only render if `specs/discover_review.json` exists
- Show pass/fail status for each review section (6cs_audit, invariant_verification, acceptance_criteria_verification, coverage_verification)
- List any block-severity issues prominently
