import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAdapterRegistry, type BenchmarkAdapter } from '../src/benchmark/adapter-registry.js';
import { executeRunAdapter } from '../src/benchmark/adapter-runner.js';
import { loadBenchmarkCase } from '../src/benchmark/case-loader.js';
import { prepareRunWorkspace } from '../src/benchmark/fixture-workspace.js';
import {
  getPhase1RunProfile,
  validateRunContract,
} from '../src/benchmark/run-profile.js';
import { type BenchmarkRunMetadata } from '../src/benchmark/types.js';
import { writeStandardRunDirectory } from '../src/benchmark/run-writer.js';

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function makeFakeAdapter(
  override?: Partial<BenchmarkAdapter>,
): BenchmarkAdapter {
  return {
    platform_id: 'codex-cli',
    command: ['fake-codex'],
    async run(request) {
      const artifactPath = join(request.workspace_path, 'artifacts-source', 'adapter.log');
      mkdirSync(join(request.workspace_path, 'artifacts-source'), { recursive: true });
      writeFileSync(artifactPath, `adapter for ${request.platform_id}\n`, 'utf-8');

      return {
        exit_code: 0,
        transcript_records: [
          {
            timestamp: '2026-04-09T00:00:00.000Z',
            role: 'assistant',
            event_type: 'message',
            content: 'adapter completed',
          },
        ],
        artifact_snapshot: [artifactPath],
        adapter_notes: ['fake adapter'],
      };
    },
    ...override,
  };
}

