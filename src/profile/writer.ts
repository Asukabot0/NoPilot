/**
 * Profile writer — MOD-002.
 * Reads stage artifacts and writes profile layers via MOD-001 storage API.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readConfig } from './config.js';
import { readLayer, writeLayer, profileExists } from './storage.js';
import { extractL0, extractL1, extractL2, extractL3, mergeDomainModel } from './extractors.js';
import type { ProfileL3Status } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WriteProfileResult {
  layersWritten: string[];
  mergeReport: {
    entitiesAdded: number;
    entitiesUpdated: number;
    conflictsSkipped: number;
  };
}

// ---------------------------------------------------------------------------
// Artifact loading helpers
// ---------------------------------------------------------------------------

function loadArtifact(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// writeProfileFromArtifacts
// ---------------------------------------------------------------------------

export async function writeProfileFromArtifacts(
  rootDir: string,
  artifactsDir: string,
  mode: 'greenfield' | 'feature'
): Promise<WriteProfileResult> {
  // 1. Load artifacts
  const discoverPath = path.join(artifactsDir, 'discover.json');

  if (!fs.existsSync(discoverPath)) {
    throw new Error('ARTIFACT_NOT_FOUND: discover.json not found in ' + artifactsDir);
  }

  let discoverArtifact: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(discoverPath, 'utf-8');
    discoverArtifact = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error('EXTRACTION_FAILED: failed to parse discover.json: ' + String(e));
  }

  let specArtifact: Record<string, unknown> | null = null;
  try {
    specArtifact = loadArtifact(path.join(artifactsDir, 'spec.json'));
  } catch (e) {
    throw new Error('EXTRACTION_FAILED: failed to parse spec.json: ' + String(e));
  }

  let buildReport: Record<string, unknown> | null = null;
  try {
    buildReport = loadArtifact(path.join(artifactsDir, 'build_report.json'));
  } catch (e) {
    throw new Error('EXTRACTION_FAILED: failed to parse build_report.json: ' + String(e));
  }

  let decisionsArtifact: Record<string, unknown> | null = null;
  try {
    decisionsArtifact = loadArtifact(path.join(artifactsDir, 'decisions.json'));
  } catch (e) {
    throw new Error('EXTRACTION_FAILED: failed to parse decisions.json: ' + String(e));
  }

  // 2. Read config for l2_enabled flag
  const config = readConfig(rootDir);

  // 3. Extract per-layer data
  const l0Partial = extractL0(discoverArtifact, specArtifact);
  const l1Partial = extractL1(specArtifact, buildReport);
  const l3Partial = extractL3(
    discoverArtifact,
    buildReport,
    mode === 'feature' ? path.basename(artifactsDir) : null
  );

  // 4. Merge domain model with existing profile if it exists
  const existsResult = profileExists(rootDir);
  let entitiesAdded = 0;
  let conflictsSkipped = 0;

  if (existsResult.exists && existsResult.layers.l3) {
    const existingL3Result = readLayer(rootDir, 'l3');
    if (existingL3Result.data) {
      const existingL3 = existingL3Result.data as ProfileL3Status;
      const existingDomain = existingL3.domain_model ?? { entities: [], relationships: [] };
      const incomingDomain = (l3Partial.domain_model as { entities: object[]; relationships: object[] }) ??
        { entities: [], relationships: [] };

      const mergeResult = mergeDomainModel(
        { entities: existingDomain.entities ?? [], relationships: existingDomain.relationships ?? [] },
        { entities: incomingDomain.entities ?? [], relationships: incomingDomain.relationships ?? [] }
      );

      l3Partial.domain_model = mergeResult.merged;
      entitiesAdded = mergeResult.added.length;
      conflictsSkipped = mergeResult.conflicts.length;
    } else {
      // Count new entities
      const domain = l3Partial.domain_model as { entities: object[] } | undefined;
      entitiesAdded = domain?.entities?.length ?? 0;
    }
  } else {
    // Fresh profile — all entities are "added"
    const domain = l3Partial.domain_model as { entities: object[] } | undefined;
    entitiesAdded = domain?.entities?.length ?? 0;
  }

  // 5. Write layers (may throw WRITE_ERROR)
  const layersWritten: string[] = [];

  try {
    // L0
    writeLayer(rootDir, 'l0', l0Partial as Record<string, unknown>);
    layersWritten.push('l0');

    // L1
    writeLayer(rootDir, 'l1', l1Partial as Record<string, unknown>);
    layersWritten.push('l1');

    // L2 (only when enabled)
    if (config.l2Enabled) {
      const l2Partial = extractL2(discoverArtifact, decisionsArtifact, buildReport);
      writeLayer(rootDir, 'l2', l2Partial as Record<string, unknown>);
      layersWritten.push('l2');
    }

    // L3
    writeLayer(rootDir, 'l3', l3Partial as Record<string, unknown>);
    layersWritten.push('l3');
  } catch (e) {
    const msg = String(e);
    if (msg.startsWith('L2_DISABLED')) throw e;
    if (msg.startsWith('SCHEMA_VALIDATION_FAILED')) throw e;
    throw new Error('WRITE_ERROR: ' + msg);
  }

  return {
    layersWritten,
    mergeReport: {
      entitiesAdded,
      entitiesUpdated: 0,
      conflictsSkipped,
    },
  };
}
