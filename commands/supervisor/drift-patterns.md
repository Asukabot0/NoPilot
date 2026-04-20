<!-- nopilot-managed v<%=VERSION%> -->

# supervisor/drift-patterns — 5 Drift Patterns

Evaluate the output against five drift patterns. For each pattern, check the listed signals and assign a severity if detected.

## Pattern 1: Scope Creep

The output contains features, modules, or behaviors that were never part of the user's stated direction or requirements.

**Detection signals:**
- Modules or features in the output that cannot be traced to any requirement in discover.json
- New user-facing capabilities that the user did not request and did not approve
- "Nice to have" additions that expand the surface area beyond what constraints justify

**Severity:** HIGH if new core behaviors are introduced; MEDIUM if only peripheral additions.

## Pattern 2: Gold Plating

The output is over-engineered — its complexity exceeds what the constraints and requirements demand.

**Detection signals:**
- Architecture patterns suited for a larger scale than the stated constraints imply (e.g., microservices for a single-user tool)
- Abstraction layers, plugin systems, or extensibility hooks not justified by any requirement
- Technology choices that add operational complexity without corresponding requirement-driven need

**Severity:** HIGH if complexity introduces new failure modes or delays delivery beyond stated time constraints; MEDIUM if it adds unnecessary weight but does not block.

## Pattern 3: Tech-Driven Drift

Technical choices are shaping the product rather than requirements shaping the technology. The tail is wagging the dog.

**Detection signals:**
- Requirements appearing to have been rewritten to fit a technology choice rather than the reverse
- Architecture decisions that constrain future product directions in ways the user did not intend
- Features framed around what a specific technology enables rather than what the user needs

**Severity:** HIGH if the product direction has shifted to accommodate tech; MEDIUM if isolated to a single module.

## Pattern 4: Requirement Dilution

Critical requirements from discover.json have been weakened, simplified, or partially dropped in downstream stages.

**Detection signals:**
- Acceptance criteria from discover.json that are not fully represented in spec.json interfaces
- Core scenarios whose steps are only partially covered by the module design
- Requirements marked as MVP in discover.json that appear degraded or optional in downstream output

**Severity:** HIGH if a core scenario is affected; MEDIUM if non-core requirements are diluted.

## Pattern 5: Constraint Erosion

Declared constraints from Step 0 are being bypassed, loosened, or silently ignored.

**Detection signals:**
- Tech stack choices that violate declared `tech_stack` constraints
- Platform targets that do not match declared `platform` constraints
- Excluded items (from `exclusions`) that appear in the output
- Scope or effort exceeding declared `time` or `budget` constraints without user approval

**Severity:** HIGH — constraint erosion is always high severity because constraints represent hard user decisions.