describe('benchmark runner module', () => {
  const benchmarkRoot = join(process.cwd(), 'benchmark');
  const caseDir = join(benchmarkRoot, 'cases', 'DISCOVER-001');
  const promptPath = join(caseDir, 'prompt.txt');

  it('copies the synthetic fixture into a fresh workspace and writes a standard run directory', async () => {
    const bundle = loadBenchmarkCase(caseDir);
    const projectRoot = makeTempDir('benchmark-project-');
    cleanupPaths.push(projectRoot);

    const firstWorkspace = prepareRunWorkspace(bundle, 'RUN-001', projectRoot);
    const secondWorkspace = prepareRunWorkspace(bundle, 'RUN-002', projectRoot);

    writeFileSync(join(firstWorkspace.workspace_path, 'README.md'), 'mutated\n', 'utf-8');
    expect(readFileSync(join(secondWorkspace.workspace_path, 'README.md'), 'utf-8')).toContain(
      'DISCOVER-001',
    );

    const profile = getPhase1RunProfile(bundle.case.run_profile);
    const registry = createAdapterRegistry([makeFakeAdapter()]);
    const adapterResult = await executeRunAdapter(
      {
        platform_id: 'codex-cli',
        model_id: 'gpt-5.4',
        workspace_path: secondWorkspace.workspace_path,
        prompt_path: promptPath,
        profile,
        timeout_seconds: bundle.case.budget.timeout_seconds,
      },
      { registry },
    );

    const metadata: BenchmarkRunMetadata = {
      run_id: 'RUN-002',
      case_id: bundle.case.id,
      case_version: bundle.case.case_version,
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4',
      workflow_version: 'wf-phase1',
      repo_fixture_hash: bundle.fixture_hash,
      trace_extractor_version: 'pending-mod005',
      run_profile: profile.profile_id,
    };

    const runOutput = writeStandardRunDirectory(metadata, adapterResult, join(projectRoot, 'runs'));

    expect(existsSync(join(runOutput.run_dir, 'metadata.json'))).toBe(true);
    expect(existsSync(join(runOutput.run_dir, 'transcript.jsonl'))).toBe(true);
    expect(existsSync(join(runOutput.run_dir, 'transcript.json'))).toBe(true);
    expect(existsSync(join(runOutput.run_dir, 'artifacts', 'artifacts-source', 'adapter.log'))).toBe(true);
    expect(existsSync(join(runOutput.run_dir, 'event-log.json'))).toBe(true);
    expect(existsSync(join(runOutput.run_dir, 'verdict.json'))).toBe(true);

    const contract = validateRunContract(runOutput.run_dir, profile.profile_id);
    expect(contract.valid).toBe(true);
    expect(contract.metadata).toMatchObject({
      case_id: bundle.case.id,
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4',
    });
  });

  it('rejects adapters that do not provide the required transcript fields', async () => {
    const bundle = loadBenchmarkCase(caseDir);
    const projectRoot = makeTempDir('benchmark-project-');
    cleanupPaths.push(projectRoot);

    const workspace = prepareRunWorkspace(bundle, 'RUN-003', projectRoot);
    const profile = getPhase1RunProfile(bundle.case.run_profile);
    const registry = createAdapterRegistry([
      makeFakeAdapter({
        async run() {
          return {
            exit_code: 0,
            transcript_records: [
              {
                timestamp: '2026-04-09T00:00:00.000Z',
                role: 'assistant',
                event_type: 'message',
              },
            ],
            artifact_snapshot: [],
            adapter_notes: [],
          };
        },
      }),
    ]);

    await expect(
      executeRunAdapter(
        {
          platform_id: 'codex-cli',
          model_id: 'gpt-5.4',
          workspace_path: workspace.workspace_path,
          prompt_path: promptPath,
          profile,
          timeout_seconds: bundle.case.budget.timeout_seconds,
        },
        { registry },
      ),
    ).rejects.toMatchObject({
      code: 'incomplete_run_contract',
      details: {
        missingTraceFields: ['content'],
      },
    });
  });

  it('rejects a standard run directory when required metadata is missing', async () => {
    const bundle = loadBenchmarkCase(caseDir);
    const projectRoot = makeTempDir('benchmark-project-');
    cleanupPaths.push(projectRoot);

    const workspace = prepareRunWorkspace(bundle, 'RUN-004', projectRoot);
    const profile = getPhase1RunProfile(bundle.case.run_profile);
    const registry = createAdapterRegistry([makeFakeAdapter()]);
    const adapterResult = await executeRunAdapter(
      {
        platform_id: 'codex-cli',
        model_id: 'gpt-5.4',
        workspace_path: workspace.workspace_path,
        prompt_path: promptPath,
        profile,
        timeout_seconds: bundle.case.budget.timeout_seconds,
      },
      { registry },
    );

    const invalidMetadata = {
      run_id: 'RUN-004',
      case_id: bundle.case.id,
      case_version: bundle.case.case_version,
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4',
      workflow_version: 'wf-phase1',
      repo_fixture_hash: bundle.fixture_hash,
      run_profile: profile.profile_id,
    } as BenchmarkRunMetadata;

    try {
      writeStandardRunDirectory(invalidMetadata, adapterResult, join(projectRoot, 'runs'));
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'incomplete_run_contract',
        details: {
          missingFields: ['trace_extractor_version'],
        },
      });
    }
  });

  it('preserves nested artifact snapshot paths inside the standard run directory', async () => {
    const bundle = loadBenchmarkCase(caseDir);
    const projectRoot = makeTempDir('benchmark-project-');
    cleanupPaths.push(projectRoot);

    const workspace = prepareRunWorkspace(bundle, 'RUN-006', projectRoot);
    const profile = getPhase1RunProfile(bundle.case.run_profile);
    const registry = createAdapterRegistry([
      makeFakeAdapter({
        async run(request) {
          const nestedArtifactPath = join(
            request.workspace_path,
            'artifacts-source',
            'logs',
            'adapter.log',
          );
          const reportPath = join(
            request.workspace_path,
            'artifacts-source',
            'reports',
            'result.json',
          );

          mkdirSync(join(request.workspace_path, 'artifacts-source', 'logs'), { recursive: true });
          mkdirSync(join(request.workspace_path, 'artifacts-source', 'reports'), { recursive: true });
          writeFileSync(nestedArtifactPath, 'nested log\n', 'utf-8');
          writeFileSync(reportPath, '{"ok":true}\n', 'utf-8');

          return {
            exit_code: 0,
            transcript_records: [
              {
                timestamp: '2026-04-09T00:00:00.000Z',
                role: 'assistant',
                event_type: 'message',
                content: 'adapter completed',
              },
            ],
            artifact_snapshot: [
              'artifacts-source/logs/adapter.log',
              'artifacts-source/reports/result.json',
            ],
            adapter_notes: ['fake adapter'],
          };
        },
      }),
    ]);

    const adapterResult = await executeRunAdapter(
      {
        platform_id: 'codex-cli',
        model_id: 'gpt-5.4',
        workspace_path: workspace.workspace_path,
        prompt_path: promptPath,
        profile,
        timeout_seconds: bundle.case.budget.timeout_seconds,
      },
      { registry },
    );

    const metadata: BenchmarkRunMetadata = {
      run_id: 'RUN-006',
      case_id: bundle.case.id,
      case_version: bundle.case.case_version,
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4',
      workflow_version: 'wf-phase1',
      repo_fixture_hash: bundle.fixture_hash,
      trace_extractor_version: 'pending-mod005',
      run_profile: profile.profile_id,
    };

    const runOutput = writeStandardRunDirectory(metadata, adapterResult, join(projectRoot, 'runs'));

    expect(existsSync(join(runOutput.run_dir, 'artifacts', 'artifacts-source', 'logs', 'adapter.log'))).toBe(true);
    expect(existsSync(join(runOutput.run_dir, 'artifacts', 'artifacts-source', 'reports', 'result.json'))).toBe(true);
  });

  it('rejects unknown adapter platforms before execution', async () => {
    const bundle = loadBenchmarkCase(caseDir);
    const projectRoot = makeTempDir('benchmark-project-');
    cleanupPaths.push(projectRoot);

    const workspace = prepareRunWorkspace(bundle, 'RUN-005', projectRoot);
    const profile = getPhase1RunProfile(bundle.case.run_profile);

    await expect(
      executeRunAdapter({
        platform_id: 'unknown-cli',
        model_id: 'gpt-5.4',
        workspace_path: workspace.workspace_path,
        prompt_path: promptPath,
        profile,
        timeout_seconds: bundle.case.budget.timeout_seconds,
      }),
    ).rejects.toMatchObject({
      code: 'adapter_missing',
    });
  });

  it('rejects adapters that provide no transcript output instead of fabricating trace evidence', async () => {
    const bundle = loadBenchmarkCase(caseDir);
    const projectRoot = makeTempDir('benchmark-project-');
    cleanupPaths.push(projectRoot);

    const workspace = prepareRunWorkspace(bundle, 'RUN-007', projectRoot);
    const profile = getPhase1RunProfile(bundle.case.run_profile);
    const registry = createAdapterRegistry([
      makeFakeAdapter({
        async run() {
          return {
            exit_code: 0,
            transcript_records: [],
            artifact_snapshot: [],
            adapter_notes: [],
          };
        },
      }),
    ]);

    await expect(
      executeRunAdapter(
        {
          platform_id: 'codex-cli',
          model_id: 'gpt-5.4',
          workspace_path: workspace.workspace_path,
          prompt_path: promptPath,
          profile,
          timeout_seconds: bundle.case.budget.timeout_seconds,
        },
        { registry },
      ),
    ).rejects.toMatchObject({
      code: 'incomplete_run_contract',
      details: {
        missingTraceFields: profile.transcript_record_fields,
      },
    });
  });

  it('rejects run ids that attempt to escape the benchmark output root', async () => {
    const bundle = loadBenchmarkCase(caseDir);
    const projectRoot = makeTempDir('benchmark-project-');
    cleanupPaths.push(projectRoot);

    expect(() => prepareRunWorkspace(bundle, '../escape', projectRoot)).toThrow('invalid_run_id');

    const workspace = prepareRunWorkspace(bundle, 'RUN-008', projectRoot);
    const profile = getPhase1RunProfile(bundle.case.run_profile);
    const registry = createAdapterRegistry([makeFakeAdapter()]);
    const adapterResult = await executeRunAdapter(
      {
        platform_id: 'codex-cli',
        model_id: 'gpt-5.4',
        workspace_path: workspace.workspace_path,
        prompt_path: promptPath,
        profile,
        timeout_seconds: bundle.case.budget.timeout_seconds,
      },
      { registry },
    );

    const metadata = {
      run_id: '../escape',
      case_id: bundle.case.id,
      case_version: bundle.case.case_version,
      platform_id: 'codex-cli',
      model_id: 'gpt-5.4',
      workflow_version: 'wf-phase1',
      repo_fixture_hash: bundle.fixture_hash,
      trace_extractor_version: 'pending-mod005',
      run_profile: profile.profile_id,
    } as BenchmarkRunMetadata;

    expect(() => writeStandardRunDirectory(metadata, adapterResult, join(projectRoot, 'runs'))).toThrow(
      'run_id must stay within the benchmark output root',
    );
  });
});
