import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBenchmarkCase } from './case-loader.js';
import { getPhase1RunProfile } from './run-profile.js';

const MINIMUM_PHASE1_CASE_COUNT = 10;

interface PlatformAdmission {
  profile_id: string;
  stable_full_trace: boolean;
}

interface RawSuiteManifest {
  suite_id?: unknown;
  case_ids?: unknown;
  profile_id?: unknown;
  ranked_platform_ids?: unknown;
  ranked_platform_admission_rule?: unknown;
  platform_admissions?: unknown;
}

export interface Phase1SuiteManifest {
  suite_id: string;
  case_ids: string[];
  minimum_case_count: number;
  profile_id: 'phase1-local-cli-v1';
  ranked_platform_ids: string[];
  ranked_platform_admission_rule: string;
}

export class SuiteManifestError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'SuiteManifestError';
    this.code = code;
    this.details = details;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_BENCHMARK_ROOT = path.resolve(__dirname, '..', '..', 'benchmark');

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

function asAdmissions(value: unknown): Record<string, PlatformAdmission> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const admissions: Record<string, PlatformAdmission> = {};

  for (const [platformId, entry] of Object.entries(value)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }

    const profileId = entry['profile_id'];
    const stableFullTrace = entry['stable_full_trace'];
    if (typeof profileId !== 'string' || typeof stableFullTrace !== 'boolean') {
      continue;
    }

    admissions[platformId] = {
      profile_id: profileId,
      stable_full_trace: stableFullTrace,
    };
  }

  return admissions;
}

function getSuiteManifestPath(suiteId: string, benchmarkRoot: string): string {
  return path.join(benchmarkRoot, 'suites', `${suiteId}.json`);
}

function assertPathExistsAsDirectory(dirPath: string): void {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
    throw new SuiteManifestError('case_selector_unknown', 'Benchmark case selector did not resolve to a case directory', {
      selector: dirPath,
    });
  }
}

