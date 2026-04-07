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

// CLI output helpers (AGENTS.md: 禁止在源文件中直接 console.log)
function out(message: string): void { process.stdout.write(message + '\n'); }
function err(message: string): void { process.stderr.write(message + '\n'); }

// Resolve package root relative to this compiled file (dist/nopilot-cli.js → package root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, '..');

const LASH_DIRECTIVE_MARKER = '## Lash (Auto-triggered Multi-Agent Build Orchestrator)';

function extractLashDirective(): string {
  const claudeDevPath = resolve(PACKAGE_ROOT, 'CLAUDE.dev.md');
  try {
    const content = readFileSync(claudeDevPath, 'utf-8');
    const lines = content.split('\n');
    const startIdx = lines.findIndex(line => line.startsWith(LASH_DIRECTIVE_MARKER));
    if (startIdx === -1) {
      err(`Warning: ${LASH_DIRECTIVE_MARKER} not found in CLAUDE.dev.md`);
      return '';
    }
    const endIdx = lines.findIndex((line, idx) => idx > startIdx && line.startsWith('## '));
    const lashLines = lines.slice(startIdx, endIdx === -1 ? undefined : endIdx);
    return '\n' + lashLines.join('\n');
  } catch {
    err(`Error: Failed to read CLAUDE.dev.md from ${claudeDevPath}`);
    return '';
  }
}

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
      err(
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
          err(`Failed to install skills for ${result.platform}: ${result.errors.join(', ')}`);
        } else if (result.skipped) {
          const skippedPlatform = getPlatform(result.platform);
          const sharedWith = platformsWithVersion.find(
            p => p.name !== result.platform && p.skillsDir === skippedPlatform?.skillsDir,
          );
          out(`Skipped ${result.platform} (shares skill directory with ${sharedWith?.name})`);
        } else {
          out(`Installed ${result.filesWritten} skill file(s) for ${result.platform}`);
        }
      }
    }

    // Create specs/ directory with .gitkeep
    const specsDir = resolve(targetDir, 'specs');
    if (!existsSync(specsDir)) {
      mkdirSync(specsDir, { recursive: true });
      writeFileSync(resolve(specsDir, '.gitkeep'), '', 'utf-8');
      out(`Created specs/ directory`);
    }

    // Append Lash directive to agent instruction files (idempotent)
    const lashDirective = extractLashDirective();
    if (!lashDirective) {
      err('Warning: No Lash directive found, skipping injection');
    } else {
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
            const updated = existing.substring(0, markerIdx).trimEnd() + lashDirective;
            writeFileSync(filePath, updated, 'utf-8');
            out(`Updated Lash directive in ${filename}`);
          } else {
            out(`Skipped Lash directive in ${filename} (already present)`);
          }
          continue;
        }
        writeFileSync(filePath, existing + lashDirective, 'utf-8');
        out(`Appended Lash directive to ${filename}`);
      }
    }

    out(`\nNoPilot initialized in ${targetDir}`);
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
    out(JSON.stringify(paths, null, 2));
  });

// ─── version ────────────────────────────────────────────────────────────────

program
  .command('version')
  .description('Print the nopilot package version')
  .action(() => {
    out(`nopilot v${getVersion()}`);
  });

// ─── validate ───────────────────────────────────────────────────────────────

program
  .command('validate')
  .description('Validate project artifacts (not yet implemented)')
  .action(() => {
    out('Not yet implemented. Planned for V2.');
    process.exit(0);
  });

// ─── preview ────────────────────────────────────────────────────────────────

program
  .command('preview')
  .description('Preview generated artifacts (not yet implemented)')
  .action(() => {
    out('Not yet implemented. Planned for issue #21.');
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
