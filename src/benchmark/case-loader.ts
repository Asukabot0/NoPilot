import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import {
  BenchmarkValidationError,
  type BenchmarkCase,
  type BenchmarkCaseBundle,
  type BenchmarkOracle,
} from './types.js';
import { validateBenchmarkSchema } from './schema-loader.js';
import { getPhase1RunProfile } from './run-profile.js';

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
}

function tryReadJsonFile(filePath: string): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, data: readJsonFile(filePath) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractMissingRequiredProperties(errors: string[]): string[] {
  return errors
    .filter((error) => error.startsWith('missing required property: '))
    .map((error) => error.replace('missing required property: ', ''))
    .sort();
}

function hashFixtureDir(rootDir: string, currentDir = rootDir): string {
  const hash = createHash('sha256');

  function visit(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      const relativePath = path.relative(currentDir, fullPath).replace(/\\/g, '/');
      hash.update(relativePath);
      hash.update('\n');
      hash.update(readFileSync(fullPath));
      hash.update('\n');
    }
  }

  visit(rootDir);
  return hash.digest('hex');
}

export function loadBenchmarkCase(caseDir: string, _suiteRoot: string | null = null): BenchmarkCaseBundle {
  const missingFiles: string[] = [];
  const caseJsonPath = path.join(caseDir, 'case.json');
  const promptPath = path.join(caseDir, 'prompt.txt');
  const oraclePath = path.join(caseDir, 'oracle.json');
  const fixtureDir = path.join(caseDir, 'fixture');

  if (!existsSync(caseJsonPath) || !statSync(caseJsonPath).isFile()) {
    missingFiles.push('case.json');
  }
  if (!existsSync(promptPath) || !statSync(promptPath).isFile()) {
    missingFiles.push('prompt.txt');
  }
  if (!existsSync(oraclePath) || !statSync(oraclePath).isFile()) {
    missingFiles.push('oracle.json');
  }
  if (!existsSync(fixtureDir) || !statSync(fixtureDir).isDirectory()) {
    missingFiles.push('fixture/');
  }

  let parsedCase: unknown = {};
  const caseParseErrors: string[] = [];
  if (existsSync(caseJsonPath) && statSync(caseJsonPath).isFile()) {
    const parsed = tryReadJsonFile(caseJsonPath);
    if (!parsed.ok) {
      caseParseErrors.push(`case.json: invalid JSON (${parsed.error})`);
    } else {
      parsedCase = parsed.data;
    }
  }

  const caseValidation = validateBenchmarkSchema<BenchmarkCase>('benchmark-case', parsedCase);
  const missingFields = caseValidation.valid
    ? []
    : extractMissingRequiredProperties(caseValidation.errors);

  if (missingFiles.length > 0) {
    throw new BenchmarkValidationError(
      'case_missing_file',
      'Benchmark case is missing required files',
      {
        missingFiles,
      },
    );
  }

  if (caseParseErrors.length > 0 || missingFields.length > 0 || !caseValidation.valid || !caseValidation.data) {
    throw new BenchmarkValidationError('case_schema_invalid', 'Benchmark case schema validation failed', {
      missingFields,
      schemaErrors: [...caseParseErrors, ...caseValidation.errors],
    });
  }

  getPhase1RunProfile(caseValidation.data.run_profile);

  const parsedOracle = tryReadJsonFile(oraclePath);
  if (!parsedOracle.ok) {
    throw new BenchmarkValidationError('oracle_schema_invalid', 'Benchmark oracle schema validation failed', {
      schemaErrors: [`oracle.json: invalid JSON (${parsedOracle.error})`],
    });
  }

  const oracleValidation = validateBenchmarkSchema<BenchmarkOracle>(
    'benchmark-oracle',
    parsedOracle.data,
  );

  if (!oracleValidation.valid || !oracleValidation.data) {
    throw new BenchmarkValidationError('oracle_schema_invalid', 'Benchmark oracle schema validation failed', {
      schemaErrors: oracleValidation.errors,
    });
  }

  const promptText = readFileSync(promptPath, 'utf-8');
  const fixtureHash = hashFixtureDir(fixtureDir);

  return {
    case: caseValidation.data,
    oracle: oracleValidation.data,
    prompt_text: promptText,
    fixture_dir: fixtureDir,
    fixture_hash: fixtureHash,
    run_metadata_seed: {
      case_id: caseValidation.data.id,
      case_version: caseValidation.data.case_version,
      repo_fixture_hash: fixtureHash,
    },
  };
}
