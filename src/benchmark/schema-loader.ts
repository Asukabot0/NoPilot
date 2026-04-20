import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SchemaValidationResult } from './types.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const Ajv2020 = require('ajv/dist/2020');
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
const ajv = new Ajv2020({ allErrors: true, strict: false });

type BenchmarkSchemaName =
  | 'benchmark-case'
  | 'benchmark-oracle'
  | 'benchmark-run'
  | 'benchmark-verdict'
  | 'benchmark-report';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_DIR = path.resolve(__dirname, '..', '..', 'schemas');

const SCHEMA_FILES: Record<BenchmarkSchemaName, string> = {
  'benchmark-case': 'benchmark-case.schema.json',
  'benchmark-oracle': 'benchmark-oracle.schema.json',
  'benchmark-run': 'benchmark-run.schema.json',
  'benchmark-verdict': 'benchmark-verdict.schema.json',
  'benchmark-report': 'benchmark-report.schema.json',
};

const validatorCache = new Map<BenchmarkSchemaName, ReturnType<typeof ajv.compile>>();

function loadSchema(schemaName: BenchmarkSchemaName): object {
  const schemaPath = path.join(SCHEMA_DIR, SCHEMA_FILES[schemaName]);
  return JSON.parse(readFileSync(schemaPath, 'utf-8')) as object;
}

function getValidator(schemaName: BenchmarkSchemaName): ReturnType<typeof ajv.compile> {
  const cached = validatorCache.get(schemaName);
  if (cached) {
    return cached;
  }

  const validator = ajv.compile(loadSchema(schemaName));
  validatorCache.set(schemaName, validator);
  return validator;
}

function formatAjvErrors(errors: unknown): string[] {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.map((error) => {
    const typedError = error as {
      keyword?: string;
      params?: { missingProperty?: string };
      message?: string;
      instancePath?: string;
    };

    if (typedError.keyword === 'required' && typedError.params?.missingProperty) {
      return `missing required property: ${typedError.params.missingProperty}`;
    }

    const instancePath = typedError.instancePath?.replace(/^\//, '') ?? '';
    if (instancePath.length > 0) {
      return `${instancePath}: ${typedError.message ?? 'invalid'}`;
    }

    return typedError.message ?? 'schema validation failed';
  });
}

export function validateBenchmarkSchema<T>(
  schemaName: BenchmarkSchemaName,
  data: unknown,
): SchemaValidationResult<T> {
  const validator = getValidator(schemaName);
  const valid = validator(data) as boolean;

  return {
    valid,
    errors: valid ? [] : formatAjvErrors(validator.errors),
    data: valid ? (data as T) : undefined,
  };
}
