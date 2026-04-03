# NoPilot + Lash Merge: Migration to Node.js Runtime

**Date:** 2026-04-03
**Status:** Approved
**Relates to:** [Lash repo (to be archived)](https://github.com/Asukabot0/NoPilot)

## Summary

Merge Lash (multi-agent build orchestrator, currently pure Python) into NoPilot as a Node.js/TypeScript runtime. The merged project is a single npm package named `nopilot` that exports two CLI binaries: `nopilot` (framework tools) and `lash` (build runtime).

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript (strict) | Lash's 21 event types and 15 subcommand I/O contracts benefit from type safety |
| CLI framework | Commander.js | Mature, clean subcommand support, good TS types |
| Test framework | Vitest | Native TS, fast, shares Vite ecosystem with future preview server (issue #21) |
| Package manager | pnpm | Strict dependency isolation, fast, disk-efficient |
| Prompt file location | Unified `.claude/commands/` | Lash files already namespaced with `lash-` prefix |
| Distribution | Global install (`npm i -g`) + `nopilot init` per project | Both supported; init copies prompts/schemas/workflow.json to project |
| Lash repo | Archive on GitHub | No npm package history to migrate; git history preserved |
| Lash specs | Extract key design decisions only | Full artifacts are Python-specific; keep in archived repo |
| Schema version | Stay at 4.0 | No semantic/workflow changes in this migration |

## Project Structure

```
nopilot/
├── package.json                  ← name: "nopilot", bin: { "nopilot", "lash" }
├── pnpm-lock.yaml
├── tsconfig.json
├── vitest.config.ts
│
├── src/
│   ├── nopilot-cli.ts            ← nopilot init / validate / preview / version
│   └── lash/
│       ├── cli.ts                ← lash plan / spawn / test / ... (15 subcommands)
│       ├── plan-generator.ts     ← MOD-001: topological sort, batch generation
│       ├── platform-launcher.ts  ← MOD-002: Worker process spawn/resume/cancel
│       ├── worktree-manager.ts   ← MOD-003: git worktree create/merge/cleanup
│       ├── task-packager.ts      ← MOD-004: .lash/ task package generation
│       ├── test-runner.ts        ← MOD-005: test auto-detection and execution
│       ├── failure-classifier.ts ← MOD-006: L0-L3 failure classification
│       ├── build-state.ts        ← MOD-008: atomic state persistence (21 event types)
│       └── config.ts             ← configuration loading
│
├── commands/                     ← prompt files (copied to project by `nopilot init`)
│   ├── discover.md
│   ├── spec.md
│   ├── build.md
│   ├── critic.md
│   ├── supervisor.md
│   ├── visualize.md
│   ├── lash-build.md
│   ├── lash-tracer.md
│   ├── lash-batch.md
│   ├── lash-verify.md
│   ├── lash-conflict-resolver.md ← renamed from conflict_resolver.md
│   ├── lash-orchestrator.md      ← renamed from orchestrator.md
│   └── lash-worker-instructions.md ← renamed from worker_instructions.md
│
├── schemas/                      ← 14 JSON Schema files (copied to project by `nopilot init`)
│   ├── discover.schema.json      ← discover phase (4 files)
│   ├── discover_index.schema.json
│   ├── discover_history.schema.json
│   ├── discover_review.schema.json
│   ├── spec.schema.json          ← spec phase (3 files)
│   ├── spec_index.schema.json
│   ├── spec_review.schema.json
│   ├── build_report.schema.json  ← build phase (3 files)
│   ├── build_index.schema.json
│   ├── build_review.schema.json
│   ├── tests.schema.json         ← test artifacts (3 files)
│   ├── tests_index.schema.json
│   ├── tests_review.schema.json
│   └── decisions.schema.json     ← decision ledger (1 file)
│
├── workflow.json                 ← state machine definitions (copied to project by `nopilot init`)
│
├── tests/
│   ├── plan-generator.test.ts
│   ├── platform-launcher.test.ts
│   ├── worktree-manager.test.ts
│   ├── task-packager.test.ts
│   ├── test-runner.test.ts
│   ├── failure-classifier.test.ts
│   ├── build-state.test.ts
│   └── cli.test.ts
│
└── docs/
    ├── lash-design-decisions.md  ← extracted from Lash's old specs/
    └── zh-CN/
```

## CLI Design

### `nopilot` CLI

Framework-level operations.

| Command | Description |
|---------|-------------|
| `nopilot init [dir]` | Copy commands/, schemas/, workflow.json to target project; append Lash auto-trigger directive to CLAUDE.md/AGENTS.md/opencode.md |
| `nopilot init --force` | Overwrite existing files |
| `nopilot validate [specs-dir]` | Reserved for V2: JSON Schema validation of artifacts |
| `nopilot preview [specs-dir]` | Reserved for issue #21: mockup preview server |
| `nopilot version` | Print version info |

### `lash` CLI

Build runtime operations. All 15 subcommands preserved with identical argument signatures and JSON output format.

| Command | Module | Description |
|---------|--------|-------------|
| `lash preflight` | platform-launcher | Detect available platforms (claude, codex, opencode) |
| `lash plan` | plan-generator | Topological sort modules, generate batches, select tracer |
| `lash state create` | build-state | Initialize build state |
| `lash state update` | build-state | Record state transition (21 event types) |
| `lash state resume` | build-state | Resume from crash |
| `lash worktree create` | worktree-manager | Create isolated git worktree for Worker |
| `lash worktree merge` | worktree-manager | Merge worktree back to main |
| `lash worktree cleanup` | worktree-manager | Remove worktree |
| `lash package` | task-packager | Generate .lash/ task package |
| `lash spawn` | platform-launcher | Start Worker process |
| `lash check` | platform-launcher | Poll Worker completion status |
| `lash resume` | platform-launcher | Send feedback to running Worker |
| `lash cancel` | platform-launcher | Terminate Worker |
| `lash test` | test-runner | Auto-detect test runner and execute |
| `lash classify` | failure-classifier | Classify failure as L0/L1/L2/L3 |

## Migration Strategy

### Translation Order (recommended, not dependency-imposed)

All 8 Lash modules have zero cross-imports — the CLI uses lazy imports inside handler functions. The ordering below is conceptual (simplest first, CLI last since it wires everything together), not mandated by import dependencies. Steps 3-10 are parallelizable after shared types are defined in Step 2.

```
config (37 lines)
  → build-state (329 lines)
    → plan-generator (374 lines)      ─┐
    → failure-classifier (364 lines)   ─┤  independent, parallelizable
    → test-runner (262 lines)          ─┤
    → worktree-manager (272 lines)     ─┘
      → task-packager (336 lines)
        → platform-launcher (511 lines)
          → cli (432 lines, wires everything together)
```

Total: ~2,921 lines of Python → TypeScript.

### Per-Module Process

1. Read Python source
2. Translate to TypeScript, preserving JSON I/O contracts
3. Translate corresponding pytest tests to Vitest
4. Run tests, fix until passing
5. Move to next module

### Translation Mapping

| Python | TypeScript |
|--------|-----------|
| `argparse` | `commander` |
| `subprocess.run / Popen` | `child_process.execSync / spawn` |
| `pathlib.Path` | `path.join / path.resolve` |
| `json.dumps / loads` | `JSON.stringify / parse` |
| `os.environ` | `process.env` |
| `shutil.copytree` | `fs.cpSync` |
| `dataclass` | `interface` / `type` |
| `pytest` | `vitest` (`describe / it / expect`) |
| `unittest.mock.patch` | `vi.mock / vi.spyOn` |
| `tempfile.mkdtemp` | `fs.mkdtempSync` |

### Prompt File Changes

Two mechanical global replacements (no logic changes):

```diff
# Replacement 1: CLI invocation
- python3 -m lash <subcommand>
+ lash <subcommand>

# Replacement 2: internal prompt path references (5 occurrences)
- lash/prompts/<name>.md
+ commands/<name>.md
```

Additionally, 3 non-`lash-` prefixed prompt files are renamed for namespace consistency:
- `conflict_resolver.md` → `lash-conflict-resolver.md`
- `orchestrator.md` → `lash-orchestrator.md`
- `worker_instructions.md` → `lash-worker-instructions.md`

## Build & Publish Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

### package.json

```json
{
  "name": "nopilot",
  "version": "1.0.0",
  "description": "AI Native development workflow with Lash multi-agent build engine",
  "type": "module",
  "bin": {
    "nopilot": "./dist/nopilot-cli.js",
    "lash": "./dist/lash/cli.js"
  },
  "files": ["dist", "commands", "schemas", "workflow.json"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "engines": { "node": ">=18.19.0" },
  "dependencies": {
    "commander": "^13.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- Runtime dependency: commander only
- Node 18+ minimum (current LTS)
- ESM (`"type": "module"`)
- `files` includes asset directories for npm publish

## What This Migration Does NOT Do

- Does not change workflow.json semantics or version (stays 4.0)
- Does not re-run NoPilot discover/spec/build for the translation
- Does not change any prompt file logic (only `python3 -m lash` → `lash`)
- Does not implement issue #21 (frontend taste) — that comes after
- Does not set up CI/CD (recorded in ROADMAP for later)

## Post-Migration Steps

1. Archive Lash GitHub repo with redirect notice in README
2. Merge Lash ROADMAP items into NoPilot ROADMAP
3. Update NoPilot CLAUDE.md to reflect new project structure
4. Extract key design decisions from Lash specs/ into docs/lash-design-decisions.md
