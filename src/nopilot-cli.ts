#!/usr/bin/env node
/**
 * NoPilot CLI — framework-level operations for initializing projects with NoPilot + Lash.
 *
 * Distribution model (OMC-style):
 * - Skills install to host skill directories (global, shared across projects)
 * - Schemas and workflow.json stay in the npm package (accessed via `nopilot paths`)
 * - `init` injects Lash directive into project CLAUDE.md/AGENTS.md
 * - Runtime artifacts (specs/) are local and gitignored
 */
import { Command } from 'commander';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { installAllPlatforms, scanSourceSkills } from './skill-engine/skill-installer.js';
import {
  detectLegacyFiles,
  promptAndClean,
  isWithinMigrationWindow,
  MIGRATION_SINCE_VERSION,
} from './skill-engine/legacy-migrator.js';
import { getActivePlatforms, getPlatform } from './skill-engine/platform-registry.js';

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
  .action(async (dir: string | undefined, options: { force: boolean }) => {
    const targetDir = resolve(dir ?? process.cwd());
    const force = options.force;
    const sourceDir = resolve(PACKAGE_ROOT, 'commands');

    // Deprecation warning if within migration window
    const currentVersion = getVersion();
    const { active, versionsRemaining } = isWithinMigrationWindow(currentVersion, MIGRATION_SINCE_VERSION);
    if (active) {
      console.warn(
        `[nopilot] Deprecation notice: Legacy skill locations (e.g. ~/.claude/commands/) are being replaced ` +
        `by unified skill directories. Migration window closes in ${versionsRemaining} minor version(s). ` +
        `Run \`nopilot init\` to migrate now.`,
      );
    }

    // For each active platform: detect and prompt to clean legacy files before installing
    const activePlatforms = getActivePlatforms();
    const knownSkillNames = existsSync(sourceDir)
      ? scanSourceSkills(sourceDir).map((s) => s.name)
      : [];

    for (const platform of activePlatforms) {
      if (!platform.legacyDir) continue;
      const { managed, modified } = detectLegacyFiles(platform.legacyDir, knownSkillNames);
      if (managed.length > 0 || modified.length > 0) {
        await promptAndClean(managed, modified, process.stdin);
      }
    }

    // Install skills to each active platform's skillsDir
    // Inject VERSION into each platform's placeholderMap so templates can render it
    const platformsWithVersion = activePlatforms.map((p) => ({
      ...p,
      placeholderMap: { ...p.placeholderMap, VERSION: currentVersion },
    }));

    if (existsSync(sourceDir)) {
      const results = installAllPlatforms(sourceDir, force, platformsWithVersion);
      for (const result of results) {
        if (!result.success) {
          console.error(`Failed to install skills for ${result.platform}: ${result.errors.join(', ')}`);
        } else if (result.skipped) {
          const skippedPlatform = getPlatform(result.platform);
          const sharedWith = platformsWithVersion.find(
            p => p.name !== result.platform && p.skillsDir === skippedPlatform?.skillsDir,
          );
          console.log(`Skipped ${result.platform} (shares skill directory with ${sharedWith?.name})`);
        } else {
          console.log(`Installed ${result.filesWritten} skill file(s) for ${result.platform}`);
        }
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
    const activePlatforms = getActivePlatforms();
    const paths = {
      package_root: PACKAGE_ROOT,
      commands: resolve(PACKAGE_ROOT, 'commands'),
      codex_prompts: resolve(PACKAGE_ROOT, 'prompts', 'codex'),
      source_skill_location: resolve(PACKAGE_ROOT, 'commands'),
      schemas: resolve(PACKAGE_ROOT, 'schemas'),
      workflow: resolve(PACKAGE_ROOT, 'workflow.json'),
      installed_skills: Object.fromEntries(
        activePlatforms.map((p) => [p.name, p.skillsDir]),
      ),
      legacy_dirs: Object.fromEntries(
        activePlatforms.filter((p) => p.legacyDir).map((p) => [p.name, p.legacyDir]),
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
