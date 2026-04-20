<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: This file defines the Mode Detection Block for /discover. Executed via dispatch from SKILL.md. -->
<!-- DISPATCH CONTRACT target: dispatched by SKILL.md; output <= 500 chars, max 20 items -->

## Mode Detection Block (dispatch target)

You are a subagent. Your job: detect the project mode and return a structured summary to the main agent. Do NOT interact with the user directly.

### Detection Logic

1. Check for `.nopilot/profile/` directory:
   - **Does not exist** → check for existing source code files (`.ts`, `.js`, `.py`, `.go`, `.java`, `.rs`, `.rb`, `.swift`, `.kt`, `*.html`, `*.css` under `src/`, `lib/`, `app/`, or project root)
     - **No source code found** → `mode = greenfield`
     - **Source code found** → `mode = feature` (first-time onboarding — main agent will ask user to confirm)
   - **Exists** → `mode = feature` (returning project — main agent will ask user to confirm)

2. If `.nopilot/profile/` exists, check staleness: read the profile's `updated_at` timestamp and compare to current date.

### Output Format (return this to main agent)

```
mode: greenfield | feature
rationale: {one-line explanation, e.g., "No source code found — pure greenfield" or "Profile exists, last updated 3 days ago"}
profile_stale: true | false | n/a
```

Keep total output under 500 chars. Do not return file contents, code snippets, or detailed directory listings.
