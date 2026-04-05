/**
 * Profile config reader.
 * Reads .nopilot/config.json and returns merged config with defaults (camelCase).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProfileConfig } from './types.js';

const DEFAULTS: ProfileConfig = {
  l2Enabled: true,
  scanThresholdFiles: 500,
  stalenessThresholdHours: 24,
};

export function readConfig(rootDir: string): ProfileConfig {
  const configPath = path.join(rootDir, '.nopilot', 'config.json');

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULTS };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return { ...DEFAULTS };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ...DEFAULTS };
  }

  const partial = raw as Record<string, unknown>;

  return {
    l2Enabled: typeof partial['l2_enabled'] === 'boolean' ? partial['l2_enabled'] : DEFAULTS.l2Enabled,
    scanThresholdFiles:
      typeof partial['scan_threshold_files'] === 'number'
        ? partial['scan_threshold_files']
        : DEFAULTS.scanThresholdFiles,
    stalenessThresholdHours:
      typeof partial['staleness_threshold_hours'] === 'number'
        ? partial['staleness_threshold_hours']
        : DEFAULTS.stalenessThresholdHours,
  };
}
