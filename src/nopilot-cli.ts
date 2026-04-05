#!/usr/bin/env node
/**
 * NoPilot CLI — framework-level operations for initializing projects with NoPilot + Lash.
 *
 * Distribution model (OMC-style):
 * - Commands install to host prompt directories (global, shared across projects)
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

→ Invoke the installed Lash build prompt to orchestrate a multi-agent parallel build:
  - Claude Code: \`/lash-build\`
  - Codex: \`/prompts:lash-build\`

Lash treats each AI coding platform (Claude Code, Codex, OpenCode) as a Worker agent.
Lash auto-detects single-file vs split-directory format for spec and discover artifacts.

NoPilot schemas and workflow definition are in the npm package.
Run \`nopilot paths\` to locate them.
`;

const LASH_DIRECTIVE_MARKER = '## Lash (Auto-triggered Multi-Agent Build Orchestrator)';
const PROMPT_ASSETS = {
  claude: {
    sourceDir: resolve(PACKAGE_ROOT, 'commands'),
    destDir: join(homedir(), '.claude', 'commands'),
  },
  codex: {
    sourceDir: resolve(PACKAGE_ROOT, 'prompts', 'codex'),
    destDir: join(homedir(), '.codex', 'prompts'),
  },
} as const;

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

    // Install commands to host prompt directories (global, always overwrite)
    for (const [host, asset] of Object.entries(PROMPT_ASSETS)) {
      if (existsSync(asset.sourceDir)) {
        mkdirSync(asset.destDir, { recursive: true });
        cpSync(asset.sourceDir, asset.destDir, { recursive: true, force: true });
        console.log(`Installed prompt files for ${host} → ${asset.destDir}`);
      }
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
      codex_prompts: resolve(PACKAGE_ROOT, 'prompts', 'codex'),
      source_prompt_locations: Object.fromEntries(
        Object.entries(PROMPT_ASSETS).map(([host, asset]) => [host, asset.sourceDir]),
      ),
      schemas: resolve(PACKAGE_ROOT, 'schemas'),
      workflow: resolve(PACKAGE_ROOT, 'workflow.json'),
      installed_commands: PROMPT_ASSETS.claude.destDir,
      installed_command_locations: Object.fromEntries(
        Object.entries(PROMPT_ASSETS).map(([host, asset]) => [host, asset.destDir]),
      ),
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
