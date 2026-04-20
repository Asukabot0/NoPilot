/**
 * MOD-003: constraint/config-generator
 *
 * Generates per-platform MCP config files that declare the constraint-server
 * as a stdio command. Integrates with Lash task-packager's generatePackage()
 * flow and provides Worker Instructions with MCP tool usage guidance.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type McpPlatform = 'claude-code' | 'codex' | 'opencode';

export interface McpConfigResult {
  /** Absolute path to the written config file */
  configPath: string;
  /** Content written to the config file */
  configContent: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the args array for the constraint-server stdio command.
 * Resolves the constraint-server binary relative to this package.
 */
function buildServerArgs(specPath: string, moduleId: string, worktreePath: string): string[] {
  // Reference the compiled constraint-server entry point
  const serverBin = join(dirname(new URL(import.meta.url).pathname), 'constraint-server.js');
  return [serverBin, '--spec', specPath, '--module', moduleId, '--workdir', worktreePath];
}

function writeConfig(configPath: string, content: string): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Platform-specific config generators
// ---------------------------------------------------------------------------

function generateClaudeCodeConfig(
  specPath: string,
  moduleId: string,
  worktreePath: string,
): McpConfigResult {
  const configPath = join(worktreePath, '.claude', 'settings.local.json');
  const args = buildServerArgs(specPath, moduleId, worktreePath);

  const config = {
    mcpServers: {
      'nopilot-constraint': {
        command: 'node',
        args,
      },
    },
  };

  const configContent = JSON.stringify(config, null, 2);
  writeConfig(configPath, configContent);
  return { configPath, configContent };
}

function generateOpenCodeConfig(
  specPath: string,
  moduleId: string,
  worktreePath: string,
): McpConfigResult {
  const configPath = join(worktreePath, 'opencode.json');
  const args = buildServerArgs(specPath, moduleId, worktreePath);

  const config = {
    mcpServers: {
      'nopilot-constraint': {
        command: 'node',
        args,
      },
    },
  };

  const configContent = JSON.stringify(config, null, 2);
  writeConfig(configPath, configContent);
  return { configPath, configContent };
}

function generateCodexConfig(
  specPath: string,
  moduleId: string,
  worktreePath: string,
): McpConfigResult {
  const configPath = join(worktreePath, 'codex.json');
  const args = buildServerArgs(specPath, moduleId, worktreePath);

  // Codex uses a JSON MCP config format with mcp_servers for stdio servers
  const config = {
    mcp_servers: {
      'nopilot-constraint': {
        type: 'stdio',
        command: 'node',
        args,
      },
    },
  };

  const configContent = JSON.stringify(config, null, 2);
  writeConfig(configPath, configContent);
  return { configPath, configContent };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a platform-specific MCP config file that registers the
 * nopilot-constraint server as a stdio MCP server.
 *
 * @param platform - Target platform: 'claude-code' | 'codex' | 'opencode'
 * @param specPath - Absolute path to spec.json
 * @param moduleId - Module ID being built (e.g. 'MOD-003')
 * @param worktreePath - Absolute path to the worker worktree root
 * @returns { configPath, configContent }
 * @throws Error with code UNSUPPORTED_PLATFORM for unknown platforms
 */
export function generateMcpConfig(
  platform: McpPlatform,
  specPath: string,
  moduleId: string,
  worktreePath: string,
): McpConfigResult {
  switch (platform) {
    case 'claude-code':
      return generateClaudeCodeConfig(specPath, moduleId, worktreePath);
    case 'opencode':
      return generateOpenCodeConfig(specPath, moduleId, worktreePath);
    case 'codex':
      return generateCodexConfig(specPath, moduleId, worktreePath);
    default: {
      const p = platform as string;
      throw new Error(
        `UNSUPPORTED_PLATFORM: '${p}' is not a supported platform. ` +
          `Expected one of: claude-code, codex, opencode`,
      );
    }
  }
}

/**
 * Returns prompt text instructing the worker agent to prefer nopilot_write_file
 * over native Write/Edit tools when the constraint MCP server is active.
 *
 * @param platform - Target platform (currently returns the same text for all)
 */
export function getMcpWorkerInstructions(platform: McpPlatform): string {
  return [
    `## NoPilot Constraint Server Active (${platform})`,
    ``,
    `A constraint enforcement MCP server is running for this session.`,
    ``,
    `**Important**: Use \`nopilot_write_file\` instead of native Write or Edit tools`,
    `when creating or modifying files. This ensures file-ownership constraints are`,
    `enforced and violations are logged correctly.`,
    ``,
    `### Available MCP Tools`,
    ``,
    `- \`nopilot_write_file(file_path, content)\` — Write-proxy that validates path`,
    `  against your module's owned_files before writing. Prefer this over Write/Edit.`,
    `- \`nopilot_validate_import(source_path, import_target_path)\` — Check whether`,
    `  an import is allowed by the dependency graph before adding it.`,
    `- \`nopilot_read_constraints()\` — Read the full ConstraintRuleSet for this module.`,
    ``,
    `### Why This Matters`,
    ``,
    `The constraint server tracks every file write and import. Using native Write/Edit`,
    `instead of \`nopilot_write_file\` bypasses constraint checks and produces an`,
    `incomplete violation report. Always prefer \`nopilot_write_file\`.`,
  ].join('\n');
}
