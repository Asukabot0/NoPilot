/**
 * Profile layer storage — read, write, validate, staleness, gitignore.
 * All profile files live under .nopilot/profile/
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import { createRequire } from 'node:module';
import { readConfig } from './config.js';
import type {
  LayerName,
  LayerData,
  ReadLayerResult,
  WriteLayerResult,
  ProfileExistsResult,
  StalenessResult,
  EnsureGitignoreResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Ajv setup — loaded via require (ESM-compatible workaround for Ajv v8)
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
// Use Ajv 2020 to support draft/2020-12 schemas
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const Ajv2020 = require('ajv/dist/2020');
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
const ajv = new Ajv2020({ allErrors: true, strict: false });

// ---------------------------------------------------------------------------
// Schema loading
// ---------------------------------------------------------------------------

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/profile/storage.ts -> root = ../../
const SCHEMA_DIR = path.resolve(__dirname, '..', '..', 'schemas');

function getSchemaForLayer(layer: LayerName): object {
  const schemaFile = path.join(SCHEMA_DIR, `profile-${layer}.schema.json`);
  return JSON.parse(fs.readFileSync(schemaFile, 'utf-8')) as object;
}

// ---------------------------------------------------------------------------
// Layer file paths
// ---------------------------------------------------------------------------

const LAYER_FILENAMES: Record<LayerName, string> = {
  l0: 'l0-infra.json',
  l1: 'l1-arch.json',
  l2: 'l2-decisions.json',
  l3: 'l3-status.json',
};

function profileDir(rootDir: string): string {
  return path.join(rootDir, '.nopilot', 'profile');
}

function layerPath(rootDir: string, layer: LayerName): string {
  return path.join(profileDir(rootDir), LAYER_FILENAMES[layer]);
}

// ---------------------------------------------------------------------------
// readLayer
// ---------------------------------------------------------------------------

export function readLayer(rootDir: string, layer: LayerName): ReadLayerResult {
  const filePath = layerPath(rootDir, layer);

  if (!fs.existsSync(filePath)) {
    return { data: null, valid: false, errors: ['FILE_NOT_FOUND'] };
  }

  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return { data: null, valid: false, errors: ['PARSE_ERROR'] };
  }

  const schema = getSchemaForLayer(layer);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const validate = ajv.compile(schema);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const valid = validate(data) as boolean;

  if (!valid) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const errors = (validate.errors ?? []).map((e: { instancePath: string; message?: string }) => {
      const prop = e.instancePath ? e.instancePath.replace(/^\//, '') : '';
      if (prop) {
        return `${prop}: ${e.message ?? 'invalid'}`;
      }
      return e.message ?? 'SCHEMA_VALIDATION_FAILED';
    }) as string[];

    // Produce human-friendly messages for missing required properties
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const friendlyErrors = (validate.errors ?? []).map(
      (e: { keyword: string; params?: { missingProperty?: string }; message?: string; instancePath: string }) => {
        if (e.keyword === 'required' && e.params?.missingProperty) {
          return `missing required property: ${e.params.missingProperty}`;
        }
        const prop = e.instancePath ? e.instancePath.replace(/^\//, '') : '';
        return prop ? `${prop}: ${e.message ?? 'invalid'}` : (e.message ?? 'SCHEMA_VALIDATION_FAILED');
      }
    ) as string[];

    return { data: data as LayerData, valid: false, errors: friendlyErrors };
  }

  return { data: data as LayerData, valid: true, errors: [] };
}

// ---------------------------------------------------------------------------
// writeLayer
// ---------------------------------------------------------------------------

export function writeLayer(
  rootDir: string,
  layer: LayerName,
  data: Record<string, unknown>
): WriteLayerResult {
  // Check L2 guard
  if (layer === 'l2') {
    const config = readConfig(rootDir);
    if (!config.l2Enabled) {
      throw new Error('L2_DISABLED');
    }
  }

  // Inject updated_at
  const payload = { ...data, updated_at: new Date().toISOString() };

  // Validate against schema
  const schema = getSchemaForLayer(layer);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const validate = ajv.compile(schema);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const valid = validate(payload) as boolean;

  if (!valid) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const msgs = (validate.errors ?? []).map(
      (e: { keyword: string; params?: { missingProperty?: string }; message?: string; instancePath: string }) => {
        if (e.keyword === 'required' && e.params?.missingProperty) {
          return `missing required property: ${e.params.missingProperty}`;
        }
        const prop = e.instancePath ? e.instancePath.replace(/^\//, '') : '';
        return prop ? `${prop}: ${e.message ?? 'invalid'}` : (e.message ?? 'invalid');
      }
    ) as string[];
    throw new Error(`SCHEMA_VALIDATION_FAILED: ${msgs.join('; ')}`);
  }

  // Ensure directory exists
  const dir = profileDir(rootDir);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = layerPath(rootDir, layer);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');

  return { success: true, path: filePath };
}

// ---------------------------------------------------------------------------
// profileExists
// ---------------------------------------------------------------------------

export function profileExists(rootDir: string): ProfileExistsResult {
  const layers = {
    l0: fs.existsSync(layerPath(rootDir, 'l0')),
    l1: fs.existsSync(layerPath(rootDir, 'l1')),
    l2: fs.existsSync(layerPath(rootDir, 'l2')),
    l3: fs.existsSync(layerPath(rootDir, 'l3')),
  };

  return {
    exists: layers.l0,
    layers,
  };
}

// ---------------------------------------------------------------------------
// checkStaleness
// ---------------------------------------------------------------------------

export function checkStaleness(rootDir: string): StalenessResult {
  const config = readConfig(rootDir);
  const thresholdHours = config.stalenessThresholdHours;

  // Get profile updated_at from l0 (primary layer)
  const l0 = readLayer(rootDir, 'l0');
  if (!l0.data) {
    throw new Error('NO_PROFILE');
  }

  const profileUpdatedAt = (l0.data as { updated_at: string }).updated_at;

  // Get latest git commit timestamp
  let latestCommitAt: string | null = null;
  try {
    const result = child_process.execSync('git log -1 --format=%cI', {
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    latestCommitAt = result.toString().trim();
    if (!latestCommitAt) {
      latestCommitAt = null;
    }
  } catch {
    throw new Error('NO_GIT_REPO');
  }

  const profileDate = new Date(profileUpdatedAt);
  const commitDate = latestCommitAt ? new Date(latestCommitAt) : null;

  let hoursApart = 0;
  let stale = false;

  if (commitDate) {
    // stale = profile is older than latest commit by more than threshold
    const diffMs = commitDate.getTime() - profileDate.getTime();
    hoursApart = diffMs / (1000 * 60 * 60);
    stale = hoursApart > thresholdHours;
  }

  return {
    stale,
    profileUpdatedAt,
    latestCommitAt,
    hoursApart,
    thresholdHours,
  };
}

// ---------------------------------------------------------------------------
// ensureGitignore
// ---------------------------------------------------------------------------

export function ensureGitignore(rootDir: string): EnsureGitignoreResult {
  const gitignorePath = path.join(rootDir, '.gitignore');
  const entry = '.nopilot/';

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n');
    if (lines.some((line) => line.trim() === entry || line.trim() === '.nopilot')) {
      return { added: false };
    }
    const newContent = content.endsWith('\n')
      ? content + entry + '\n'
      : content + '\n' + entry + '\n';
    fs.writeFileSync(gitignorePath, newContent, 'utf-8');
    return { added: true };
  }

  // No .gitignore — create one
  fs.writeFileSync(gitignorePath, entry + '\n', 'utf-8');
  return { added: true };
}
