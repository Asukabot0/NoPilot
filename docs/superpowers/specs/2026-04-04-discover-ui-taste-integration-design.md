# Discover UI Taste Integration Design

## Summary

Integrate the ui-taste module into the `/discover` workflow so that frontend products automatically go through UI taste exploration during the discover phase. The integration is prompt-level: modify `commands/discover.md` to instruct Claude to use Stitch MCP tools (with graceful degradation) for generating, previewing, and selecting UI design variants.

## Placement

Between **Design Philosophy Extraction** and **Layer 3 (Requirement Lock)**:

```
Layer 2 APPROVE → Design Philosophy Extraction → UI Taste Exploration → Layer 3
```

Rationale: By this point we know MVP features, tech stack, target platform, core scenarios, and design philosophy — all needed for meaningful UI generation.

## Trigger Logic

**Trigger when:** Product has a user-visible interface (web app, mobile app, desktop app, dashboard, admin panel, etc.). Determined from Layer 2's `tech_direction`, `mvp_features`, and `constraints.platform`.

**Skip when:** CLI tools, pure REST APIs, data pipelines, backend microservices, SDKs, libraries. Record `"ui_taste": null` in discover.json and proceed directly to Layer 3.

## Flow (6 Phases)

### Phase 1 — Page Identification

From Layer 2's MVP features + core scenarios, derive key pages/screens:
- Page name, description, target platform (`ios`/`android`/`web`/`desktop`), device type
- Lite mode: only the single most important page

### Phase 2 — Existing Style Detection (existing projects only)

For projects with existing frontend code:
- Check for CSS/SCSS/Tailwind config, design-tokens.json, theme files
- Extract existing design language as constraint for generation
- Greenfield projects skip this phase

### Phase 3 — Variant Generation (3-tier degradation)

| Tier | Condition | Behavior |
|------|-----------|----------|
| 1 (best) | Stitch MCP configured + online | `generate_screen_from_text` → `generate_variants` (variantCount: 5) |
| 2 (fallback) | No Stitch, has browser | Claude generates 5 HTML mockups with distinct styles directly |
| 3 (minimal) | CLI only / no browser | Text-based style preference questions (color tone, density, animation level, etc.) |

- Existing project: `creativeRange: REFINE`
- Greenfield: `creativeRange: REIMAGINE`
- Display generation progress ("Generating variant 3/5...")

### Phase 4 — Interactive Preview (Tier 1/2 only)

Serve local HTTP preview with:
- Tab bar to switch between 5 variants
- Device size simulation (iPhone SE / 16 Pro / 16 Pro Max / iPad mini / iPad Pro / Desktop / Full Screen)
- Side-by-side comparison mode (any 2 variants)
- Dark/Light mode toggle
- "Select" button → POST callback to localhost, CLI receives selection automatically
- Auto-detect available port; SSH environment → display URL instead of opening browser
- 30-minute inactivity timeout

### Phase 5 — Iteration & Feedback

Three feedback modes:
1. **Direct select** — satisfied, proceed to Phase 6
2. **Text micro-feedback** — "cards rounder", "less saturated" → re-generate with constraints
3. **Hybrid DNA** — pick dimensions from multiple variants (colors from A, layout from B) → synthesize new variants

Iteration history preserved; user can roll back to earlier rounds.

### Phase 6 — Save & Cleanup

- Selected HTML → `specs/mockups/{page-name}.html`
- Dark variant → `specs/mockups/{page-name}-dark.html` (if applicable)
- Generate `specs/mockups/index.html` overview page
- Export design tokens → `specs/mockups/tokens.json` (Tier 1/3) or `tokens.css` (Tier 2)
- Design DNA + Stitch project ID → `discover.json`'s `ui_taste` field
- Cross-page consistency: after first page selection, extract Design DNA and apply to subsequent pages
- Kill HTTP server, delete temp files

## discover.json Schema Change

Add optional top-level field `ui_taste`:

```json
{
  "ui_taste": {
    "designDNA": { "colorPalette": {}, "typography": {}, "spacing": [], "borderRadius": {}, "shadows": [], "animationLevel": "", "designMd": "" },
    "tokensPath": "specs/mockups/tokens.json",
    "mockupsDir": "specs/mockups/",
    "stitchProjectId": "proj-xxx",
    "tier": 1,
    "selectedPages": [
      { "name": "home", "mockupFile": "home.html", "darkMockupFile": "home-dark.html" }
    ]
  }
}
```

When UI taste is skipped: `"ui_taste": null`.

## Stitch MCP Setup Reminder

During `nopilot init` or when `/discover` detects the product has a frontend and Stitch MCP is not configured:

> "This product has a frontend. For the best UI exploration experience, configure Google Stitch MCP:
> 1. Visit stitch.withgoogle.com to get an API key
> 2. Add `@_davideast/stitch-mcp proxy` to your MCP servers with `STITCH_API_KEY`
>
> You can skip this — the system will fall back to AI-generated HTML mockups (Tier 2) or text-based questions (Tier 3)."

## User Guide Update

Update `docs/zh-CN/USER_GUIDE.md` with:
- New section: UI Taste Exploration in Discover
- Stitch MCP configuration instructions
- Screenshots/description of the preview interface
- Explanation of 3-tier degradation

## Downstream Impact

- **Layer 3:** Requirements can reference specific UI elements from mockups
- **`/spec`:** Reads `specs/mockups/` + `tokens.json` for component design
- **`/build` (Lash):** Workers read design tokens for style consistency; can call Stitch MCP via persisted project ID for additional screens

## Files to Modify

1. `commands/discover.md` — Add UI Taste Exploration step
2. `docs/zh-CN/USER_GUIDE.md` — Add Stitch setup + UI taste usage section

## Out of Scope

- CLI subcommand for TasteOrchestrator (using prompt-level integration instead)
- Automatic code extraction from mockups
- Figma integration
