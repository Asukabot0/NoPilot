import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const Ajv2020 = require('ajv/dist/2020');

function loadSpecSchema(): unknown {
  const schemaPath = join(import.meta.dirname, '..', 'schemas', 'spec.schema.json');
  return JSON.parse(readFileSync(schemaPath, 'utf8')) as unknown;
}

function makeValidSpec(): Record<string, unknown> {
  return {
    phase: 'spec',
    version: '4.0',
    status: 'approved',
    modules: [
      {
        id: 'MOD-001',
        name: 'module-one',
        responsibility: 'Owns module one.',
        owned_files: ['src/module-one/**'],
        interfaces: [],
        data_models: [],
        requirement_refs: ['REQ-001'],
      },
    ],
    dependency_graph: { edges: [] },
    external_dependencies: [],
    global_error_strategy: {},
    auto_decisions: [],
    contract_amendments: [],
    context_dependencies: ['specs/discover.json'],
  };
}

describe('spec.schema.json', () => {
  it('rejects modules with empty owned_files arrays', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(loadSpecSchema());

    const spec = makeValidSpec();
    const modules = spec.modules as Array<Record<string, unknown>>;
    modules[0].owned_files = [];

    const valid = validate(spec);
    expect(valid).toBe(false);

    const errors = validate.errors ?? [];
    expect(errors.some((error) => error.instancePath.endsWith('/owned_files'))).toBe(true);
  });
});
