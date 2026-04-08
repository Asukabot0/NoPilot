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
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
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
import { createReviewTicket, applyHumanReview } from './benchmark/review-store.js';
import { createAdapterRegistry } from './benchmark/adapter-registry.js';
import { executeRunAdapter } from './benchmark/adapter-runner.js';
import { loadBenchmarkCase } from './benchmark/case-loader.js';
import { writeEventLog } from './benchmark/event-log-writer.js';
import { prepareRunWorkspace } from './benchmark/fixture-workspace.js';
import { buildJsonReport, buildMarkdownReport } from './benchmark/reporter.js';
import { getPhase1RunProfile } from './benchmark/run-profile.js';
import { writeStandardRunDirectory } from './benchmark/run-writer.js';
import { deriveSemanticEvents } from './benchmark/semantic-mapper.js';
import { resolveCaseSelector } from './benchmark/suite-manifest.js';
import { extractObservationEvents, type BenchmarkArtifactChange, type BenchmarkTranscriptRecord } from './benchmark/trace-extractor.js';
import { composeVerdict, writeVerdictArtifact } from './benchmark/verdict-writer.js';
import type { BenchmarkRunMetadata, BenchmarkValidationError, BenchmarkOracle } from './benchmark/types.js';

// CLI output helpers (AGENTS.md: 禁止在源文件中直接 console.log)
function out(message: string): void { process.stdout.write(message + '\n'); }
function err(message: string): void { process.stderr.write(message + '\n'); }

// Resolve package root relative to this compiled file (dist/nopilot-cli.js → package root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, '..');
const DEFAULT_BENCHMARK_ROOT = resolve(PACKAGE_ROOT, 'benchmark');
const DEFAULT_TRACE_EXTRACTOR_VERSION = 'benchmark-trace-v1';

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

// ─── benchmark ──────────────────────────────────────────────────────────────

const benchmark = program
  .command('benchmark')
  .description('Run local benchmark validation, execution, evaluation, reporting, and review workflows');

benchmark
  .command('validate-case <selector>')
  .description('Validate one benchmark case, a suite id, or a selector within the benchmark root')
  .option('--benchmark-root <path>', 'path to the benchmark root', DEFAULT_BENCHMARK_ROOT)
  .action(async (selector: string, options: { benchmarkRoot: string }) => {
    await runBenchmarkCommand(() => {
      const benchmarkRoot = resolve(options.benchmarkRoot);
      const caseDirs = resolveCaseSelector(selector, benchmarkRoot);
      const cases = caseDirs.map((caseDir) => {
        const bundle = loadBenchmarkCase(caseDir, benchmarkRoot);
        return {
          case_id: bundle.case.id,
          case_version: bundle.case.case_version,
          run_profile: bundle.case.run_profile,
          fixture_hash: bundle.fixture_hash,
          case_dir: caseDir,
        };
      });

      return {
        command_group: 'benchmark',
        subcommand: 'validate-case',
        cases,
      };
    });
  });

