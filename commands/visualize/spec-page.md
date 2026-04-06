<!-- nopilot-managed v<%=VERSION%> -->

# visualize/spec-page — specs/views/spec.html Generation Rules

Read `specs/spec.json` (or `specs/spec/index.json` + per-module files) and optionally `specs/spec_review.json`.

Generate `specs/views/spec.html` with the following 5 sections:

## Section 1: Module Architecture Diagram

- Each module in `modules[]` rendered as a card/node
- Show module ID, name, responsibility
- Draw dependency lines based on `dependency_graph.edges[]` with labeled edge types (calls / subscribes / depends)
- Use a layered top-to-bottom or left-to-right layout

## Section 2: Interface Documentation

- Group interfaces by module
- For each interface:
  - Type badge (api / internal / event)
  - Name
  - Input schema (formatted as a small code block or property list)
  - Output schema (same)
  - Error list
  - Requirement refs and acceptance criteria refs as badges
- Collapsible sections per module

## Section 3: Data Model ER Diagram

- For each module's `data_models[]`, render entity boxes with field lists
- Show relationships between entities with labeled connectors (has_many / belongs_to / has_one)
- Group by module with colored borders

## Section 4: Dependency Graph

- Render `dependency_graph.edges[]` as a directed graph
- Nodes are modules, edges show relationship type
- Use a simple force-directed or hierarchical layout via CSS/SVG

## Section 5: Review Status (conditional)

- Only render if `specs/spec_review.json` exists
- Show backward verification pass/fail
- List uncovered criteria and invariant violations
