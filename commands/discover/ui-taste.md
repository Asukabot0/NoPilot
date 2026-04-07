<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: mode=feature uses creativeRange REFINE; mode=greenfield uses REIMAGINE. -->
<!-- DISPATCH CONTRACT target: dispatched by SKILL.md; output <= 2K chars per batch, max 20 items -->

# discover/ui-taste — UI Taste Exploration (dispatch target)

You are a dispatch target. Execute all UI mockup generation (Stitch MCP or fallback tiers), serve previews, and return screen summaries to the main agent. The main agent handles user feedback — you receive iteration instructions via re-dispatch.

### Output Format (return this to main agent after each generation batch)

```
screens:
  - id: "{screen_id}"
    page: "{page_name}"
    description: "one-line visual description of the design"
    variant_count: {N}
stitch_project_id: "{id or null}"
tier: 1 | 2 | 3
preview_url: "{local url or null}"
```

Keep total output under 2K chars per batch. Do NOT return raw Stitch JSON, component trees, or full HTML content. The main agent only needs IDs and descriptions to present choices to the user.

---

### Feature Mode: UI Taste Adherence

**If `mode=feature` AND the product has a frontend**:
- Use `creativeRange: REFINE` instead of `REIMAGINE` for all variant generation (Tier 1 and Tier 2).
- Read the existing `designDNA` from profile L3 (`.nopilot/profile/l3-status.json` → `ui_taste.designDNA`) when available, and pass it as the `designConstraint` for variant generation.
- If profile L3 has no `ui_taste`, fall back to scanning the existing codebase for CSS/Tailwind/design-tokens before generating variants.
- Skip Phase 2 (Existing Style Detection) only when profile L3 already contains `ui_taste`.
- Goal: new UI elements must visually integrate with the existing product, not reinvent it.

**If `mode=greenfield`**: Use `creativeRange: REIMAGINE` (default).

---

## UI Taste Exploration (conditional, between Design Philosophy and Layer 3)

After Design Philosophy is confirmed (or skipped in feature mode), determine whether the product has a user-facing interface.

### Trigger Check

Evaluate from Layer 2's `tech_direction`, `mvp_features`, and `constraints.platform`:

**Trigger:** The product includes user-visible UI (web app, mobile app, desktop app, dashboard, admin panel, etc.).

**Skip:** CLI tools, pure REST APIs, data pipelines, backend microservices, SDKs, libraries. When skipping, record `"ui_taste": null` in the discover artifact and proceed directly to Layer 3.

When triggered but Stitch MCP is not configured, display this setup hint:

> "This product has a frontend. For the best UI exploration experience, configure Google Stitch MCP:
> 1. Visit stitch.withgoogle.com to get an API key
> 2. Add `@_davideast/stitch-mcp proxy` to your MCP servers with `STITCH_API_KEY`
>
> You can skip this — the system will fall back to AI-generated HTML mockups (Tier 2) or text-based questions (Tier 3)."

Proceed regardless of whether user configures Stitch.

---

### Phase 1 — Page Identification

From Layer 2's MVP features + core scenarios, derive the key pages/screens the product needs:
- Page name
- One-line description
- Target platform (`ios` / `android` / `web` / `desktop`)
- Device type (`MOBILE` / `TABLET` / `DESKTOP`)

Present the page list to the user for confirmation. In lite mode, keep only the single most important page.

### Phase 2 — Existing Style Detection (existing projects only)

If the user is adding features to an existing frontend project:
1. Check the project for CSS/SCSS files, Tailwind config, `design-tokens.json`, theme files, Storybook config
2. Extract a style profile: color palette, typography, spacing scale, border radius, shadows
3. Use this profile as a `designConstraint` for variant generation (`creativeRange: REFINE`)

For greenfield projects, skip this phase and use `creativeRange: REIMAGINE`.

### Phase 3 — Variant Generation (3-tier degradation)