benchmark
  .command('run <selector>')
  .description('Launch one or more benchmark cases through a local CLI adapter')
  .option('--benchmark-root <path>', 'path to the benchmark root', DEFAULT_BENCHMARK_ROOT)
  .option('--output-root <path>', 'directory for benchmark run outputs', join(process.cwd(), '.nopilot', 'benchmark', 'runs'))
  .option('--platform <platformId>', 'adapter platform id', 'codex-cli')
  .option('--model <modelId>', 'model id forwarded to the adapter', 'gpt-5.4')
  .option('--workflow-version <value>', 'workflow version stored in run metadata', `nopilot-cli-v${getVersion()}`)
  .action(async (
    selector: string,
    options: {
      benchmarkRoot: string;
      outputRoot: string;
      platform: string;
      model: string;
      workflowVersion: string;
    },
  ) => {
    await runBenchmarkCommand(async () => {
      const benchmarkRoot = resolve(options.benchmarkRoot);
      const outputRoot = resolve(options.outputRoot);
      const caseDirs = resolveCaseSelector(selector, benchmarkRoot);
      const registry = createAdapterRegistry();
      const runs = [];

      for (const [index, caseDir] of caseDirs.entries()) {
        const bundle = loadBenchmarkCase(caseDir, benchmarkRoot);
        const profile = getPhase1RunProfile(bundle.case.run_profile);
        const runId = formatRunId(bundle.case.id, index);
        const workspace = prepareRunWorkspace(bundle, runId, process.cwd());
        const adapterResult = await executeRunAdapter(
          {
            platform_id: options.platform,
            model_id: options.model,
            workspace_path: workspace.workspace_path,
            prompt_path: join(caseDir, 'prompt.txt'),
            profile,
            timeout_seconds: bundle.case.budget.timeout_seconds,
          },
          { registry },
        );
        const metadata: BenchmarkRunMetadata = {
          run_id: runId,
          case_id: bundle.case.id,
          case_version: bundle.case.case_version,
          platform_id: options.platform,
          model_id: options.model,
          workflow_version: options.workflowVersion,
          repo_fixture_hash: bundle.fixture_hash,
          trace_extractor_version: DEFAULT_TRACE_EXTRACTOR_VERSION,
          run_profile: profile.profile_id,
        };
        const runOutput = writeStandardRunDirectory(metadata, adapterResult, outputRoot);

        runs.push({
          run_id: runId,
          case_id: bundle.case.id,
          case_version: bundle.case.case_version,
          run_dir: runOutput.run_dir,
          metadata_path: runOutput.metadata_path,
          transcript_path: runOutput.transcript_path,
          repo_fixture_hash: bundle.fixture_hash,
        });
      }

      return {
        command_group: 'benchmark',
        subcommand: 'run',
        output_root: outputRoot,
        platform_id: options.platform,
        model_id: options.model,
        runs,
      };
    });
  });

benchmark
  .command('evaluate <runPath>')
  .description('Extract trace events and compose verdicts for one run directory or a runs root')
  .option('--benchmark-root <path>', 'path to the benchmark root', DEFAULT_BENCHMARK_ROOT)
  .action(async (runPath: string, options: { benchmarkRoot: string }) => {
    await runBenchmarkCommand(async () => {
      const benchmarkRoot = resolve(options.benchmarkRoot);
      const runDirs = resolveRunDirectories(runPath);
      const runs = [];

      for (const runDir of runDirs) {
        const metadata = readJsonFile<BenchmarkRunMetadata>(join(runDir, 'metadata.json'));
        const oraclePath = join(benchmarkRoot, 'cases', metadata.case_id, 'oracle.json');
        const oracle = readJsonFile<BenchmarkOracle>(oraclePath);
        const transcript = readTranscriptRecords(runDir);
        const observationEvents = extractObservationEvents({
          transcript,
          artifact_changes: collectArtifactChanges(join(runDir, 'artifacts')),
        });
        const semanticResult = deriveSemanticEvents(observationEvents);
        const requiredEventsMet = mapRequiredEvents(semanticResult.semantic_events);
        const oracleCheck = evaluateOracleChecks(oracle, runDir, requiredEventsMet);
        const traceLog = writeEventLog({
          destination_path: join(runDir, 'event-log.json'),
          run_id: metadata.run_id,
          observation_events: observationEvents,
          semantic_events: semanticResult.semantic_events,
          warnings: semanticResult.warnings,
        });
        const verdict = composeVerdict({
          run_id: metadata.run_id,
          oracle_result: {
            outcome_checks_passed: oracleCheck.outcome_checks_passed,
            required_events_met: requiredEventsMet,
            failure_tags: oracleCheck.failure_tags,
            ambiguity_reasons: oracleCheck.ambiguity_reasons,
            trace_warnings: traceLog.warnings,
          },
          run_metrics: deriveRunMetrics(traceLog.warnings, requiredEventsMet.length),
          evidence_paths: {
            transcript: 'transcript.jsonl',
            event_log: 'event-log.json',
            artifacts: 'artifacts',
          },
        });
        const writtenVerdict = writeVerdictArtifact(join(runDir, 'verdict.json'), verdict);
        if (writtenVerdict.human_review_required) {
          createReviewTicket({
            run_dir: runDir,
            review_reason: writtenVerdict.review_reason,
            failure_tags: writtenVerdict.failure_tags,
          });
        }

        runs.push({
          run_id: metadata.run_id,
          case_id: metadata.case_id,
          status: writtenVerdict.status,
          auto_verdict: writtenVerdict.auto_verdict,
          total_score: writtenVerdict.total_score,
          review_reason: writtenVerdict.review_reason,
          warnings: traceLog.warnings,
        });
      }

      return {
        command_group: 'benchmark',
        subcommand: 'evaluate',
        runs,
      };
    });
  });

