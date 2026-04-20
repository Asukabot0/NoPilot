<!-- nopilot-managed v<%=VERSION%> -->

# visualize/html-template — Shared CSS/JS Inline Template Guidelines

All generated HTML pages must follow these structural rules.

## Page Structure

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

## CSS Guidelines

- Dark theme: background `#0d1117`, card background `#161b22`, text `#e6edf3`, borders `#30363d`
- Accent colors: green `#3fb950`, red `#f85149`, amber `#d29922`, blue `#58a6ff`, purple `#bc8cff`
- Font: system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
- Cards: rounded corners (8px), subtle border, slight shadow
- Responsive: use CSS Grid for card layouts, `max-width: 1200px` for main content
- Status badges: small rounded pills with semantic background colors

## JS Guidelines

- Minimal JS — use only for: collapsible sections, diagram interactivity, tab switching
- No external libraries — vanilla JS only
- Diagrams: use inline SVG for connection lines between nodes
- Data: embed the JSON data directly in a `<script>` tag as a const variable for any JS-driven rendering

## Cross-Page Navigation

- Every page includes a nav bar with links to: Dashboard, Discover, Spec, Build
- Gray out / disable links for pages that do not exist
- Highlight the current page in the nav bar
