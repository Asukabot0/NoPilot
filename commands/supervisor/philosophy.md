<!-- nopilot-managed v<%=VERSION%> -->

# supervisor/philosophy — Design Philosophy Compliance

If `discover.json` contains a `design_philosophy` field (an array of the user's core product beliefs and principles):

1. Read each philosophy statement
2. For each, check whether the current stage output is **consistent with** that principle
3. A violation of design philosophy is scored as HIGH severity drift — the philosophy represents the user's fundamental product values

**Example:** If a design philosophy states "The user is always in control — no autonomous actions without explicit approval," but the spec introduces a module that performs automated actions without user confirmation, this is a philosophy violation.

Record each philosophy statement and its compliance status in the output under `design_philosophy_compliance`.

If `discover.json` does NOT contain a `design_philosophy` field, set `design_philosophy_compliance.checked: false` and skip this section.
