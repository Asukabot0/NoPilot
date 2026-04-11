/**
 * MOD-002: constraint/reporter
 *
 * Writes constraint-report.json to .lash/ on server exit.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ConstraintReport, SessionState } from './types.js';

/**
 * Build a ConstraintReport from the current session state.
 */
export function buildReport(state: SessionState): ConstraintReport {
  return {
    moduleId: state.ruleSet.moduleId,
    violations: state.violations,
    counters: {
      mcpCalls: state.mcpCallCount,
      violationsBlocked: state.violationsBlockedCount,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Write constraint-report.json to the .lash/ directory within workDir.
 * Creates .lash/ if it does not exist.
 */
export function writeReport(workDir: string, report: ConstraintReport): string {
  const lashDir = join(resolve(workDir), '.lash');
  mkdirSync(lashDir, { recursive: true });
  const reportPath = join(lashDir, 'constraint-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return reportPath;
}
