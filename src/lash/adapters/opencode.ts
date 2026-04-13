import type { PlatformAdapter } from '../types.js';

export const opencodeAdapter: PlatformAdapter = {
  name: 'opencode',
  binary: 'opencode',

  versionArgs: ['opencode', '--version'],
  authProbeArgs: ['opencode', 'run', 'echo', 'ok'],

  spawnArgs: ['opencode', 'run', '{task}', '--agent', 'coder'],
  // No optionalSpawnArgs

  resumeArgs: ['opencode', 'run', '{feedback}', '--session', '{sessionId}'],
  resumeMode: 'cli-args',

  probeArgs: ['opencode', 'run', 'heartbeat probe: please respond', '--session', '{sessionId}'],

  integrationText: `## Platform Integration (OpenCode)

This file's content is prepended to the task prompt.

Launch this Worker with:

    opencode run <task> --agent coder
`,
};
