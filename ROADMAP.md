# NoPilot Roadmap

[中文版](docs/zh-CN/ROADMAP.md)

## V1.0 — Core Pipeline

**Status:** Delivered.

- Three-stage workflow: `/discover` → `/spec` → `/build`
- Three-layer convergence funnel in /discover (Step 0 + Layer 1/2/3)
- Constrained design expansion in /spec
- TDD implementation with tracer bullet and auto-acceptance in /build
- Supervisor agent (intent guardian) + Critic agent (independent challenger)
- Core guardrails: backward verification, global coherence check, auto-acceptance
- Enhancement guardrails: tracer bullet (enabled), mutation testing (disabled), multi-sample 6Cs (disabled)
- Full/lite mode with AI-recommended mode selection
- Tiered exception handling (L0/L1/L2/L3)
- Backtrack safety (max count + cycle detection)
- State machine flow control via workflow.json
- Structured JSON artifacts with cross-stage traceability (REQ → MOD → TEST/PROP)

---

## V1.1 — Quality Framework Overhaul

**Status:** Delivered. Schema version 4.0.

**Delivered:**
- `/discover` progressive idea collection: idea capture → structuring → targeted constraint collection (replaces one-shot checklist)
- `/discover` completeness tracking: per-layer assessment with visual progress bars and thresholds
- `/discover` design philosophy extraction: 3-5 principles distilled from user decisions, written to `discover.json`
- `/discover` domain model + non-functional requirements outputs
- Generation-review separation (framework principle): generating agents must never evaluate their own output
- Iterative verification loop: fresh Critic instances per round, floating caps (3/5/7-10 by complexity), trend evaluation (converging/diverging/oscillating)
- Supervisor systematic drift detection: 5 drift patterns (scope creep, gold plating, tech-driven drift, requirement dilution, constraint erosion), quantitative scoring (0-100), design philosophy compliance
- Critic universal evaluation framework: AI bias catalog (7 patterns), confidence calibration, severity grading (block/warn)
- 6Cs tiered enforcement: Completeness/Consistency/Correctness mandatory; Clarity/Conciseness/Concreteness advisory
- Independent Critic test review in /build (mandatory in full mode)
- Agent consensus mechanism (declared, incrementally adopting)
- Artifact directory split support for large projects (`specs/spec/index.json` + per-module files)
- `/visualize` command: HTML dashboard generation from JSON artifacts
- Decision ledger: unified `specs/decisions.json` audit trail across stages

