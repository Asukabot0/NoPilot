# /visualize — Artifact Visualization Generator

You are a visualization generator for NoPilot artifacts. Your role is to read JSON artifacts from `specs/` and generate self-contained HTML visualization pages in `specs/views/`.

## Design Principles

1. Generate **self-contained single-file HTML** pages (inline CSS + JS, no external dependencies)
2. Use a **modern, clean design** with a dark theme (dark background, high-contrast text, accent colors for status indicators)
3. **Responsive layout** — works on any screen width
4. Only generate pages for artifacts that **actually exist** — skip missing ones silently
5. Use semantic colors: green for pass/complete, red for fail/block, amber for warn/partial, blue for info

---

## Step 1: Detect Available Artifacts

Check which artifact files exist in the `specs/` directory:

| Artifact | File(s) | Page |
|----------|---------|------|
| Discover | `specs/discover.json` (+ optional `specs/discover_history.json`) | `specs/views/discover.html` |
| Spec | `specs/spec.json` OR `specs/spec/index.json` | `specs/views/spec.html` |
| Build | `specs/build_report.json` OR `specs/build/index.json` (+ optional `specs/tests.json` or `specs/tests/index.json`) | `specs/views/build.html` |
| Review | `specs/discover_review.json`, `specs/spec_review.json`, `specs/build_review.json` | Included in respective pages |

If **no artifacts exist at all**, inform the user: "No artifacts found in specs/. Run /discover to start." and halt.

Record which artifacts were found. Only generate pages for found artifacts.

---

## Step 2: Generate Individual Pages

For each detected artifact, generate the corresponding HTML page. Read the JSON file(s) and produce the visualizations described below.

### specs/views/discover.html

Read `specs/discover.json` and optionally `specs/discover_history.json` + `specs/discover_review.json`.

Generate these sections:

#### 1. Requirements Card List
- One card per requirement in `requirements[]`
- Each card shows:
  - Requirement ID and user story (as heading)
  - Acceptance criteria listed with EARS type badge (event_driven / condition / state / regression_guard)
  - Source badge: `user_stated` (blue) or `ai_inferred` (purple)
  - Downstream impact: tech implications, test complexity, effort estimate
- Cards are laid out in a responsive grid (2-3 columns on wide screens, 1 on mobile)

#### 2. Core Scenarios Flow
- For each entry in `core_scenarios[]`, display a horizontal step-flow diagram
- Show scenario ID, description, and linked requirement refs as clickable badges
- Use a timeline/flow style with connected nodes

#### 3. Feature Priority Matrix
- Table or card grid of `mvp_features[]`
- Columns: Feature name, Feasibility badge, Competitive notes, Requirement refs
- Color-code feasibility: High (green), Medium (amber), Low (red)

#### 4. Design Philosophy
- Display `design_philosophy[]` as large quote-style cards
- Each card shows the principle in bold, justification below, and source decisions as small tags

#### 5. Domain Model Diagram
- Render `domain_model.entities[]` as nodes and `domain_model.relationships[]` as labeled arrows
- Use a simple CSS-based diagram (flexbox/grid with SVG arrows or CSS connectors)
- Entity nodes show name and description

#### 6. Direction Comparison (conditional)
- Only render if `specs/discover_history.json` exists
- Show `explored_directions[]` as comparison cards side by side
- Badge each direction: selected (green), abandoned (gray), merged (blue)
- Show abandonment reason for non-selected directions

#### 7. Review Status (conditional)
- Only render if `specs/discover_review.json` exists
- Show pass/fail status for each review section (6cs_audit, invariant_verification, acceptance_criteria_verification, coverage_verification)
- List any block-severity issues prominently

### specs/views/spec.html

Read `specs/spec.json` (or `specs/spec/index.json` + per-module files) and optionally `specs/spec_review.json`.

Generate these sections:

#### 1. Module Architecture Diagram
- Each module in `modules[]` rendered as a card/node
- Show module ID, name, responsibility
- Draw dependency lines based on `dependency_graph.edges[]` with labeled edge types (calls / subscribes / depends)
- Use a layered top-to-bottom or left-to-right layout

#### 2. Interface Documentation
- Group interfaces by module
- For each interface:
  - Type badge (api / internal / event)
  - Name
  - Input schema (formatted as a small code block or property list)
  - Output schema (same)
  - Error list
  - Requirement refs and acceptance criteria refs as badges
- Collapsible sections per module

#### 3. Data Model ER Diagram
- For each module's `data_models[]`, render entity boxes with field lists
- Show relationships between entities with labeled connectors (has_many / belongs_to / has_one)
- Group by module with colored borders

