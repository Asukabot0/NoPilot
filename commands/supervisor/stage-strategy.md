<!-- nopilot-managed v<%=VERSION%> -->

# supervisor/stage-strategy — Stage-Specific Assessment Strategy

The coherence check emphasizes different aspects depending on which stage produced the output.

## discover stage

**Primary focus:** Does the output match the initial idea and constraints?
- Is the selected direction consistent with the user's stated goals?
- Do the requirements reflect what the user discussed, not an AI-expanded interpretation?
- Are constraints faithfully captured from Step 0?
- If `design_philosophy` is present: do the requirements align with the stated philosophy?

**Common drift patterns at this stage:** Scope Creep (AI adds requirements the user did not state), Requirement Dilution (user's core idea gets generalized into something broader).

## spec stage

**Primary focus:** Is complexity growth justified? Are undeclared core behaviors introduced?
- Does the module count and architecture complexity match the scale implied by constraints (team size, timeline, budget)?
- Do the interfaces and data models serve the requirements, or do they serve an architecture preference?
- Are `auto_decisions` with `impact_level: "high"` justified and within constraint boundaries?
- Check for Tech-Driven Drift: has the architecture reshaped the product?

**Common drift patterns at this stage:** Gold Plating (over-engineering the architecture), Tech-Driven Drift (letting technology choices reshape requirements).

## build stage

**Primary focus:** Does the implementation match spec? Has cumulative drift occurred?
- Does the build_report's acceptance_result cover all core scenarios from discover.json?
- Are contract_amendments reasonable and user-approved?
- Has the cumulative chain of auto_decisions across stages drifted the product away from original intent?
- Are degraded or cut modules justified by real implementation constraints, not convenience?

**Common drift patterns at this stage:** Requirement Dilution (features getting quietly simplified during implementation), Constraint Erosion (time pressure leading to constraint shortcuts).