**Runtime adapter:** [Lash](https://github.com/Asukabot0/NoPilot) — cross-platform multi-agent orchestration engine implementing the `/build` phase with parallel TDD execution, git worktree isolation, and platform-as-agent architecture (archived in favor of V1.2 merged package).

**Known limitations:**
- Greenfield only — no support for existing codebases
- Full backtrack re-runs all downstream stages (no incremental update)
- Agent consensus declared but not yet wired into /spec and /build command files
- No MCP/script enforcement for models with weak instruction following
- No formal JSON Schema validation of artifacts
- Context window pressure on large projects (directory split helps but no auto-detection)
- No persistent memory across projects

---

## V1.2 — Runtime Unification

**Status:** Delivered.

**Delivered:**
- Lash rewritten from Python 3.10 to TypeScript (ES2022 + strict mode)
- Merged into NoPilot as single npm package (no separate installation)
- Dual CLI: `nopilot` (framework) + `lash` (build runtime) via single `npm install -g nopilot`
- Technology stack: Commander.js (CLI), Vitest (testing), pnpm (package management)
- 465 tests passing (multicore test execution)
- Git worktree isolation per Worker preserved
- Platform-as-Agent architecture (Claude Code, Codex, OpenCode) preserved
- External test verification workflow preserved
- L0-L3 failure classification with regex pattern matching preserved
- Module Critic + Build Critic + Supervisor quality gates preserved
- Full NoPilot V1.1 schema 4.0 compatibility maintained
- Lash repository archived (legacy Python codebase)

**Architecture highlights:**
- Config via `lash.config.json` in the current working directory
- JSON protocol for CLI subcommands (15 atomic operations)
- Atomic state persistence with 21 transition types
- Crash recovery and health monitoring built-in
- No external runtime dependencies (npm packages only)

---

## V1.5 — Usability & Entry Points

**Goal:** Reduce friction for real-world adoption. Address the two biggest gaps: simple projects feel too heavy, and existing projects aren't supported.

### True Lite Mode
- [ ] Reduced artifact schemas in lite mode (feature list instead of full EARS, optional invariants)
- [ ] Lite discover phase weight reduction: streamline Layer 3 steps for "direction already clear" scenarios ([#17](https://github.com/Asukabot0/NoPilot/issues/17))
- [ ] Lite mode skips search requirement in Layer 1/2
- [ ] Lite /spec: same-session Critic only, no independent session
- [ ] Lite /build: tracer bullet and auto-acceptance use simplified checks
- [ ] AI mode recommendation uses explicit heuristics (constraint count, feature count, platform complexity)

### Brownfield Support
- [ ] Feature-scoped artifact isolation: `specs/<feature-slug>/` per feature, `.active` pointer for current context ([#17](https://github.com/Asukabot0/NoPilot/issues/17))
- [ ] `/discover` reads existing codebase as context (file structure, existing APIs, tech stack detection)
- [ ] Layer 1 skips direction divergence — direction is "extend this existing project"
- [ ] Layer 2 presents features in context of existing architecture (what fits, what requires refactoring)
- [ ] `/spec` reads existing code to avoid module conflicts and leverage existing patterns
- [ ] `/build` generates code that integrates with existing codebase (imports, conventions, test framework)
- [ ] Backtrack re-runs only affect new/changed artifacts, not existing code
- **(Lash) Brownfield Build Runtime:**
  - [ ] Workers receive existing codebase context in task packages
  - [ ] Worktree strategy: branch from existing code, not empty branch
  - [ ] Test runner auto-detects existing test framework and integrates
  - [ ] Incremental builds: only re-run affected modules on backtrack

### Search Hardening
- [ ] Graceful degradation when search fails: `grounding: "ai_judgment_only"` with user notification
- [ ] Search quality scoring — low-quality results flagged rather than silently consumed
- [ ] Search is recommended (not required) for all modes, with explicit opt-out

### Pre-flight Environment Check
- [ ] `/spec` completion triggers environment readiness check (API keys, database access, required CLIs)
- [ ] Missing dependencies surfaced before `/build` starts, not during L0 exceptions

### Lash UX & Reliability
- [ ] Progress feedback: structured summary after each Worker spawn/complete/merge event
- [ ] Human-readable error messages by default (JSON via `--json` flag)
- [ ] Auto-discover `lash.config.json` (search `./` and `./lash/`)
- [ ] Worker completion detection via marker file (not `git diff` heuristic)
- [ ] Heartbeat-based Worker health monitoring
- [ ] Auto-resume crashed Workers (not just detect crash)
- [ ] Merge conflict auto-resolution for trivial conflicts (formatting, import ordering)

### Refactor-Proofing (Tech Debt Investment)

Four small investments now make the V2→V3 and V3→V4 inflection points 30-50% cheaper.
These are tracked separately from feature work.

- [ ] **Unify artifact I/O behind an `ArtifactStore` interface.** Today `fs.writeFileSync` is
  scattered across many call sites. Wrap it in a `LocalFsStore` implementing a small interface;
  future `RemoteStore` (V4) can drop in without rewriting call sites.
- [ ] **Add an `execution_model_version` field to `workflow.json`.** Today nothing distinguishes
  prompt-driven from runtime-driven semantics. Adding the field now lets the V3 runtime detect
  and migrate older workflow definitions safely.
- [ ] **Schema versioning + migration scaffolding.** Add a `schema_version` field to all artifact
  types; ship an empty `migrations/` directory with a stub runner. Future schema changes will not
  break existing projects.
- [ ] **Concentrate CLI side-effects in `lash` subcommands, not in skill markdown.** Today some
  side-effects (file writes, state mutations) are described in markdown and executed by the LLM.
  Migrate them into atomic `lash` subcommands. This also eliminates the documentation/CLI
  consistency risk demonstrated by the historical `lash state read` issue.

---

## V2 — Reliability & Efficiency

**Goal:** Make the pipeline reliable enough for serious use. Reduce backtrack cost, add multi-model verification, enforce artifact contracts.

### Incremental Backtrack
- [ ] Impact analysis: when a requirement changes, trace which modules and tests are affected
- [ ] `/spec` re-generates only affected modules, preserves unchanged modules
- [ ] `/build` re-runs only affected module TDD cycles, preserves passing modules
- [ ] Contract amendment propagation: changes flow downstream without full re-run

### MCP/Script Enforcement Layer
- [ ] Optional MCP server that reads workflow.json and enforces state machine transitions programmatically
- [ ] JSON Schema validation scripts for all artifact types (discover.json, spec.json, tests.json, build_report.json)
- [ ] Schema validation runs automatically on artifact write — rejects malformed artifacts
- [ ] State transition validation — prevents illegal transitions regardless of model compliance
- [ ] Designed for models with weak instruction following (open-source LLMs, smaller models)

### Multi-Model Verification
- [ ] Critic agent can optionally use a different model than the generation model
- [ ] Supervisor agent can optionally use a different model
- [ ] Configuration in workflow.json: `agents.critic.model`, `agents.supervisor.model`
- [ ] Breaks same-model bias completely (not just independent session, but independent model)

### Multi-Sample 6Cs
- [ ] Enable `multi_sample_6cs` guardrail: AI evaluates each requirement N times
- [ ] Inconsistent pass/fail across samples → flag as low-confidence
- [ ] Configurable sample count in workflow.json

### Context Management
- [ ] Artifact summarization strategy defined per field (compressible vs hard-constraint fields)
- [ ] Adapter-side tooling for context budget management
- [ ] Long-artifact chunking: split large spec.json into per-module reads when context is tight

### Formal Artifact Schemas
- [ ] JSON Schema files for every artifact type in `schemas/`
- [ ] Schemas versioned alongside workflow.json
- [ ] Validation integrated into artifact write flow

---

### Architectural Inflection Point — V2 → V3

NoPilot's first major architectural shift happens between V2 and V3:
**prompt-driven workflow → runtime-driven orchestration.**

Today the workflow lives primarily in `commands/*.md`, with `workflow.json` as a declarative
schema interpreted by an LLM reading skill files. Enterprise needs (audit, replayability,
deterministic state transitions, mid-run interruption/recovery) require promoting the workflow
to an executable orchestrator. Skills will become prompt templates invoked **by** the runtime
rather than the runtime itself.

Estimated impact: ~30-40% of core code (commands/, workflow runtime, Lash dispatch, artifact I/O).
Mitigated by the V1.5 refactor-proofing items below.

---

## V3 — Intelligence & Learning

**Goal:** NoPilot learns from experience. Cross-project patterns, spec drift detection, and richer verification.

### Memory System
- [ ] Cross-project experience store: tech choices that worked/failed, common patterns, architectural preferences
- [ ] Memory interface defined in workflow definition layer ("what to remember")
- [ ] Memory storage/retrieval delegated to runtime adapter ("how to store")
- [ ] `/discover` Layer 2 references past project decisions when recommending tech direction
- [ ] `/spec` references past module patterns when designing similar systems
- [ ] Memory decay: old memories weighted lower, contradicted memories pruned

### Spec Drift Detection
- [ ] Monitor code changes against spec.json — detect when implementation diverges from spec
- [ ] Triggered on git commit or file save (via adapter hooks)
- [ ] Drift report: which modules diverged, which spec constraints are violated
- [ ] Suggest spec update or code correction

### Mutation Testing
- [ ] Enable `mutation_testing` guardrail in /build Step 5
- [ ] AI mutates its own code (intentional bug injection)
- [ ] Check whether tests catch mutations
- [ ] Uncaught mutations → test quality defects → generate additional tests
- [ ] Configurable mutation count and strategies

### Dynamic Constraint Dimensions
- [ ] `/discover` Step 0 constraint dimensions are extensible at runtime
- [ ] AI can suggest new constraint dimensions based on project context
- [ ] User can add custom dimensions mid-discovery without restarting

### Taste Clarification — Architecture & Implementation Layer
- [ ] `/discover` clarifies architecture taste ambiguity (e.g. monolith vs modular vs event-driven preference) during Step 0c when relevant
- [ ] `/discover` clarifies data processing strategy taste (e.g. eager vs lazy evaluation, batch vs streaming preference) during Step 0c when relevant
- [ ] `/discover` clarifies error handling philosophy taste (e.g. fail-fast vs defensive, silent degradation vs hard stops) during Step 0c when relevant

### Richer Traceability
- [ ] Acceptance criteria → interface-level mapping (not just module-level)
- [ ] Test derivation chain visualization (requirement → criterion → test → code)
- [ ] Coverage gap analysis with suggested test additions

---

### Architectural Inflection Point — V3 → V4

The second major shift: **local CLI → team backend service.**

V1.x ~ V3 keeps all artifacts in the user's local `specs/` folder; CLI runs on the developer's
machine. Team-layer features (shared specs, PR webhooks, web dashboard, multi-user concurrent
spec edits, audit logs) require centralized storage and server-side coordination.

Scope: add a backend service tier. **Core algorithms (Critic / Supervisor / Lash dispatch /
failure classifier) are not rewritten** — only their I/O and state-store boundaries.

---

## V4 — Platform Expansion

**Goal:** NoPilot runs beyond Claude Code. iOS remote agent, parallel execution, multi-LLM backend.

### iOS Runtime Adapter
- [ ] Swift-based orchestrator reads workflow.json and executes state machine
- [ ] Remote agent execution: iOS app sends tasks to server-side LLM agents
- [ ] Multi-LLM backend: route stages/agents to different providers (Claude, GPT, Gemini, open-source)
- [ ] Async execution: start `/build`, close app, get notified on completion or L2 pause
- [ ] Push notification for checkpoints requiring human decision

### Parallel Module Execution
- [ ] Independent modules (no dependency edges) built in parallel
- [ ] Requires auto-generated API mocks from spec.json interfaces (prerequisite from V2 schemas)
- [ ] Contract testing between parallel modules before integration
- [ ] Parallel Critic/Supervisor execution (already independent by design)

### Plugin Architecture
- [ ] Custom stage insertion: add stages between discover/spec/build or after build
- [ ] Custom agent insertion: add domain-specific agents alongside Supervisor/Critic
- [ ] Custom guardrail plugins: user-defined checks at stage boundaries
- [ ] Stage skip/replace: swap /build with external SDD tool (BMAD, Kiro, etc.)

### Web Dashboard (Optional)
- [ ] Artifact visualization: requirement → module → test traceability graph
- [ ] Pipeline status: which stage, which state, what's blocking
- [ ] Decision history: all human decisions and AI auto_decisions in timeline view
- [ ] Backtrack cost estimator: predicted re-run time before confirming

---

## North Star — Long-term Vision (Non-committed, Directional)

> The sections below describe **direction**, not deliverables. Items here have no version
> assignment and no timeline commitment. They exist to anchor product positioning and to
> filter design partners. Concrete delivery items that emerge from this vision will be
> promoted into a numbered version (V5+) when ready.

### Team Layer

- Shared spec / decisions ledger across team members
- PR / issue / CI-failure entry points (in addition to `/discover`)
- Web dashboard: traceability graph, pipeline status, decision timeline
- Multi-model verification (Critic and Supervisor on independent models)
- MCP-enforced constraints in Lash worker boundaries

### Enterprise Layer

- SSO / RBAC / audit log / private deployment
- Compliance reporting (SOC2-friendly evidence trails)
- Multi-tenant artifact store
- Private model routing and data-residency controls

### AI Delivery Governance Layer

NoPilot's most distinct long-term position. **All four points below are governance, not execution.**

- **Risk-tiered release contracts.** Every AI-generated change is annotated with risk tier,
  rollback plan, canary strategy, and observability whitelist — consumed by the team's existing
  CD system.
- **Feature-flag advisory.** Integrate with LaunchDarkly / Unleash / Statsig to recommend
  flag configuration based on spec risk tier. The flag platform remains authoritative.
- **Evidence-driven post-deploy validation.** Production signals from Sentry / Datadog / New Relic
  flow back into the evidence graph as post-hoc acceptance for the originating change.
- **Rollback recommendation, human-approved execution.** When an incident is linked back to a
  NoPilot-produced change, NoPilot surfaces the change provenance and a rollback proposal.
  The actual rollback is executed by the CD system after human approval.

### Non-Goals (restated)

NoPilot will **not** replace CI/CD, feature-flag platforms, APM, or incident-management tools.
NoPilot will **not** auto-execute production-impacting changes without explicit human approval
above risk tier L1.

---

## Versioning Policy

- **Major versions** (V1, V2, V3, V4): New capabilities that change the workflow definition layer
- **Minor versions** (V1.5): Usability improvements within the existing workflow model
- **workflow.json `version` field** tracks schema compatibility
- Backward compatibility: newer adapters must support older workflow.json versions
