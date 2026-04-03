#!/usr/bin/env node
/**
 * NoPilot CLI — framework-level operations for initializing projects with NoPilot + Lash.
 */
import { Command } from 'commander';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve package root relative to this compiled file (dist/nopilot-cli.js → package root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, '..');

const LASH_DIRECTIVE = `
## Lash (Auto-triggered Multi-Agent Build Orchestrator)

When ALL of the following conditions are met:
1. \`lash/\` directory exists in this project
2. \`specs/spec.json\` exists (design is complete)
3. \`specs/discover.json\` exists (requirements are locked)
4. User intent involves building, implementing, or coding the designed system

→ Automatically follow \`commands/lash-build.md\` to orchestrate a multi-agent parallel build.

Lash treats each AI coding platform (Claude Code, Codex, OpenCode) as a Worker agent.
`;

const LASH_DIRECTIVE_MARKER = '## Lash (Auto-triggered Multi-Agent Build Orchestrator)';

const program = new Command();

program
  .name('nopilot')
  .description('AI Native development workflow framework CLI')
  .version(getVersion());

// ─── init ───────────────────────────────────────────────────────────────────

program
  .command('init [dir]')
  .description('Initialize a project with NoPilot + Lash')
  .option('--force', 'overwrite existing files', false)
  .action((dir: string | undefined, options: { force: boolean }) => {
    const targetDir = resolve(dir ?? process.cwd());
    const force = options.force;

    // Copy commands/*.md → <dir>/.claude/commands/
    const srcCommands = resolve(PACKAGE_ROOT, 'commands');
    const destCommands = resolve(targetDir, '.claude', 'commands');
    if (existsSync(srcCommands)) {
      mkdirSync(destCommands, { recursive: true });
      cpSync(srcCommands, destCommands, { recursive: true, force });
      console.log(`Copied commands/ → ${destCommands}`);
    }

    // Copy schemas/*.json → <dir>/schemas/
    const srcSchemas = resolve(PACKAGE_ROOT, 'schemas');
    const destSchemas = resolve(targetDir, 'schemas');
    if (existsSync(srcSchemas)) {
      mkdirSync(destSchemas, { recursive: true });
      cpSync(srcSchemas, destSchemas, { recursive: true, force });
      console.log(`Copied schemas/ → ${destSchemas}`);
    }

    // Copy workflow.json → <dir>/workflow.json
    const srcWorkflow = resolve(PACKAGE_ROOT, 'workflow.json');
    const destWorkflow = resolve(targetDir, 'workflow.json');
    if (existsSync(srcWorkflow)) {
      if (force || !existsSync(destWorkflow)) {
        const content = readFileSync(srcWorkflow, 'utf-8');
        writeFileSync(destWorkflow, content, 'utf-8');
        console.log(`Copied workflow.json → ${destWorkflow}`);
      } else {
        console.log(`Skipped workflow.json (already exists, use --force to overwrite)`);
      }
    }

    // Append Lash directive to agent instruction files (idempotent)
    const agentFiles = ['CLAUDE.md', 'AGENTS.md', 'opencode.md'];
    for (const filename of agentFiles) {
      const filePath = resolve(targetDir, filename);
      if (!existsSync(filePath)) {
        continue;
      }
      const existing = readFileSync(filePath, 'utf-8');
      if (existing.includes(LASH_DIRECTIVE_MARKER)) {
        console.log(`Skipped Lash directive in ${filename} (already present)`);
        continue;
      }
      writeFileSync(filePath, existing + LASH_DIRECTIVE, 'utf-8');
      console.log(`Appended Lash directive to ${filename}`);
    }

    console.log(`\nNoPilot initialized in ${targetDir}`);
  });

// ─── version ────────────────────────────────────────────────────────────────

program
  .command('version')
  .description('Print the nopilot package version')
  .action(() => {
    console.log(`nopilot v${getVersion()}`);
  });

// ─── validate ───────────────────────────────────────────────────────────────

program
  .command('validate')
  .description('Validate project artifacts (not yet implemented)')
  .action(() => {
    console.log('Not yet implemented. Planned for V2.');
    process.exit(0);
  });

// ─── preview ────────────────────────────────────────────────────────────────

program
  .command('preview')
  .description('Preview generated artifacts (not yet implemented)')
  .action(() => {
    console.log('Not yet implemented. Planned for issue #21.');
    process.exit(0);
  });

program.parse(process.argv);

// ─── helpers ────────────────────────────────────────────────────────────────

function getVersion(): string {
  const pkgPath = resolve(PACKAGE_ROOT, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}
