<!-- nopilot-managed v<%=VERSION%> -->
<!-- Feature Mode: This protocol applies equally to mode=greenfield and mode=feature discovers. No mode-specific behavior. -->
<!-- This file defines the dispatch protocol itself — no dispatch needed to load it. -->

# discover/dispatch-protocol — Subagent Dispatch Standard

## Context Budget (design-time targets, verified by testing)

Total main-agent context for a complete discover run: **< 200K chars** (user+assistant messages, excluding system prompts and tool schemas).

Per-stage subagent summary size limits:
- Mode Detection: < 1K chars
- Layer 1 Research: < 3K chars
- Layer 3 Generation: < 3K chars
- Artifact Writing: < 500 chars
- UI Taste (per batch): < 2K chars

## Dispatch Contract Format

Every subagent dispatch is declared as an HTML comment block in the skill markdown:

```
<!-- DISPATCH CONTRACT
  task: "{what the subagent does}"
  input: ["{file paths or directories the subagent reads}"]
  instructions: "{sub-skill file path, or inline instructions}"
  output_file: specs/{target-artifact-path}
  output_summary: {structured format} (max 20 items, <= {N}K chars)
  on_error: standard
-->
```

## Platform Invocation

Dispatch contracts are platform-agnostic. Each platform's AI agent interprets them using its native subagent mechanism:

| Platform | Mechanism | Notes |
|----------|-----------|-------|
| Claude Code | `Agent` tool | Spawns isolated subprocess with fresh context |
| Codex CLI | Subagent spawn | Uses `agents.max_depth` config, TOML agent definitions |
| OpenCode | `Task` tool | YAML-based agent config, `permission.task` rules |

The subagent receives full access to the input files and can read as much context as needed. Only the summary returned to the main agent counts against the context budget.

## Error Handling Protocol (on_error: standard)

When a subagent dispatch fails:

1. **Stop** — do not silently continue
2. **Present error** to user with context: which stage failed, what error occurred
3. **Ask**: "Retry or fallback to main agent execution?"
4. **If retry**: delete any partial `output_file`, then re-dispatch
5. **If fallback**: delete any partial `output_file`, execute the stage inline in main agent, warn user: "Running inline — context consumption will increase"

### Domain Error Mapping

All domain-specific errors from subagent modules map to three categories:

| Category | Errors | Trigger |
|----------|--------|---------|
| `error` | no_read_access, empty_directory, search_failed, index_not_found, discover_dir_not_found, incomplete_layer2, write_permission_denied, skill_not_found, stitch_mcp_unavailable, stitch_api_error, mcp_not_inherited, screen_id_not_found, req_id_not_found | Subagent completes but reports failure |
| `timeout` | Network/process hangs | Subagent does not return within platform timeout |
| `unsupported` | Platform lacks subagent support | Dispatch mechanism not available |

## Dedup Guard

If the discover skill has already been injected into the conversation context (e.g., via `/discover` command auto-injection), subsequent `Skill` tool invocations for the same skill SHALL skip re-injection. The agent should check whether the skill instructions are already present before loading.

Additionally, `/discover` command arguments SHALL NOT be appended to the skill text as an ARGUMENTS section. Arguments appear only in the user's original message.
