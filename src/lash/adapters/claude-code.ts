import type { PlatformAdapter } from '../types.js';

export const claudeCodeAdapter: PlatformAdapter = {
  name: 'claude-code',
  binary: 'claude',

  versionArgs: ['claude', '--version'],
  authProbeArgs: ['claude', '-p', 'hi', '--max-budget-usd', '0.01'],

  spawnArgs: ['claude', '-p', '{task}', '--session-id', '{sessionId}',
              '--permission-mode', 'bypassPermissions'],
  optionalSpawnArgs: {
    instructionFile: ['--append-system-prompt-file', '{instructionFile}'],
    maxBudgetUsd: ['--max-budget-usd', '{maxBudgetUsd}'],
  },

  resumeArgs: ['claude', '--resume', '{sessionId}', '-p', '{feedback}'],
  resumeMode: 'cli-args',

  probeArgs: ['claude', '--resume', '{sessionId}', '-p', 'heartbeat probe: please respond'],

  integrationText: `## Platform Integration (Claude Code)

Launch this Worker with:

    claude -p <task> --session-id <uuid> --permission-mode bypassPermissions --append-system-prompt-file .lash/worker-instructions.md
`,
};