function validateCaseDir(caseDir: string): string {
  assertPathExistsAsDirectory(caseDir);
  loadBenchmarkCase(caseDir);
  return caseDir;
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath.length === 0 || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function looksLikePathSelector(selector: string): boolean {
  return path.isAbsolute(selector)
    || selector.startsWith('.')
    || selector.includes('/')
    || selector.includes('\\');
}

function normalizeManifest(
  suiteId: string,
  rawManifest: RawSuiteManifest,
): Phase1SuiteManifest & { platform_admissions: Record<string, PlatformAdmission> } {
  if (rawManifest.suite_id !== suiteId) {
    throw new SuiteManifestError('suite_not_found', 'Benchmark suite manifest did not match the requested suite id', {
      suite_id: suiteId,
    });
  }

  if (!isStringArray(rawManifest.case_ids)) {
    throw new SuiteManifestError('suite_invalid', 'Benchmark suite manifest is missing case ids', {
      suite_id: suiteId,
    });
  }

  if (rawManifest.case_ids.length < MINIMUM_PHASE1_CASE_COUNT) {
    throw new SuiteManifestError(
      'suite_under_minimum',
      'Official phase1 benchmark suite must include at least ten synthetic cases',
      {
        suite_id: suiteId,
        minimum_case_count: MINIMUM_PHASE1_CASE_COUNT,
        actual_case_count: rawManifest.case_ids.length,
      },
    );
  }

  if (typeof rawManifest.profile_id !== 'string') {
    throw new SuiteManifestError('suite_profile_mismatch', 'Benchmark suite manifest is missing a supported run profile', {
      suite_id: suiteId,
    });
  }

  let profileId: 'phase1-local-cli-v1';
  try {
    profileId = getPhase1RunProfile(rawManifest.profile_id).profile_id;
  } catch {
    throw new SuiteManifestError('suite_profile_mismatch', 'Benchmark suite manifest must use phase1-local-cli-v1', {
      suite_id: suiteId,
      profile_id: rawManifest.profile_id,
    });
  }

  if (!isStringArray(rawManifest.ranked_platform_ids)) {
    throw new SuiteManifestError(
      'ranked_platform_missing_admission',
      'Ranked phase1 platforms must declare full-trace admission',
      {
        suite_id: suiteId,
      },
    );
  }

  if (typeof rawManifest.ranked_platform_admission_rule !== 'string' || rawManifest.ranked_platform_admission_rule.length === 0) {
    throw new SuiteManifestError(
      'ranked_platform_missing_admission',
      'Ranked phase1 platforms must declare the admission rule',
      {
        suite_id: suiteId,
      },
    );
  }

  const platformAdmissions = asAdmissions(rawManifest.platform_admissions);
  const missingAdmissions = rawManifest.ranked_platform_ids.filter((platformId) => {
    const admission = platformAdmissions[platformId];
    return !admission
      || admission.profile_id !== profileId
      || admission.stable_full_trace !== true;
  });

  if (missingAdmissions.length > 0) {
    throw new SuiteManifestError(
      'ranked_platform_missing_admission',
      'Ranked phase1 platforms must satisfy the stable full-trace admission rule',
      {
        suite_id: suiteId,
        platform_ids: missingAdmissions,
      },
    );
  }

  return {
    suite_id: suiteId,
    case_ids: [...rawManifest.case_ids],
    minimum_case_count: MINIMUM_PHASE1_CASE_COUNT,
    profile_id: profileId,
    ranked_platform_ids: [...rawManifest.ranked_platform_ids],
    ranked_platform_admission_rule: rawManifest.ranked_platform_admission_rule,
    platform_admissions: platformAdmissions,
  };
}

export function loadSuiteManifest(
  suiteId: string,
  benchmarkRoot = DEFAULT_BENCHMARK_ROOT,
): Phase1SuiteManifest {
  const manifestPath = getSuiteManifestPath(suiteId, benchmarkRoot);
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new SuiteManifestError('suite_not_found', 'Benchmark suite manifest was not found', {
      suite_id: suiteId,
    });
  }

  const manifest = normalizeManifest(
    suiteId,
    readJsonFile(manifestPath) as RawSuiteManifest,
  );

  for (const caseId of manifest.case_ids) {
    validateCaseDir(path.join(benchmarkRoot, 'cases', caseId));
  }

  return {
    suite_id: manifest.suite_id,
    case_ids: manifest.case_ids,
    minimum_case_count: manifest.minimum_case_count,
    profile_id: manifest.profile_id,
    ranked_platform_ids: manifest.ranked_platform_ids,
    ranked_platform_admission_rule: manifest.ranked_platform_admission_rule,
  };
}

export function resolveCaseSelector(selector: string, suiteRoot: string): string[] {
  const benchmarkRoot = path.resolve(suiteRoot);

  if (looksLikePathSelector(selector)) {
    const resolvedCaseDir = path.isAbsolute(selector)
      ? path.resolve(selector)
      : path.resolve(benchmarkRoot, selector);

    if (!isPathInsideRoot(resolvedCaseDir, benchmarkRoot)) {
      throw new SuiteManifestError(
        'case_path_outside_suite_root',
        'Explicit benchmark case paths must stay inside the benchmark suite root',
        {
          selector,
          suite_root: benchmarkRoot,
        },
      );
    }

    return [validateCaseDir(resolvedCaseDir)];
  }

  const suiteManifestPath = getSuiteManifestPath(selector, benchmarkRoot);
  if (existsSync(suiteManifestPath) && statSync(suiteManifestPath).isFile()) {
    return loadSuiteManifest(selector, benchmarkRoot).case_ids.map((caseId) => (
      validateCaseDir(path.join(benchmarkRoot, 'cases', caseId))
    ));
  }

  const caseDir = path.join(benchmarkRoot, 'cases', selector);
  if (existsSync(caseDir) && statSync(caseDir).isDirectory()) {
    return [validateCaseDir(caseDir)];
  }

  throw new SuiteManifestError('case_selector_unknown', 'Benchmark case selector was not recognized', {
    selector,
    suite_root: benchmarkRoot,
  });
}
