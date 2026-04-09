#!/usr/bin/env node
/**
 * Lash CLI entry point — atomic subcommands with JSON stdout.
 * Translated from Python lash/cli.py.
 * All output goes through out() / err() from ./output.js.
 */
import { Command } from 'commander';
import { out, err } from './output.js';

const program = new Command();

program
  .name('lash')
  .description('Lash prompt-driven orchestrator — atomic JSON subcommands');

// ---------------------------------------------------------------------------
// preflight
// ---------------------------------------------------------------------------

program
  .command('preflight')
  .description('Check platform availability and auth')
  .option('--platforms <p1,p2>', 'Comma-separated platform names')
  .option('--config <path>', 'Path to lash config JSON (used if --platforms omitted)')
  .action(async (opts: { platforms?: string; config?: string }) => {
    const { preflight } = await import('./platform-launcher.js');
    const { loadConfig } = await import('./config.js');
    let platforms: string[] = [];
    if (opts.platforms) {
      platforms = opts.platforms.split(',').map((p) => p.trim());
    } else {
      const cfg = loadConfig(opts.config);
      platforms = cfg.platforms ?? [];
    }
    if (platforms.length === 0) {
      err('no platforms specified and no defaults found');
    }
    try {
      const results = await preflight(platforms);
      out(results);
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

program
  .command('plan [spec_path] [discover_path]')
  .description('Generate execution plan from spec + discover (auto-detects paths if omitted)')
  .action(async (specPath: string | undefined, discoverPath: string | undefined) => {
    const { generatePlan } = await import('./plan-generator.js');
    try {
      if (!specPath || !discoverPath) {
        const { resolveArtifactPaths } = await import('./spec-resolver.js');
        const resolved = resolveArtifactPaths();
        specPath = specPath ?? resolved.specPath;
        discoverPath = discoverPath ?? resolved.discoverPath;
      }
      const plan = generatePlan(specPath, discoverPath);
      out(plan);
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// worktree (nested subcommands)
// ---------------------------------------------------------------------------

const worktreeCmd = program
  .command('worktree')
  .description('Git worktree management');

worktreeCmd
  .command('create <module_id>')
  .description('Create worktree for a module')
  .option('--project-root <path>', 'Project root directory', '.')
  .action(async (moduleId: string, opts: { projectRoot: string }) => {
    const { createWorktree } = await import('./worktree-manager.js');
    try {
      const result = await createWorktree(moduleId, opts.projectRoot);
      out(result);
    } catch (exc) {
      err(String(exc));
    }
  });

worktreeCmd
  .command('merge <module_id>')
  .description('Merge module branch to main')
  .option('--project-root <path>', 'Project root directory', '.')
  .action(async (moduleId: string, opts: { projectRoot: string }) => {
    const { mergeToMain } = await import('./worktree-manager.js');
    try {
      const result = await mergeToMain(moduleId, opts.projectRoot);
      out(result);
    } catch (exc) {
      err(String(exc));
    }
  });

worktreeCmd
  .command('cleanup <module_id>')
  .description('Remove worktree and branch')
  .option('--project-root <path>', 'Project root directory', '.')
  .action(async (moduleId: string, opts: { projectRoot: string }) => {
    const { cleanupWorktree } = await import('./worktree-manager.js');
    try {
      await cleanupWorktree(moduleId, opts.projectRoot);
      out({ cleaned: true, module_id: moduleId });
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// package
// ---------------------------------------------------------------------------

program
  .command('package <module_id> <worktree_path> <platform>')
  .description('Generate .lash/ task package for a worker')
  .option('--spec <path>', 'Path to spec artifact (spec.json, spec/, or spec/index.json)')
  .option('--discover <path>', 'Path to discover artifact (discover.json, discover/, or discover/index.json)')
  .option('--tests <path>', 'Path to tests artifact (tests.json, tests/, or tests/index.json)')
  .option('--completed <m1,m2>', 'Comma-separated completed module IDs')
  .action(async (
    moduleId: string,
    worktreePath: string,
    platform: string,
    opts: { spec?: string; discover?: string; tests?: string; completed?: string },
  ) => {
    const { generatePackage } = await import('./task-packager.js');
    const { resolveSpec, resolveDiscover, resolveTests, resolveArtifactPaths } = await import('./spec-resolver.js');
    try {
      if (!opts.spec || !opts.discover) {
        const resolved = resolveArtifactPaths();
        opts.spec = opts.spec ?? resolved.specPath;
        opts.discover = opts.discover ?? resolved.discoverPath;
      }
      const { spec } = resolveSpec(opts.spec) as { spec: Record<string, unknown> };
      const { discover } = resolveDiscover(opts.discover) as { discover: Record<string, unknown> };
      let tests: Record<string, unknown>;
      if (opts.tests) {
        tests = resolveTests(opts.tests).tests as Record<string, unknown>;
      } else {
        tests = {
          example_cases: [],
          property_cases: [],
          coverage_summary: {},
          coverage_guards: {},
        };
      }
      const completed = opts.completed
        ? opts.completed.split(',').map((m) => m.trim())
        : [];
      const result = generatePackage(
        moduleId,
        worktreePath,
        spec,
        discover,
        tests,
        completed,
        platform,
      );
      out(result);
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// spawn
// ---------------------------------------------------------------------------

program
  .command('spawn <platform> <module_id> <worktree_path>')
  .description('Spawn a worker process')
  .requiredOption('--task <text>', 'Task description')
  .option('--instruction-file <path>', 'Path to instruction file')
  .action(async (
    platform: string,
    moduleId: string,
    worktreePath: string,
    opts: { task: string; instructionFile?: string },
  ) => {
    const { spawnWorker } = await import('./platform-launcher.js');
    try {
      const handle = spawnWorker(
        platform,
        opts.task,
        worktreePath,
        opts.instructionFile ?? null,
        moduleId,
      );
      out({
        pid: handle.pid,
        session_id: handle.session_id,
        platform: handle.platform,
        module_id: handle.module_id,
        worktree_path: handle.worktree_path,
        started_at: handle.started_at,
      });
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

program
  .command('check <module_id> <worktree_path>')
  .description('Check worker completion status')
  .requiredOption('--pid <pid>', 'Worker process ID', parseInt)
  .option('--platform <name>', 'Platform name')
  .option('--started-at <iso>', 'Worker start timestamp (ISO) for timeout detection')
  .option('--timeout <seconds>', 'Timeout in seconds (default: 300)', parseInt)
  .action(async (
    moduleId: string,
    worktreePath: string,
    opts: { pid: number; platform?: string; startedAt?: string; timeout?: number },
  ) => {
    const { checkCompletion } = await import('./platform-launcher.js');

    const handle = {
      platform: (opts.platform ?? 'claude-code') as 'claude-code' | 'codex' | 'opencode',
      pid: opts.pid,
      session_id: '',
      worktree_path: worktreePath,
      module_id: moduleId,
      started_at: opts.startedAt ?? '',
    };

    const completionOpts = opts.startedAt
      ? { startedAt: opts.startedAt, timeoutSeconds: opts.timeout }
      : undefined;

    try {
      let result;
      try {
        process.kill(opts.pid, 0);
        // Process alive — checkCompletion handles done.json + timeout + running
        result = await checkCompletion(handle, undefined, completionOpts);
      } catch {
        // Process gone — simulate exit 0, checkCompletion handles done.json + git diff
        result = await checkCompletion(handle, { exitCode: 0 }, completionOpts);
      }
      out(result);
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// resume
// ---------------------------------------------------------------------------

program
  .command('resume <platform> <session_id> <worktree_path>')
  .description('Resume a worker with feedback')
  .requiredOption('--feedback <text>', 'Feedback text')
  .action(async (
    platform: string,
    sessionId: string,
    worktreePath: string,
    opts: { feedback: string },
  ) => {
    const { resumeWorker } = await import('./platform-launcher.js');
    const handle = {
      platform: platform as 'claude-code' | 'codex' | 'opencode',
      pid: 0,
      session_id: sessionId,
      worktree_path: worktreePath,
      module_id: '',
      started_at: '',
    };
    try {
      await resumeWorker(handle, opts.feedback);
      out({ sent: true });
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

program
  .command('cancel')
  .description('Cancel a running worker')
  .requiredOption('--pid <pid>', 'Worker process ID', parseInt)
  .option('--graceful <seconds>', 'Seconds to wait for graceful shutdown (default: 10)', parseInt)
  .action(async (opts: { pid: number; graceful?: number }) => {
    const { cancelWorker } = await import('./platform-launcher.js');
    const handle = {
      platform: 'claude-code' as const,
      pid: opts.pid,
      session_id: '',
      worktree_path: '.',
      module_id: '',
      started_at: '',
    };
    try {
      const result = await cancelWorker(handle, undefined, opts.graceful ?? 10);
      out(result);
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// test
// ---------------------------------------------------------------------------

program
  .command('test <path>')
  .description('Detect runner and run tests in a path')
  .option('--filter <expr>', 'Optional test filter expression')
  .action(async (testPath: string, opts: { filter?: string }) => {
    const { detectTestRunner, runTests } = await import('./test-runner.js');
    let runnerConfig;
    try {
      runnerConfig = detectTestRunner(testPath);
    } catch (exc) {
      return err(String(exc));
    }
    try {
      const result = await runTests(testPath, runnerConfig, opts.filter ?? null);
      out(result);
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// classify
// ---------------------------------------------------------------------------

program
  .command('classify <output_file>')
  .description('Classify a test failure output file')
  .option('--owned-files <glob1,glob2>', 'Comma-separated owned file paths')
  .action(async (outputFile: string, opts: { ownedFiles?: string }) => {
    const { classifyFailure } = await import('./failure-classifier.js');
    const { readFileSync } = await import('node:fs');
    try {
      const testResult = JSON.parse(readFileSync(outputFile, 'utf-8'));
      const owned = opts.ownedFiles
        ? opts.ownedFiles.split(',').map((f) => f.trim())
        : [];
      const result = classifyFailure(testResult, owned);
      out({
        level: result.level,
        highest_level: result.highest_level,
        reasons: result.reasons,
      });
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// cleanup-specs
// ---------------------------------------------------------------------------

program
  .command('cleanup-specs')
  .description('Remove spec artifacts from specs/ directory')
  .option('--feature <name>', 'Clean only specs/features/{name}/ directory')
  .action(async (opts: { feature?: string }) => {
    const { cleanupArtifacts } = await import('./artifact-cleaner.js');
    try {
      const result = cleanupArtifacts({ featureName: opts.feature ?? undefined });
      out(result);
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// state (nested subcommands)
// ---------------------------------------------------------------------------

const stateCmd = program
  .command('state')
  .description('Build state management');

stateCmd
  .command('create')
  .description('Create and save initial build state')
  .requiredOption('--spec-hash <hash>', 'Spec file hash')
  .option('--state-path <path>', 'State file path (default: specs/build-state.json)')
  .action(async (opts: { specHash: string; statePath?: string }) => {
    const { createInitialState, saveState, DEFAULT_STATE_PATH } = await import('./build-state.js');
    const statePath = opts.statePath ?? DEFAULT_STATE_PATH;
    try {
      const state = createInitialState(opts.specHash);
      saveState(state, statePath);
      out(state);
    } catch (exc) {
      err(String(exc));
    }
  });

stateCmd
  .command('update <event_name>')
  .description('Load state, record transition, save')
  .option('--data <json>', 'JSON object with transition data')
  .option('--state-path <path>', 'State file path (default: specs/build-state.json)')
  .action(async (eventName: string, opts: { data?: string; statePath?: string }) => {
    const { loadState, recordTransition, saveState, DEFAULT_STATE_PATH } = await import('./build-state.js');
    const statePath = opts.statePath ?? DEFAULT_STATE_PATH;
    try {
      const state = loadState(statePath);
      if (state === null) {
        return err(`no state file found at ${statePath}`);
      }
      let data: Record<string, unknown> = {};
      if (opts.data) {
        data = JSON.parse(opts.data);
      }
      const updated = recordTransition(state, eventName, data);
      saveState(updated, statePath);
      out(updated);

      // Auto-cleanup spec artifacts after build completion
      if (eventName === 'build_completed') {
        const { cleanupArtifacts } = await import('./artifact-cleaner.js');
        cleanupArtifacts();
      }
    } catch (exc) {
      err(String(exc));
    }
  });

stateCmd
  .command('resume')
  .description('Load state and get resume point')
  .option('--state-path <path>', 'State file path (default: specs/build-state.json)')
  .action(async (opts: { statePath?: string }) => {
    const { loadState, getResumePoint, DEFAULT_STATE_PATH } = await import('./build-state.js');
    const statePath = opts.statePath ?? DEFAULT_STATE_PATH;
    try {
      const state = loadState(statePath);
      if (state === null) {
        return err(`no state file found at ${statePath}`);
      }
      const result = getResumePoint(state);
      out(result);
    } catch (exc) {
      err(String(exc));
    }
  });

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

program.parseAsync(process.argv);