benchmark
  .command('report <runsRoot>')
  .description('Build machine-readable JSON and Markdown benchmark reports')
  .option('--baseline <path>', 'optional baseline runs root')
  .option('--json-out <path>', 'path for the JSON report')
  .option('--markdown-out <path>', 'path for the Markdown report')
  .action(async (runsRoot: string, options: { baseline?: string; jsonOut?: string; markdownOut?: string }) => {
    await runBenchmarkCommand(() => {
      const resolvedRunsRoot = resolve(runsRoot);
      const jsonReportPath = resolve(options.jsonOut ?? join(resolvedRunsRoot, 'report.json'));
      const markdownReportPath = resolve(options.markdownOut ?? join(resolvedRunsRoot, 'report.md'));
      const report = buildJsonReport({
        runs_root: resolvedRunsRoot,
        baseline_root: options.baseline ? resolve(options.baseline) : undefined,
      });
      const markdown = buildMarkdownReport(report);

      writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
      writeFileSync(markdownReportPath, `${markdown}\n`, 'utf-8');

      return {
        command_group: 'benchmark',
        subcommand: 'report',
        json_report_path: jsonReportPath,
        markdown_report_path: markdownReportPath,
        run_count: report.summary.run_count,
        baseline_run_count: report.summary.baseline_run_count,
      };
    });
  });

benchmark
  .command('review-apply <runDir>')
  .description('Persist a final human review verdict without removing the automatic evidence')
  .requiredOption('--verdict <value>', 'final verdict to apply: pass or fail')
  .option('--reviewer <name>', 'reviewer identity')
  .option('--notes <text>', 'optional human review notes')
  .action(async (runDir: string, options: { verdict: 'pass' | 'fail'; reviewer?: string; notes?: string }) => {
    await runBenchmarkCommand(() => {
      if (options.verdict !== 'pass' && options.verdict !== 'fail') {
        throw new Error('review verdict must be pass or fail');
      }

      const resolvedRunDir = resolve(runDir);
      const result = applyHumanReview({
        run_dir: resolvedRunDir,
        final_verdict: options.verdict,
        reviewer: options.reviewer,
        notes: options.notes,
      });

      return {
        command_group: 'benchmark',
        subcommand: 'review-apply',
        run_dir: resolvedRunDir,
        final_verdict: result.verdict.final_verdict,
        reviewed_by: result.review_record.reviewed_by,
        reviewed_at: result.review_record.reviewed_at,
      };
    });
  });

await program.parseAsync(process.argv);

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

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function formatRunId(caseId: string, index: number): string {
  return `${caseId}-${Date.now()}-${String(index + 1).padStart(2, '0')}`;
}

function isBenchmarkValidationError(error: unknown): error is BenchmarkValidationError {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && 'details' in error;
}

function reportCommandError(error: unknown): void {
  const payload = isBenchmarkValidationError(error)
    ? {
        code: error.code,
        message: error.message,
        details: error.details,
      }
    : {
        code: 'command_failed',
        message: error instanceof Error ? error.message : String(error),
        details: {},
      };

  err(JSON.stringify(payload, null, 2));
  process.exitCode = 1;
}

async function runBenchmarkCommand<T>(operation: () => T | Promise<T>): Promise<void> {
  try {
    const payload = await operation();
    out(JSON.stringify(payload, null, 2));
  } catch (error) {
    reportCommandError(error);
  }
}