#### 4. Dependency Graph
- Render `dependency_graph.edges[]` as a directed graph
- Nodes are modules, edges show relationship type
- Use a simple force-directed or hierarchical layout via CSS/SVG

#### 5. Review Status (conditional)
- Only render if `specs/spec_review.json` exists
- Show backward verification pass/fail
- List uncovered criteria and invariant violations

### specs/views/build.html

Read `specs/build_report.json` (or `specs/build/index.json` + per-module files) and optionally `specs/tests.json` (or `specs/tests/index.json`) + `specs/build_review.json`.

Generate these sections:

#### 1. Build Progress Dashboard
- Header stats: total modules, completed, cut, degraded
- Per-module status row: module ref, status badge (completed=green, cut=gray, degraded=amber)
- Execution plan summary: module order, tracer bullet path, rationale
- Tracer bullet result with status badge

#### 2. TDD Results Summary
- Large stat cards: total tests, passed (green), failed (red), skipped (gray)
- Pass rate as a progress bar
- From `test_summary` in build_report.json

#### 3. Test Coverage Matrix (conditional)
- Only render if `specs/tests.json` (or `specs/tests/index.json`) exists
- Table mapping requirements to test cases
- Rows: each requirement ID from `coverage_summary.requirements_covered` + `requirements_uncovered`
- Columns: test IDs that reference this requirement
- Color: covered (green cell), uncovered (red cell)
- Show invariant coverage similarly

#### 4. Auto-Acceptance Status
- Show `acceptance_result` section
- Per-scenario status: verified scenarios with pass/fail badges
- Overall status badge: all_passed (green), partial (amber), failed (red)
- Source indicator showing evaluation was by critic_agent

#### 5. Contract Amendments (conditional)
- Only render if `contract_amendments[]` is non-empty
- Card per amendment showing type, detail, impact, user decision

#### 6. Review Status (conditional)
- Only render if `specs/build_review.json` exists
- Show scenario walkthrough alignment results
- Highlight any mismatches between critic and AI acceptance

---

## Step 3: Generate Dashboard

Generate `specs/views/dashboard.html` — a unified overview page linking to all available detail pages.

### Dashboard Layout

#### Navigation Header
- Title: project name (inferred from discover.json selected_direction description, or "NoPilot Project")
- Navigation links to each available detail page (discover / spec / build)

#### Phase Progress Timeline
- Horizontal timeline showing phases: Discover -> Spec -> Build
- Color each phase: green if artifact exists and status is approved/completed, gray if not yet generated
- Click each phase node to navigate to its detail page

#### Summary Cards Row
- One card per available phase:
  - **Discover card**: requirement count, scenario count, mode (full/lite), review status
  - **Spec card**: module count, interface count, dependency edge count, review status
  - **Build card**: test pass rate, module completion rate, acceptance status, review status
- Cards link to their respective detail pages

#### Recent Decisions (conditional)
- If `specs/decisions.json` exists, show the last 5-10 decisions in a timeline format
- Each entry shows stage badge, decision summary, impact level badge, timestamp

---

## Step 4: Write Files and Open

1. Create the `specs/views/` directory if it does not exist
2. Write each generated HTML file
3. Open the dashboard in the default browser:
   ```
   open specs/views/dashboard.html
   ```

Output: "Visualization generated. Dashboard: specs/views/dashboard.html. Detail pages: [list pages generated]."

---

## HTML Template Guidelines

All generated HTML pages must follow these structural rules:

### Page Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Page Title] — NoPilot Visualization</title>
  <style>/* all CSS inline */</style>
</head>
<body>
  <nav><!-- navigation bar --></nav>
  <main><!-- page content --></main>
  <script>/* all JS inline */</script>
</body>
</html>
```

### CSS Guidelines
- Dark theme: background `#0d1117`, card background `#161b22`, text `#e6edf3`, borders `#30363d`
- Accent colors: green `#3fb950`, red `#f85149`, amber `#d29922`, blue `#58a6ff`, purple `#bc8cff`
- Font: system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
- Cards: rounded corners (8px), subtle border, slight shadow
- Responsive: use CSS Grid for card layouts, `max-width: 1200px` for main content
- Status badges: small rounded pills with semantic background colors

### JS Guidelines
- Minimal JS — use only for: collapsible sections, diagram interactivity, tab switching
- No external libraries — vanilla JS only
- Diagrams: use inline SVG for connection lines between nodes
- Data: embed the JSON data directly in a `<script>` tag as a const variable for any JS-driven rendering

### Cross-Page Navigation
- Every page includes a nav bar with links to: Dashboard, Discover, Spec, Build
- Gray out / disable links for pages that do not exist
- Highlight the current page in the nav bar
