/**
 * MOD-002: constraint/server
 *
 * MCP server running as agent child process via stdio transport.
 * Exposes 3 MCP tools: nopilot_write_file, nopilot_validate_import, nopilot_read_constraints.
 * Writes constraint-report.json to .lash/ on exit.
 *
 * Entry point: node constraint-server.js --spec <path> --module <id> --workdir <path>
 */
import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types';
import { extractRules } from './rule-engine.js';
import { handleWriteFile, handleValidateImport, handleReadConstraints } from './tools.js';
import { buildReport, writeReport } from './reporter.js';
import type { SessionState } from './types.js';

// ---------------------------------------------------------------------------
// Server state machine: initializing -> ready -> processing -> shutting_down
// ---------------------------------------------------------------------------

export type ServerPhase = 'initializing' | 'ready' | 'processing' | 'shutting_down';

export interface ConstraintServerOptions {
  specPath: string;
  moduleId: string;
  workDir: string;
}

/**
 * Create and start the constraint MCP server.
 * Returns the server instance for testing.
 */
export async function startServer(options: ConstraintServerOptions): Promise<Server> {
  const { specPath, moduleId, workDir } = options;

  let phase: ServerPhase = 'initializing';

  // Initialize rule set — exit on failure
  let ruleSet;
  try {
    ruleSet = extractRules(specPath, moduleId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[ERROR] constraint-server: INIT_FAILED — ${msg}\n`);
    process.exit(1);
  }

  const sessionState: SessionState = {
    ruleSet,
    violations: [],
    mcpCallCount: 0,
    violationsBlockedCount: 0,
  };

  phase = 'ready';

  // Create MCP server
  const server = new Server(
    { name: 'nopilot-constraint-server', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'nopilot_write_file',
          description:
            'Write proxy: validates file path against module owned_files before writing. Blocks writes to non-owned paths.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Path to write (absolute or relative)' },
              content: { type: 'string', description: 'File content to write' },
            },
            required: ['file_path', 'content'],
          },
        },
        {
          name: 'nopilot_validate_import',
          description:
            'Validate whether an import from source_path to import_target_path is allowed by the dependency graph.',
          inputSchema: {
            type: 'object',
            properties: {
              source_path: { type: 'string', description: 'File that contains the import' },
              import_target_path: { type: 'string', description: 'The imported file path' },
            },
            required: ['source_path', 'import_target_path'],
          },
        },
        {
          name: 'nopilot_read_constraints',
          description:
            'Read the full ConstraintRuleSet for the current module: owned files, allowed dependencies, rule count.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    phase = 'processing';
    const { name, arguments: args } = request.params;

    let result;
    try {
      if (name === 'nopilot_write_file') {
        const input = args as { file_path: string; content: string };
        result = handleWriteFile(sessionState, workDir, {
          file_path: input.file_path,
          content: input.content,
        });
      } else if (name === 'nopilot_validate_import') {
        const input = args as { source_path: string; import_target_path: string };
        result = handleValidateImport(sessionState, {
          source_path: input.source_path,
          import_target_path: input.import_target_path,
        });
      } else if (name === 'nopilot_read_constraints') {
        result = handleReadConstraints(sessionState);
      } else {
        result = {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }
    } finally {
      phase = 'ready';
    }

    return result! as CallToolResult;
  });

  // Write report on process exit
  const writeReportAndExit = () => {
    phase = 'shutting_down';
    const report = buildReport(sessionState);
    try {
      writeReport(workDir, report);
      process.stderr.write(
        `[INFO] constraint-server: session ended — mcpCalls=${report.counters.mcpCalls}, blocked=${report.counters.violationsBlocked}\n`,
      );
    } catch (err) {
      process.stderr.write(`[WARN] constraint-server: failed to write report: ${err}\n`);
    }
  };

  process.on('exit', writeReportAndExit);
  process.on('SIGTERM', () => {
    writeReportAndExit();
    process.exit(0);
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}
