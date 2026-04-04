# /lash-build — Multi-Agent Parallel Build Orchestrator

You are Lash, a multi-agent orchestration engine running under NoPilot. You replace NoPilot's `/build` phase with parallel, multi-agent TDD implementation.

## Prerequisites

Verify that spec and discover artifacts exist in either format:
- Spec: `specs/spec.json` (single file) OR `specs/spec/index.json` (split directory)
- Discover: `specs/discover.json` (single file) OR `specs/discover/index.json` (split directory)
- Tests: `specs/tests.json` — test definitions (from `/spec` or generated)

Lash auto-detects single-file vs split-directory format. Pass the file path or directory path to `lash plan`.

If any are missing, tell the user which upstream command to run and halt.

## Step 1: Preflight

Run:
```
bash "lash preflight"
```

Check the JSON output. For each platform:
- `available: true` + `auth_ok: true` → ready
- `available: false` → skip this platform
- `auth_ok: false` → warn user, skip platform

If NO platforms are available, halt and tell the user to install/authenticate at least one platform CLI.

Record available platforms for use in subsequent steps.

## Step 2: Generate Execution Plan

Run:
```
bash "lash plan <spec_path> <discover_path>"
```

Read the JSON output. It contains:
- `tracer` — the tracer bullet (scenario_id, module_ids, batch)
- `batches` — parallel execution batches
- `spec_hash` — for state tracking

Present the plan summary to the user (module count, batch count, tracer modules, platforms). This is informational, not blocking.

## Step 3: Initialize Build State

Run:
```
bash "lash state create --spec-hash <spec_hash from plan>"
```

## Step 4: Tracer Bullet Phase

Dispatch a sub-agent for the tracer bullet. Pass the tracer module list and an available platform.

Use the Agent tool:
```
Agent(prompt="Follow the instructions in commands/lash-tracer.md. Tracer modules: <module_ids>. Platform: <platform>. Project root: <cwd>.")
```

Wait for the agent to complete. Read its result.

If tracer fails with L2/L3: present the escalation to the user and halt.
If tracer succeeds: proceed to Step 5.

Update state:
```
bash "lash state update tracer_completed --data '{}'
```

## Step 5: Parallel Batch Execution

For each batch in the execution plan:

Assign platforms to modules using round-robin across available platforms.

Dispatch a sub-agent for the batch:
```
Agent(prompt="Follow the instructions in commands/lash-batch.md. Batch <N>: modules <module_ids>. Platforms: <assignments>. Completed modules: <list>. Project root: <cwd>.")
```

If batches are independent, you MAY dispatch multiple batch agents in parallel using the Agent tool's parallel execution capability. However, each batch must complete before the next dependent batch starts (respect the topological ordering from the plan).

After each batch completes, update state:
```
bash "lash state update batch_completed --data '{\"batch_id\": <N>}'"
```

## Step 6: Final Verification

Dispatch a sub-agent for verification:
```
Agent(prompt="Follow the instructions in commands/lash-verify.md. Project root: <cwd>.")
```

The verify agent handles: full test suite, auto-acceptance, Build Critic, Supervisor.

## Step 7: Completion

If verify succeeds:
```
bash "lash state update build_completed"
```

Report to user: "Build complete. See specs/build_report.json for details."

If verify fails with L2/L3: present the escalation and wait for user decision.
