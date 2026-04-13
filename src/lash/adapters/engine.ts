/**
 * Template engine for data-driven platform adapters.
 * Interpolates {placeholder} tokens in command arrays.
 */

import type { PlatformAdapter, ResumeCommandResult } from '../types.js';

/**
 * Interpolate {placeholders} in a command template array.
 * Unknown placeholders are left as-is.
 */
export function interpolateCmd(
  template: string[],
  vars: Record<string, string | undefined>,
): string[] {
  return template.map(arg =>
    arg.replace(/\{(\w+)\}/g, (match, key: string) => {
      const val = vars[key];
      return val !== undefined ? val : match;
    }),
  );
}

/**
 * Build spawn command from adapter config.
 * Uses adapter.buildSpawnCmd() override if present, otherwise template interpolation.
 */
export function buildSpawnCommand(
  adapter: PlatformAdapter,
  task: string,
  opts: { sessionId: string; instructionFile: string | null; maxBudgetUsd?: number },
): string[] {
  // Method override path (ComposioHQ pattern)
  if (adapter.buildSpawnCmd) {
    return adapter.buildSpawnCmd(task, opts);
  }

  // Data-driven path (Spec Kit pattern)
  const cmd = interpolateCmd(adapter.spawnArgs, { task, sessionId: opts.sessionId });

  // Append optional args based on data presence (implicit capability signaling)
  if (opts.instructionFile && adapter.optionalSpawnArgs?.instructionFile) {
    cmd.push(...interpolateCmd(adapter.optionalSpawnArgs.instructionFile, {
      instructionFile: opts.instructionFile,
    }));
  }
  if (opts.maxBudgetUsd !== undefined && adapter.optionalSpawnArgs?.maxBudgetUsd) {
    cmd.push(...interpolateCmd(adapter.optionalSpawnArgs.maxBudgetUsd, {
      maxBudgetUsd: String(opts.maxBudgetUsd),
    }));
  }

  return cmd;
}

/**
 * Build resume command from adapter config.
 * Uses adapter.buildResumeCmd() override if present, otherwise template interpolation.
 */
export function buildResumeCommand(
  adapter: PlatformAdapter,
  sessionId: string,
  feedback: string,
): ResumeCommandResult {
  if (adapter.buildResumeCmd) {
    return adapter.buildResumeCmd(sessionId, feedback);
  }
  return {
    cmd: interpolateCmd(adapter.resumeArgs, { sessionId, feedback }),
    mode: adapter.resumeMode,
  };
}

/**
 * Build probe command from adapter config.
 * monitorHeartbeat owns the stdio decision (['ignore', 'pipe', 'pipe']).
 */
export function buildProbeCommand(
  adapter: PlatformAdapter,
  sessionId: string,
): string[] {
  return interpolateCmd(adapter.probeArgs, { sessionId });
}
