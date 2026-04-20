---
name: visualize
description: Artifact visualization generator — renders specs and artifacts as interactive HTML pages
---
<!-- nopilot-managed v<%=VERSION%> -->

# /visualize — Artifact Visualization Generator

You are a visualization generator for NoPilot artifacts. Your role is to read JSON artifacts from `specs/` and generate self-contained HTML visualization pages in `specs/views/`.

## Design Principles

1. Generate **self-contained single-file HTML** pages (inline CSS + JS, no external dependencies)
2. Use a **modern, clean design** with a dark theme (dark background, high-contrast text, accent colors for status indicators)
3. **Responsive layout** — works on any screen width
4. Only generate pages for artifacts that **actually exist** — skip missing ones silently
5. Use semantic colors: green for pass/complete, red for fail/block, amber for warn/partial, blue for info

## Step 1: Detect Available Artifacts

Check which of these exist: `specs/discover.json` or `specs/discover/index.json` → `specs/views/discover.html`; `specs/spec.json` or `specs/spec/index.json` → `specs/views/spec.html`; `specs/build_report.json` or `specs/build/index.json` → `specs/views/build.html`. Review JSONs are included in their respective pages. If no artifacts exist, inform the user and halt. Record which were found; only generate pages for those.

## Step 2: Generate Individual Pages

For each detected artifact, dispatch to the appropriate sub-skill:

<!-- DISPATCH CONTRACT agent: subagent | input_files: [specs/discover.json OR specs/discover/index.json] | output_file: specs/views/discover.html | output_summary: { page: "discover.html", sections: [...], artifact_found: bool } (max 20 logical entries) | on_error: stop and report missing sub-skill path -->
**Discover artifact found:** `Use the Skill tool to load: commands/visualize/discover-page.md`

<!-- DISPATCH CONTRACT agent: subagent | input_files: [specs/spec.json OR specs/spec/index.json] | output_file: specs/views/spec.html | output_summary: { page: "spec.html", sections: [...], artifact_found: bool } (max 20 logical entries) | on_error: stop and report missing sub-skill path -->
**Spec artifact found:** `Use the Skill tool to load: commands/visualize/spec-page.md`

<!-- DISPATCH CONTRACT agent: subagent | input_files: [specs/build_report.json OR specs/build/index.json] | output_file: specs/views/build.html | output_summary: { page: "build.html", sections: [...], artifact_found: bool } (max 20 logical entries) | on_error: stop and report missing sub-skill path -->
**Build artifact found:** `Use the Skill tool to load: commands/visualize/build-page.md`

For HTML template rules: `Use the Skill tool to load: commands/visualize/html-template.md`

**Error handling:** If any sub-skill file cannot be found, stop immediately and output:
> "Missing sub-skill: `<path>` — expected at `<absolute path>`. Run `nopilot doctor` to repair your installation, then re-run `/visualize`."

## Step 3: Generate Dashboard and Write Files

`Use the Skill tool to load: commands/visualize/dashboard.md`
