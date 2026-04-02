#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NOPILOT_CONTEXT='## NoPilot

AI Native development workflow. Run `/discover` → `/spec` → `/build` in order.

- `/discover` — Requirement space exploration (direction → MVP → requirement lock)
- `/spec` — Constrained design expansion (modules, interfaces, data models)
- `/build` — Autonomous TDD implementation (tracer bullet, per-module TDD, auto-acceptance)

Artifacts live in `specs/`. Refer to `workflow.json` for state machines and guardrails.

Supervisor (intent guardian) and Critic (independent challenger) are core guardrails spawned at stage boundaries. Cannot be disabled.'

usage() {
  cat <<'USAGE'
NoPilot Installer

Usage:
  install.sh --global             Install commands to ~/.claude/commands/ (available in all projects)
  install.sh --project [path]     Install everything into a project directory (default: current dir)
  install.sh --help               Show this message

Global install:
  Commands are available in all Claude Code sessions.
  You still need to run --project in each project for workflow.json, specs/, and CLAUDE.md context.

Project install:
  Copies commands, workflow.json, creates specs/, and appends NoPilot context to CLAUDE.md.
  Self-contained — everything the project needs to run NoPilot.
USAGE
}

append_claude_md() {
  local target_dir="$1"
  local claude_md="${target_dir}/CLAUDE.md"

  if [ -f "$claude_md" ] && grep -q "## NoPilot" "$claude_md"; then
    echo "  CLAUDE.md already contains NoPilot section, skipping"
    return
  fi

  if [ -f "$claude_md" ]; then
    printf '\n%s\n' "$NOPILOT_CONTEXT" >> "$claude_md"
    echo "  Appended NoPilot section to CLAUDE.md"
  else
    printf '%s\n' "$NOPILOT_CONTEXT" > "$claude_md"
    echo "  Created CLAUDE.md with NoPilot section"
  fi
}

install_global() {
  local target="$HOME/.claude/commands"
  mkdir -p "$target"

  for cmd in discover.md spec.md build.md supervisor.md critic.md; do
    cp "${SCRIPT_DIR}/.claude/commands/${cmd}" "${target}/${cmd}"
  done

  echo "Global install complete:"
  echo "  Commands installed to ~/.claude/commands/"
  echo ""
  echo "Next: run 'install.sh --project' in each project directory"
  echo "  to set up workflow.json, specs/, and CLAUDE.md context."
}

install_project() {
  local target_dir="${1:-.}"
  target_dir="$(cd "$target_dir" && pwd)"

  mkdir -p "${target_dir}/.claude/commands"
  mkdir -p "${target_dir}/specs"

  # Copy commands
  for cmd in discover.md spec.md build.md supervisor.md critic.md; do
    cp "${SCRIPT_DIR}/.claude/commands/${cmd}" "${target_dir}/.claude/commands/${cmd}"
  done

  # Copy workflow.json
  cp "${SCRIPT_DIR}/workflow.json" "${target_dir}/workflow.json"

  # Copy README_AGENT.md
  cp "${SCRIPT_DIR}/README_AGENT.md" "${target_dir}/README_AGENT.md"

  # Append to CLAUDE.md
  append_claude_md "$target_dir"

  echo "Project install complete:"
  echo "  ${target_dir}/.claude/commands/  (5 commands)"
  echo "  ${target_dir}/workflow.json"
  echo "  ${target_dir}/specs/"
  echo "  ${target_dir}/CLAUDE.md"
  echo "  ${target_dir}/README_AGENT.md"
  echo ""
  echo "Start with: claude → /discover"
}

# Parse arguments
case "${1:-}" in
  --global)
    install_global
    ;;
  --project)
    install_project "${2:-}"
    ;;
  --help|-h)
    usage
    ;;
  "")
    usage
    exit 1
    ;;
  *)
    echo "Unknown option: $1"
    usage
    exit 1
    ;;
esac
