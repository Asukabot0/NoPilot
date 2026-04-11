/**
 * MOD-002: constraint/tools
 *
 * MCP tool handler implementations for the constraint enforcement server.
 * Delegates constraint checks to rule-engine. Manages session violation log.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, posix } from 'node:path';
import { checkFileOwnership, validateImport, detectCycle } from './rule-engine.js';
import type { ConstraintViolation, SessionState } from './types.js';

// ---------------------------------------------------------------------------
// Path normalization (forward-slash relative)
// ---------------------------------------------------------------------------

function normalizePath(filePath: string, workDir: string): string {
  // Replace backslashes
  const withSlashes = filePath.replace(/\\/g, '/');
  // Normalize ../ and ./
  const normalized = posix.normalize(withSlashes);
  // Remove leading slash if absolute
  return normalized.startsWith('/') ? normalized.slice(1) : normalized;
}

// ---------------------------------------------------------------------------
// Tool: nopilot_write_file
// ---------------------------------------------------------------------------

export interface WriteFileInput {
  file_path: string;
  content: string;
}

export interface WriteFileResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

/**
 * Write proxy: validates path against owned_files BEFORE any I/O.
 * Executes write only if validation passes.
 */
export function handleWriteFile(
  state: SessionState,
  workDir: string,
  input: WriteFileInput,
): WriteFileResult {
  state.mcpCallCount += 1;

  const normalizedPath = normalizePath(input.file_path, workDir);
  const { allowed, violation } = checkFileOwnership(state.ruleSet, normalizedPath);

  if (!allowed && violation !== null) {
    state.violations.push(violation);
    state.violationsBlockedCount += 1;
    return {
      content: [{ type: 'text', text: JSON.stringify(violation) }],
      isError: true,
    };
  }

  // Write is allowed — execute it
  const absPath = resolve(workDir, normalizedPath);
  try {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, input.content, 'utf8');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `WRITE_FAILED: ${errMsg}`, code: 'WRITE_FAILED' }),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: 'text', text: `Written: ${normalizedPath}` }],
    isError: false,
  };
}

// ---------------------------------------------------------------------------
// Tool: nopilot_validate_import
// ---------------------------------------------------------------------------

export interface ValidateImportInput {
  source_path: string;
  import_target_path: string;
}

export interface ValidateImportResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

export function handleValidateImport(
  state: SessionState,
  input: ValidateImportInput,
): ValidateImportResult {
  state.mcpCallCount += 1;

  let importResult: { allowed: boolean; violation: ConstraintViolation | null };
  try {
    importResult = validateImport(state.ruleSet, input.source_path, input.import_target_path);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: errMsg, code: 'UNRESOLVABLE_PATH' }) }],
      isError: true,
    };
  }

  // Also check for cycle
  let cycleResult: { hasCycle: boolean; cyclePath: string[] | null } = {
    hasCycle: false,
    cyclePath: null,
  };

  // Resolve source and target to modules for cycle check
  const normalSource = input.source_path.replace(/\\/g, '/');
  const normalTarget = input.import_target_path.replace(/\\/g, '/');
  const sourceModule = state.ruleSet.allModules.find((m) =>
    m.ownedFiles.some((p) => normalSource.startsWith(p.replace('/**', '').replace('/*', ''))),
  );
  const targetModule = state.ruleSet.allModules.find((m) =>
    m.ownedFiles.some((p) => normalTarget.startsWith(p.replace('/**', '').replace('/*', ''))),
  );

  if (sourceModule && targetModule && sourceModule.id !== targetModule.id) {
    cycleResult = detectCycle(state.ruleSet, sourceModule.id, targetModule.id);
  }

  const response = {
    allowed: importResult.allowed && !cycleResult.hasCycle,
    violation: importResult.violation ?? (cycleResult.hasCycle
      ? ({
          ruleId: `circular-dep-${sourceModule?.id ?? 'unknown'}`,
          ruleType: 'circular_dep' as const,
          violatingPath: normalTarget,
          owningModuleId: targetModule?.id ?? null,
          suggestedFix: `This import would create a circular dependency: ${cycleResult.cyclePath?.join(' -> ')}. Refactor to break the cycle.`,
        } satisfies ConstraintViolation)
      : null),
    cycle_detected: cycleResult.hasCycle,
    cycle_path: cycleResult.cyclePath,
  };

  if (!response.allowed && response.violation) {
    state.violations.push(response.violation);
    state.violationsBlockedCount += 1;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(response) }],
    isError: false,
  };
}

// ---------------------------------------------------------------------------
// Tool: nopilot_read_constraints
// ---------------------------------------------------------------------------

export interface ReadConstraintsResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

export function handleReadConstraints(state: SessionState | null): ReadConstraintsResult {
  if (state === null) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'NO_MODULE_CONTEXT: constraint server has no valid module context',
            code: 'NO_MODULE_CONTEXT',
          }),
        },
      ],
      isError: true,
    };
  }

  const { ruleSet } = state;
  const response = {
    moduleId: ruleSet.moduleId,
    ownedFiles: ruleSet.ownedFiles,
    allowedDependencies: ruleSet.allowedDependencies.map((d) => ({
      moduleId: d.moduleId,
      name: d.moduleId,
    })),
    ruleCount: ruleSet.rules.length,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(response) }],
    isError: false,
  };
}
