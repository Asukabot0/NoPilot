/**
 * Profile writer — MOD-002.
 * Reads stage artifacts and writes profile layers via MOD-001 storage API.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveBuildReport, resolveDiscover, resolveSpec } from '../lash/spec-resolver.js';
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

function mergeStringLists(existing: string[] = [], incoming: string[] = []): string[] {
  const merged = new Set<string>(existing);
  for (const entry of incoming) {
    if (entry) merged.add(entry);
  }
  return [...merged];
}

// ---------------------------------------------------------------------------
// Artifact loading helpers
// ---------------------------------------------------------------------------

function loadArtifact(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function resolveArtifactEntry(artifactsDir: string, baseName: string): string | null {
  const singleFile = path.join(artifactsDir, `${baseName}.json`);
  if (fs.existsSync(singleFile)) {
    return singleFile;
  }

  const splitDir = path.join(artifactsDir, baseName);
  if (fs.existsSync(splitDir)) {
    return splitDir;
  }

  return null;
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
  const discoverPath = resolveArtifactEntry(artifactsDir, 'discover');

  if (discoverPath === null) {
    throw new Error('ARTIFACT_NOT_FOUND: discover artifact not found in ' + artifactsDir);
  }

  let discoverArtifact: Record<string, unknown>;
  try {
    discoverArtifact = resolveDiscover(discoverPath).discover as Record<string, unknown>;
  } catch (e) {
    throw new Error('EXTRACTION_FAILED: failed to parse discover artifact: ' + String(e));
  }

  let specArtifact: Record<string, unknown> | null = null;
  try {
    const specPath = resolveArtifactEntry(artifactsDir, 'spec');
    specArtifact = specPath ? resolveSpec(specPath).spec as Record<string, unknown> : null;
  } catch (e) {
    throw new Error('EXTRACTION_FAILED: failed to parse spec artifact: ' + String(e));
  }

  let buildReport: Record<string, unknown> | null = null;
  try {
    const buildPath = resolveArtifactEntry(artifactsDir, 'build_report');
    if (buildPath) {
      buildReport = resolveBuildReport(buildPath).buildReport as Record<string, unknown>;
    }
  } catch (e) {
    throw new Error('EXTRACTION_FAILED: failed to parse build report artifact: ' + String(e));
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

  if (existsResult.layers.l3) {
    const existingL3Result = readLayer(rootDir, 'l3');
    if (existingL3Result.data) {
      const existingL3 = existingL3Result.data as ProfileL3Status;
      const existingDomain = existingL3.domain_model ?? { entities: [], relationships: [] };
      const incomingDomain =
        (l3Partial.domain_model as {
          entities: Record<string, unknown>[];
          relationships: Record<string, unknown>[];
        }) ?? {
          entities: [],
          relationships: [],
        };

      const mergeResult = mergeDomainModel(
        { entities: existingDomain.entities ?? [], relationships: existingDomain.relationships ?? [] },
        { entities: incomingDomain.entities ?? [], relationships: incomingDomain.relationships ?? [] }
      );

      l3Partial.domain_model = mergeResult.merged;
      l3Partial.recent_features = mergeStringLists(
        existingL3.recent_features ?? [],
        l3Partial.recent_features ?? []
      );
      if (l3Partial.ui_taste === undefined && existingL3.ui_taste !== undefined) {
        l3Partial.ui_taste = existingL3.ui_taste;
      }
      entitiesAdded = mergeResult.added.length;
      conflictsSkipped = mergeResult.conflicts.length;
    } else {
      // Count new entities
      const domain = l3Partial.domain_model as { entities: Record<string, unknown>[] } | undefined;
      entitiesAdded = domain?.entities?.length ?? 0;
    }
  } else {
    // Fresh profile — all entities are "added"
    const domain = l3Partial.domain_model as { entities: Record<string, unknown>[] } | undefined;
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
