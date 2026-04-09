import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, '..');
const CLI = resolve(PACKAGE_ROOT, 'dist', 'nopilot-cli.js');
let cliBuilt = false;

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const entry of cleanupPaths.splice(0)) {
    rmSync(entry, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(dir);
  return dir;
}

function runCli(
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: options.cwd ?? PACKAGE_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, ...options.env },
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function ensureCliBuilt(): void {
  if (cliBuilt && existsSync(CLI)) {
    return;
  }

  const result = spawnSync('pnpm', ['build'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf-8',
    env: process.env,
  });

  if ((result.status ?? 1) !== 0) {
    throw new Error(`failed to build benchmark CLI test fixture: ${result.stderr ?? result.stdout}`);
  }

  cliBuilt = true;
}

function writeFakeCodexBin(binDir: string): void {
  mkdirSync(binDir, { recursive: true });
  const codexPath = join(binDir, 'codex');
  writeFileSync(
    codexPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'printf "starting discover phase\\n"',
      'printf "independent critic dispatch\\n"',
      'printf "completed benchmark prompt\\n"',
      'mkdir -p "$PWD/logs"',
      'printf "{\\"result\\":\\"ok\\"}\\n" > "$PWD/logs/result.json"',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(codexPath, 0o755);
}

describe('nopilot benchmark CLI', () => {
  it('exposes the benchmark command group and its phase-1 subcommands', () => {
    ensureCliBuilt();
    const result = runCli(['benchmark', '--help']);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(0);
    expect(output).toContain('benchmark');
    expect(output).toContain('validate-case');
    expect(output).toContain('run');
    expect(output).toContain('evaluate');
    expect(output).toContain('report');
    expect(output).toContain('review-apply');
  });

  it('runs a case through validate, run, evaluate, report, and review-apply', () => {
    ensureCliBuilt();
    const tmpRoot = makeTempDir('nopilot-benchmark-cli-');
    const binDir = join(tmpRoot, 'bin');
    const runsRoot = join(tmpRoot, 'runs');
    const benchmarkRoot = join(PACKAGE_ROOT, 'benchmark');
    const caseDir = join(benchmarkRoot, 'cases', 'DISCOVER-001');

    writeFakeCodexBin(binDir);

    const env = {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
    };

    const validate = runCli(
      ['benchmark', 'validate-case', caseDir, '--benchmark-root', benchmarkRoot],
      { env },
    );
    expect(validate.status).toBe(0);
    expect(JSON.parse(validate.stdout)).toMatchObject({
      command_group: 'benchmark',
      subcommand: 'validate-case',
      cases: [
        {
          case_id: 'DISCOVER-001',
          case_version: '2026-04-09',
          run_profile: 'phase1-local-cli-v1',
        },
      ],
    });

    const run = runCli(
      [
        'benchmark',
        'run',
        caseDir,
        '--benchmark-root',
        benchmarkRoot,
        '--platform',
        'codex-cli',
        '--model',
        'gpt-5.4',
        '--output-root',
        runsRoot,
      ],
      { env },
    );
    expect(run.status).toBe(0);

    const runPayload = JSON.parse(run.stdout) as {
      runs: Array<{
        case_id: string;
        run_dir: string;
      }>;
    };
    expect(runPayload.runs).toHaveLength(1);
    expect(runPayload.runs[0].case_id).toBe('DISCOVER-001');
    expect(existsSync(join(runPayload.runs[0].run_dir, 'metadata.json'))).toBe(true);
    expect(existsSync(join(runPayload.runs[0].run_dir, 'artifacts', 'logs', 'result.json'))).toBe(true);

    const evaluate = runCli(
      [
        'benchmark',
        'evaluate',
        runsRoot,
        '--benchmark-root',
        benchmarkRoot,
      ],
      { env },
    );
    expect(evaluate.status).toBe(0);
    expect(JSON.parse(evaluate.stdout)).toMatchObject({
      command_group: 'benchmark',
      subcommand: 'evaluate',
      runs: [
        {
          case_id: 'DISCOVER-001',
          status: 'needs_review',
          auto_verdict: 'needs_review',
        },
      ],
    });

    const runDir = runPayload.runs[0].run_dir;
    const verdictAfterEvaluate = JSON.parse(
      readFileSync(join(runDir, 'verdict.json'), 'utf-8'),
    ) as { status: string; review_ticket?: { preserved_evidence: Record<string, string> } };
    expect(verdictAfterEvaluate.status).toBe('needs_review');
    expect(verdictAfterEvaluate.review_ticket?.preserved_evidence).toEqual({
      transcript: 'transcript.jsonl',
      event_log: 'event-log.json',
      artifacts: 'artifacts',
    });

    const report = runCli(
      [
        'benchmark',
        'report',
        runsRoot,
      ],
      { env },
    );
    expect(report.status).toBe(0);
    expect(JSON.parse(report.stdout)).toMatchObject({
      command_group: 'benchmark',
      subcommand: 'report',
      json_report_path: join(runsRoot, 'report.json'),
      markdown_report_path: join(runsRoot, 'report.md'),
    });
    expect(readFileSync(join(runsRoot, 'report.md'), 'utf-8')).toContain('## Leaderboard');

    const reviewApply = runCli(
      [
        'benchmark',
        'review-apply',
        runDir,
        '--verdict',
        'pass',
        '--reviewer',
        'qa-user',
        '--notes',
        'Manual review confirmed expected behavior.',
      ],
      { env },
    );
    expect(reviewApply.status).toBe(0);
    expect(JSON.parse(reviewApply.stdout)).toMatchObject({
      command_group: 'benchmark',
      subcommand: 'review-apply',
      run_dir: runDir,
      final_verdict: 'pass',
    });

    const finalVerdict = JSON.parse(
      readFileSync(join(runDir, 'verdict.json'), 'utf-8'),
    ) as { status: string; final_verdict: string; human_review?: { reviewed_by: string } };
    expect(finalVerdict).toMatchObject({
      status: 'pass',
      final_verdict: 'pass',
      human_review: {
        reviewed_by: 'qa-user',
      },
    });
  });

  it('does not mark evaluate as pass when oracle checks cannot be satisfied from the run evidence', () => {
    ensureCliBuilt();
    const tmpRoot = makeTempDir('nopilot-benchmark-cli-fail-');
    const binDir = join(tmpRoot, 'bin');
    const runsRoot = join(tmpRoot, 'runs');
    const benchmarkRoot = join(PACKAGE_ROOT, 'benchmark');
    const caseDir = join(benchmarkRoot, 'cases', 'DISCOVER-001');

    writeFakeCodexBin(binDir);

    const env = {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
    };

    const run = runCli(
      [
        'benchmark',
        'run',
        caseDir,
        '--benchmark-root',
        benchmarkRoot,
        '--platform',
        'codex-cli',
        '--model',
        'gpt-5.4',
        '--output-root',
        runsRoot,
      ],
      { env },
    );
    expect(run.status).toBe(0);

    const runPayload = JSON.parse(run.stdout) as {
      runs: Array<{ run_dir: string }>;
    };

    const runDir = runPayload.runs[0].run_dir;
    rmSync(join(runDir, 'artifacts', 'logs', 'result.json'), { force: true });

    const evaluate = runCli(
      [
        'benchmark',
        'evaluate',
        runsRoot,
        '--benchmark-root',
        benchmarkRoot,
      ],
      { env },
    );
    expect(evaluate.status).toBe(0);

    const evaluatePayload = JSON.parse(evaluate.stdout) as {
      runs: Array<{ status: string; auto_verdict: string; review_reason: string[] }>;
    };
    expect(evaluatePayload.runs[0]).toMatchObject({
      status: 'needs_review',
      auto_verdict: 'needs_review',
    });
    expect(evaluatePayload.runs[0].review_reason).toEqual(
      expect.arrayContaining([
        'oracle_trace_check_unverifiable',
      ]),
    );
  });

  it('keeps contract-valid runs from failing just because build-specific artifacts are absent', () => {
    ensureCliBuilt();
    const tmpRoot = makeTempDir('nopilot-benchmark-cli-contract-');
    const binDir = join(tmpRoot, 'bin');
    const runsRoot = join(tmpRoot, 'runs');
    const benchmarkRoot = join(PACKAGE_ROOT, 'benchmark');
    const caseDir = join(benchmarkRoot, 'cases', 'DISCOVER-001');

    writeFakeCodexBin(binDir);

    const env = {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
    };

    const run = runCli([
      'benchmark', 'run', caseDir,
      '--benchmark-root', benchmarkRoot,
      '--platform', 'codex-cli',
      '--model', 'gpt-5.4',
      '--output-root', runsRoot,
    ], { env });
    expect(run.status).toBe(0);

    const runDir = (JSON.parse(run.stdout) as { runs: Array<{ run_dir: string }> }).runs[0].run_dir;
    rmSync(join(runDir, 'artifacts', 'logs', 'result.json'), { force: true });

    const evaluate = runCli(['benchmark', 'evaluate', runsRoot, '--benchmark-root', benchmarkRoot], { env });
    expect(evaluate.status).toBe(0);

    const payload = JSON.parse(evaluate.stdout) as {
      runs: Array<{ status: string; review_reason: string[] }>;
    };
    expect(payload.runs[0].status).toBe('needs_review');
    expect(payload.runs[0].review_reason).not.toContain('unknown_oracle_check:contract');
  });

  it('preserves a resolved human review when evaluate is run again on the same run root', () => {
    ensureCliBuilt();
    const tmpRoot = makeTempDir('nopilot-benchmark-cli-rerun-');
    const binDir = join(tmpRoot, 'bin');
    const runsRoot = join(tmpRoot, 'runs');
    const benchmarkRoot = join(PACKAGE_ROOT, 'benchmark');
    const caseDir = join(benchmarkRoot, 'cases', 'DISCOVER-001');

    writeFakeCodexBin(binDir);

    const env = {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
    };

    const run = runCli(
      [
        'benchmark',
        'run',
        caseDir,
        '--benchmark-root',
        benchmarkRoot,
        '--platform',
        'codex-cli',
        '--model',
        'gpt-5.4',
        '--output-root',
        runsRoot,
      ],
      { env },
    );
    expect(run.status).toBe(0);

    const runPayload = JSON.parse(run.stdout) as {
      runs: Array<{ run_dir: string }>;
    };
    const runDir = runPayload.runs[0].run_dir;

    expect(runCli(['benchmark', 'evaluate', runsRoot, '--benchmark-root', benchmarkRoot], { env }).status).toBe(0);
    expect(runCli([
      'benchmark',
      'review-apply',
      runDir,
      '--verdict',
      'pass',
      '--reviewer',
      'qa-user',
    ], { env }).status).toBe(0);

    const reevaluate = runCli(['benchmark', 'evaluate', runsRoot, '--benchmark-root', benchmarkRoot], { env });
    expect(reevaluate.status).toBe(0);

    const finalVerdict = JSON.parse(readFileSync(join(runDir, 'verdict.json'), 'utf-8')) as {
      status: string;
      final_verdict: string | null;
    };
    expect(finalVerdict).toMatchObject({
      status: 'pass',
      final_verdict: 'pass',
    });
  });
});
