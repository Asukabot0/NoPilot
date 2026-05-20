import type { PlatformAdapter } from '../types.js';

export const codexAdapter: PlatformAdapter = {
  name: 'codex',
  binary: 'codex',

  versionArgs: ['codex', '--version'],
  authProbeArgs: ['codex', '--version'],

  spawnArgs: ['codex', 'exec', '--full-auto', '{task}'],
  optionalSpawnArgs: {
    instructionFile: ['-c', 'system_prompt_file={instructionFile}'],
    // Codex does not support budget control
  },

  resumeArgs: ['codex', 'exec', 'resume', '--last'],
  resumeMode: 'stdin',  // feedback delivered via stdin pipe

  // Codex probe ignores sessionId — uses --last to target most recent session
  probeArgs: ['codex', 'exec', 'resume', '--last'],

  integrationText: `## Platform Integration (Codex)

Launch this Worker with:

    codex exec --full-auto -c system_prompt_file=.lash/worker-instructions.md <task>
`,
};
