/**
 * Mode detector — MOD-004.
 * Two-dimensional detection (profile × code) to determine flow mode.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { profileExists, writeLayer } from './storage.js';
import { hasExistingCode, scanCodebase } from './scanner.js';
import type { StalenessResult } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DetectedPath = 'pure_greenfield' | 'first_time_onboarding' | 'returning_project';
export type FlowMode = 'greenfield' | 'feature';

export interface DetectModeResult {
  hasProfile: boolean;
  hasCode: boolean;
  detectedPath: DetectedPath;
  codeIndicators: string[];
  profileLayers: { l0: boolean; l1: boolean; l2: boolean; l3: boolean };
}

export interface ResolveFlowModeResult {
  mode: FlowMode;
  onboardingRequired: boolean;
}

export interface HandleStalenessResult {
  action: 'regenerated' | 'acknowledged';
  layersUpdated: string[];
  stalenessAcknowledged: boolean;
}

// ---------------------------------------------------------------------------
// detectMode
// ---------------------------------------------------------------------------

export function detectMode(rootDir: string): DetectModeResult {
  // Check profile existence — corrupted (empty) = no profile
  const existsResult = profileExists(rootDir);
  const profileLayers = existsResult.layers;

  // Validate profile: l0-infra.json must exist and be non-empty valid JSON
  let hasProfile = existsResult.exists;
  if (hasProfile) {
    const l0Path = path.join(rootDir, '.nopilot', 'profile', 'l0-infra.json');
    try {
      const content = fs.readFileSync(l0Path, 'utf-8').trim();
      if (!content) {
        hasProfile = false;
      } else {
        JSON.parse(content);
      }
    } catch {
      hasProfile = false;
    }
  }

  // Check for existing code
  const codeResult = hasExistingCode(rootDir);
  const hasCode = codeResult.hasCode;
  const codeIndicators = codeResult.indicators;

  // Determine path
  let detectedPath: DetectedPath;
  if (hasProfile) {
    detectedPath = 'returning_project';
  } else if (hasCode) {
    detectedPath = 'first_time_onboarding';
  } else {
    detectedPath = 'pure_greenfield';
  }

  return {
    hasProfile,
    hasCode,
    detectedPath,
    codeIndicators,
    profileLayers,
  };
}

// ---------------------------------------------------------------------------
// resolveFlowMode
// ---------------------------------------------------------------------------

export function resolveFlowMode(
  detectedPath: DetectedPath,
  userChoice: FlowMode | null
): ResolveFlowModeResult {
  switch (detectedPath) {
    case 'pure_greenfield':
      // Always greenfield regardless of userChoice
      return { mode: 'greenfield', onboardingRequired: false };

    case 'first_time_onboarding':
      // Onboarding required before the chosen mode proceeds
      if (userChoice === null) {
        return { mode: 'greenfield', onboardingRequired: true };
      }
      return { mode: userChoice, onboardingRequired: true };

    case 'returning_project':
      // Must have explicit user choice
      if (userChoice === null) {
        throw new Error('USER_CHOICE_REQUIRED: returning_project requires explicit mode selection');
      }
      return { mode: userChoice, onboardingRequired: false };
  }
}

// ---------------------------------------------------------------------------
// handleStalenessResponse
// ---------------------------------------------------------------------------

export function handleStalenessResponse(
  rootDir: string,
  _stalenessResult: StalenessResult,
  userChoice: 'regenerate' | 'proceed'
): HandleStalenessResult {
  if (userChoice === 'proceed') {
    return {
      action: 'acknowledged',
      layersUpdated: [],
      stalenessAcknowledged: true,
    };
  }

  // Regenerate: run codebase scan and write updated layers
  const layersUpdated: string[] = [];
  try {
    const scanResult = scanCodebase(rootDir);

    if (scanResult.l0Partial && Object.keys(scanResult.l0Partial).length > 0) {
      writeLayer(rootDir, 'l0', scanResult.l0Partial as Record<string, unknown>);
      layersUpdated.push('l0');
    }
    if (scanResult.l1Partial && Object.keys(scanResult.l1Partial).length > 0) {
      writeLayer(rootDir, 'l1', scanResult.l1Partial as Record<string, unknown>);
      layersUpdated.push('l1');
    }
    if (scanResult.l3Partial && Object.keys(scanResult.l3Partial).length > 0) {
      writeLayer(rootDir, 'l3', scanResult.l3Partial as Record<string, unknown>);
      layersUpdated.push('l3');
    }
  } catch (e) {
    throw new Error('SCAN_FAILED: ' + String(e));
  }

  return {
    action: 'regenerated',
    layersUpdated,
    stalenessAcknowledged: false,
  };
}
