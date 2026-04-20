<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: applies in all modes (greenfield + feature) -->

# Visualize — Dashboard Page

Generate `specs/views/dashboard.html` — a unified overview page linking to all available detail pages.

## Dashboard Layout

### Navigation Header
- Title: project name (inferred from discover.json `selected_direction` description, or "NoPilot Project")
- Navigation links to each available detail page (discover / spec / build)

### Phase Progress Timeline
- Horizontal timeline: Discover → Spec → Build
- Color each phase: green if artifact exists and status is approved/completed, gray if not yet generated
- Click each phase node to navigate to its detail page

### Summary Cards Row
One card per available phase:
- **Discover card**: requirement count, scenario count, mode (full/lite), review status
- **Spec card**: module count, interface count, dependency edge count, review status
- **Build card**: test pass rate, module completion rate, acceptance status, review status
- Cards link to their respective detail pages

### Recent Decisions (conditional)
If `specs/decisions.json` exists, show the last 5–10 decisions in a timeline format. Each entry: stage badge, decision summary, impact level badge, timestamp.

## Write and Open

1. Create `specs/views/` if it does not exist
2. Write each generated HTML file
3. Open the dashboard: `open specs/views/dashboard.html`

Output: "Visualization generated. Dashboard: specs/views/dashboard.html. Detail pages: [list pages generated]."