| Tier | Condition | Action |
|------|-----------|--------|
| **1** (best) | Stitch MCP configured | Call `generate_screen_from_text` for base screen, then `generate_variants` with `variantCount: 5`. Use `GEMINI_3_1_PRO` model. |
| **2** (fallback) | No Stitch, has browser | Generate 5 distinct HTML mockups directly. Each variant uses a different color scheme and layout style. Include responsive CSS, animations, and proper typography hierarchy. |
| **3** (minimal) | CLI only / no browser | Ask text-based style preference questions: preferred color tone (warm/cool/neutral), information density (spacious/compact), animation level (none/subtle/expressive), visual style (minimal/rich). Record answers as design constraints. |

For Tier 1 and 2:
- Display generation progress to the user: "Generating variant 3/5..."
- Post-process all generated HTML: patch fonts to user-specified font stack, inline external assets as base64, verify responsive CSS (inject if missing)

### Phase 4 — Interactive Preview (Tier 1/2 only)

Serve the generated variants via a local HTTP server:
- **Tab bar** to switch between 5 variants
- **Device preview buttons**: iPhone SE / iPhone 16 Pro / iPhone 16 Pro Max / iPad mini / iPad Pro 11" / iPad Pro 13" / iPad Split View / Slide Over / Desktop / Full Screen
- **Side-by-side comparison** mode
- **Dark/Light mode** toggle for the preview page itself
- **"Select This Design" button** → POST to `/api/select`, CLI receives the selection automatically

Server behavior:
- Auto-detect available port (start from 8900)
- SSH environment → display URL instead of opening browser
- Auto-close after 30 minutes of inactivity

### Phase 5 — User Feedback & Iteration

Three feedback modes:

1. **Direct select:** User is satisfied → proceed to Phase 6
2. **Text micro-feedback:** User types adjustments ("cards rounder", "less saturated", "larger headings") → append as prompt constraints, regenerate variants with updated constraints, display new round in preview
3. **Hybrid DNA selection:** User picks dimensions from different variants ("colors from variant A, layout from variant B, animation from variant C") → synthesize a composite design constraint, generate 5 new variants

Preserve iteration history. User can say "go back to round 1" to revisit earlier variants.

### Phase 6 — Save & Cleanup

After user selects their preferred design:

1. **Dark/light pairing:** Detect if the selected variant is light or dark themed. Generate the counterpart mode. Let user confirm or adjust.
2. **Cross-page consistency:** After first page selection, extract Design DNA. Apply as constraint to all subsequent pages so styles are consistent.
3. **Save mockups:**
   - Selected HTML → `specs/mockups/{page-name}.html`
   - Dark variant (if applicable) → `specs/mockups/{page-name}-dark.html`
   - Generate `specs/mockups/index.html` linking all saved pages
4. **Export design tokens:** Write `specs/mockups/tokens.json` (W3C DTCG format for Tier 1/3) or `specs/mockups/tokens.css` (CSS custom properties for Tier 2)
5. **Update discover artifact:** Write `ui_taste` field to the discover artifact (`specs/discover.json` or `specs/discover/index.json`):
   ```json
   {
     "ui_taste": {
       "designDNA": { "colorPalette": {}, "typography": {}, "spacing": [], "borderRadius": {}, "shadows": [], "animationLevel": "", "designMd": "" },
       "tokensPath": "specs/mockups/tokens.json",
       "mockupsDir": "specs/mockups/",
       "stitchProjectId": "<project-id or null>",
       "tier": 1,
       "selectedPages": [
         { "name": "home", "mockupFile": "home.html", "darkMockupFile": "home-dark.html" }
       ]
     }
   }
   ```
6. **Cleanup:** Kill HTTP server, delete temp files under `/tmp/nopilot-preview-*`

After completing UI Taste Exploration, return the final screen summaries + `ui_taste` field data to the main agent. The main agent writes `ui_taste` to the discover artifact and proceeds to Layer 3.

---

### Downstream Usage (informational — for main agent context)

- **Layer 3:** When defining UI-related requirements, reference the selected mockups for specific elements
- **`/spec` phase:** Reads `specs/mockups/` + `tokens.json` for component-level design
- **`/build` phase (Lash):** Workers read `specs/mockups/tokens.json` for style consistency. Can reference Stitch project ID for additional screens.
