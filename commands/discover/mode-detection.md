<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: This file defines the Mode Detection Block for /discover. Loaded by SKILL.md before Step 0a. -->

## Mode Detection Block (runs before Step 0a)

### Feature Mode: Entry Mode Detection

Before collecting ideas, detect the current project state and set `mode` in context.

**Detection logic:**

1. Check for `.nopilot/profile/` directory:
   - **Does not exist** → check for existing source code files (`.ts`, `.js`, `.py`, `.go`, `.java`, `.rs`, `.rb`, `.swift`, `.kt`, `*.html`, `*.css` under `src/`, `lib/`, `app/`, or project root)
     - **No source code found** → `mode = greenfield` (pure_greenfield). Proceed directly to Step 0a unchanged.
     - **Source code found** → `mode = first_time_onboarding`. Scan codebase via MOD-003 `scanCodebase`. Generate initial L0/L1/L3 profile layers. Then ask:
       > "I detected an existing codebase. Would you like to run a full project discover (define the product from scratch, greenfield mode) or add a feature to the existing project (feature mode)?"
       - User chooses **greenfield** → `mode = greenfield`. Continue with Step 0a unchanged.
       - User chooses **feature** → `mode = feature`. Load sub-skill for Feature Mode intake:
         ```
         Use the Skill tool to load: commands/discover/idea-intake.md (Feature Mode Steps 0a-0d)
         ```
   - **Exists** → `mode = returning_project`. Call MOD-001 `checkStaleness` on the profile.
     - If stale: warn the user: "Your project profile was last updated [N days ago] and may not reflect recent code changes."
     - Ask:
       > "Project profile found. Would you like to start a new greenfield discover (redefine the product) or add a feature to the existing project?"
     - User chooses **greenfield** → `mode = greenfield`. Continue with Step 0a unchanged.
     - User chooses **feature** → `mode = feature`. Load sub-skill:
       ```
       Use the Skill tool to load: commands/discover/idea-intake.md (Feature Mode Steps 0a-0d)
       ```

Write `mode` (`"greenfield"` or `"feature"`) to the current conversation context.

**Error handling:** If the sub-skill file `commands/discover/idea-intake.md` cannot be found, stop immediately and output:
> "Missing sub-skill: `commands/discover/idea-intake.md` — expected at `<absolute path>`. Run `nopilot doctor` to repair your installation, then re-run `/discover`."
