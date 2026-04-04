#!/usr/bin/env node
/**
 * NoPilot CLI — framework-level operations for initializing projects with NoPilot + Lash.
 *
 * Distribution model (OMC-style):
 * - Commands install to ~/.claude/commands/ (global, shared across projects)
 * - Schemas and workflow.json stay in the npm package (accessed via `nopilot paths`)
 * - `init` injects Lash directive into project CLAUDE.md/AGENTS.md
 * - Runtime artifacts (specs/) are local and gitignored
 */
import { Command } from 'commander';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

// Resolve package root relative to this compiled file (dist/nopilot-cli.js → package root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, '..');

const LASH_DIRECTIVE = `
## Lash (Auto-triggered Multi-Agent Build Orchestrator)

When ALL of the following conditions are met:
1. Spec artifact exists: \`specs/spec.json\` OR \`specs/spec/index.json\` (design is complete)
2. Discover artifact exists: \`specs/discover.json\` OR \`specs/discover/index.json\` (requirements are locked)
3. User intent involves building, implementing, or coding the designed system

→ Invoke \`/lash-build\` to orchestrate a multi-agent parallel build.

Lash treats each AI coding platform (Claude Code, Codex, OpenCode) as a Worker agent.
Lash auto-detects single-file vs split-directory format for spec and discover artifacts.

NoPilot schemas and workflow definition are in the npm package.
Run \`nopilot paths\` to locate them.
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

    // Install commands to ~/.claude/commands/ (global, always overwrite)
    const srcCommands = resolve(PACKAGE_ROOT, 'commands');
    const destCommands = join(homedir(), '.claude', 'commands');
    if (existsSync(srcCommands)) {
      mkdirSync(destCommands, { recursive: true });
      cpSync(srcCommands, destCommands, { recursive: true, force: true });
      console.log(`Installed commands → ${destCommands}`);
    }

    // Create specs/ directory with .gitkeep
    const specsDir = resolve(targetDir, 'specs');
    if (!existsSync(specsDir)) {
      mkdirSync(specsDir, { recursive: true });
      writeFileSync(resolve(specsDir, '.gitkeep'), '', 'utf-8');
      console.log(`Created specs/ directory`);
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
        if (force) {
          // Replace old directive with new one
          const markerIdx = existing.indexOf(LASH_DIRECTIVE_MARKER);
          const updated = existing.substring(0, markerIdx).trimEnd() + '\n' + LASH_DIRECTIVE;
          writeFileSync(filePath, updated, 'utf-8');
          console.log(`Updated Lash directive in ${filename}`);
        } else {
          console.log(`Skipped Lash directive in ${filename} (already present)`);
        }
        continue;
      }
      writeFileSync(filePath, existing + LASH_DIRECTIVE, 'utf-8');
      console.log(`Appended Lash directive to ${filename}`);
    }

    console.log(`\nNoPilot initialized in ${targetDir}`);
  });

// ─── paths ─────────────────────────────────────────────────────────────────

program
  .command('paths')
  .description('Print locations of NoPilot package assets')
  .action(() => {
    const paths = {
      package_root: PACKAGE_ROOT,
      commands: resolve(PACKAGE_ROOT, 'commands'),
      schemas: resolve(PACKAGE_ROOT, 'schemas'),
      workflow: resolve(PACKAGE_ROOT, 'workflow.json'),
      installed_commands: join(homedir(), '.claude', 'commands'),
    };
    console.log(JSON.stringify(paths, null, 2));
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
