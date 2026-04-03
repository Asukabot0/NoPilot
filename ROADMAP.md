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

## V1.1 — Quality Framework Overhaul (Current)

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

**Runtime adapter:** [Lash](https://github.com/Asukabot0/NoPilot) — cross-platform multi-agent orchestration engine implementing the `/build` phase with parallel TDD execution, git worktree isolation, and platform-as-agent architecture.

**Known limitations:**
- Greenfield only — no support for existing codebases
- Full backtrack re-runs all downstream stages (no incremental update)
- Agent consensus declared but not yet wired into /spec and /build command files
- No MCP/script enforcement for models with weak instruction following
- No formal JSON Schema validation of artifacts
- Context window pressure on large projects (directory split helps but no auto-detection)
- No persistent memory across projects

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

### Search Hardening
- [ ] Graceful degradation when search fails: `grounding: "ai_judgment_only"` with user notification
- [ ] Search quality scoring — low-quality results flagged rather than silently consumed
- [ ] Search is recommended (not required) for all modes, with explicit opt-out

### Pre-flight Environment Check
- [ ] `/spec` completion triggers environment readiness check (API keys, database access, required CLIs)
- [ ] Missing dependencies surfaced before `/build` starts, not during L0 exceptions

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

### Richer Traceability
- [ ] Acceptance criteria → interface-level mapping (not just module-level)
- [ ] Test derivation chain visualization (requirement → criterion → test → code)
- [ ] Coverage gap analysis with suggested test additions

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

## Versioning Policy

- **Major versions** (V1, V2, V3, V4): New capabilities that change the workflow definition layer
- **Minor versions** (V1.5): Usability improvements within the existing workflow model
- **workflow.json `version` field** tracks schema compatibility
- Backward compatibility: newer adapters must support older workflow.json versions