function resolveRunDirectories(runPath: string): string[] {
  const resolvedPath = resolve(runPath);
  const metadataPath = join(resolvedPath, 'metadata.json');
  if (existsSync(metadataPath) && statSync(metadataPath).isFile()) {
    return [resolvedPath];
  }

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isDirectory()) {
    throw new Error(`benchmark run path not found: ${resolvedPath}`);
  }

  return readdirSync(resolvedPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(resolvedPath, entry.name))
    .filter((entry) => existsSync(join(entry, 'metadata.json')));
}

function readTranscriptRecords(runDir: string): BenchmarkTranscriptRecord[] {
  const transcriptJsonPath = join(runDir, 'transcript.json');
  if (existsSync(transcriptJsonPath) && statSync(transcriptJsonPath).isFile()) {
    return readJsonFile<BenchmarkTranscriptRecord[]>(transcriptJsonPath);
  }

  const transcriptPath = join(runDir, 'transcript.jsonl');
  return readFileSync(transcriptPath, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as BenchmarkTranscriptRecord);
}

function collectArtifactChanges(artifactsRoot: string): BenchmarkArtifactChange[] {
  if (!existsSync(artifactsRoot) || !statSync(artifactsRoot).isDirectory()) {
    return [];
  }

  const changes: BenchmarkArtifactChange[] = [];
  const timestamp = new Date().toISOString();

  const visit = (dirPath: string): void => {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }

      changes.push({
        timestamp,
        path: relative(artifactsRoot, entryPath).replace(/\\/g, '/'),
        change_type: 'added',
      });
    }
  };

  visit(artifactsRoot);
  return changes;
}

function mapRequiredEvents(semanticEvents: ReturnType<typeof deriveSemanticEvents>['semantic_events']): string[] {
  return semanticEvents.map((event) => {
    if (event.type === 'phase_entered') {
      return `phase_entered:${event.details.phase ?? 'unknown'}`;
    }

    if (event.type === 'independent_review_dispatched') {
      return `independent_review_dispatched:${event.details.reviewer ?? 'unknown'}`;
    }

    return `fresh_reverification:${event.details.tool ?? 'unknown'}`;
  });
}

function evaluateOracleChecks(
  oracle: BenchmarkOracle,
  runDir: string,
  requiredEventsMet: string[],
): {
  outcome_checks_passed: boolean;
  failure_tags: string[];
  ambiguity_reasons: string[];
} {
  const failureTags: string[] = [];
  const ambiguityReasons: string[] = [];
  let outcomeChecksPassed = oracle.verdict !== 'fail';

  for (const check of oracle.checks ?? []) {
    const normalizedCheck = check.trim().toLowerCase();
    if (normalizedCheck.length === 0) {
      continue;
    }

    if (normalizedCheck === 'build') {
      const hasBuildArtifact = existsSync(join(runDir, 'artifacts', 'logs', 'result.json'));
      if (!hasBuildArtifact) {
        outcomeChecksPassed = false;
        failureTags.push('F11');
      }
      continue;
    }

    if (normalizedCheck === 'tests') {
      const hasFreshReverify = requiredEventsMet.some((event) => event.startsWith('fresh_reverification:'));
      if (!hasFreshReverify) {
        ambiguityReasons.push('oracle_tests_check_unverifiable');
      }
      continue;
    }

    ambiguityReasons.push(`unknown_oracle_check:${normalizedCheck}`);
  }

  return {
    outcome_checks_passed: outcomeChecksPassed,
    failure_tags: failureTags,
    ambiguity_reasons: ambiguityReasons,
  };
}

function deriveRunMetrics(warnings: string[], semanticEventCount: number): {
  process_score: number;
  outcome_score: number;
  efficiency_score: number;
} {
  if (warnings.length > 0) {
    return {
      process_score: 32,
      outcome_score: 0,
      efficiency_score: 5,
    };
  }

  return {
    process_score: semanticEventCount > 0 ? 40 : 25,
    outcome_score: 30,
    efficiency_score: 10,
  };
}
