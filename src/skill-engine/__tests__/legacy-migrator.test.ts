/**
 * Tests for MOD-004: LegacyMigrator
 * Covers: detectLegacyFiles, promptAndClean, isWithinMigrationWindow
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';

import {
  detectLegacyFiles,
  isWithinMigrationWindow,
  MIGRATION_SINCE_VERSION,
  promptAndClean,
} from '../legacy-migrator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nopilot-legacy-test-'));
}

function writeFile(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function stdinFrom(text: string): Readable {
  return Readable.from([text]);
}

// ---------------------------------------------------------------------------
// detectLegacyFiles
// ---------------------------------------------------------------------------

describe('detectLegacyFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('TEST-024: detects managed files (with marker)', () => {
    writeFile(tmpDir, 'critic.md', '<!-- nopilot-managed v0.0.3 -->\nsome content\n');
    const { managed, modified, unrelated } = detectLegacyFiles(tmpDir, ['critic']);
    expect(managed).toHaveLength(1);
    expect(managed[0].name).toBe('critic');
    expect(managed[0].hasMarker).toBe(true);
    expect(managed[0].markerVersion).toBe('0.0.3');
    expect(modified).toHaveLength(0);
    expect(unrelated).toHaveLength(0);
  });

  it('TEST-025: detects modified files (same name, no marker)', () => {
    writeFile(tmpDir, 'supervisor.md', '# Supervisor\nlocally modified\n');
    const { managed, modified, unrelated } = detectLegacyFiles(tmpDir, ['supervisor']);
    expect(modified).toHaveLength(1);
    expect(modified[0].name).toBe('supervisor');
    expect(modified[0].hasMarker).toBe(false);
    expect(modified[0].markerVersion).toBeNull();
    expect(managed).toHaveLength(0);
    expect(unrelated).toHaveLength(0);
  });

  it('TEST-026: classifies unrelated files', () => {
    writeFile(tmpDir, 'my-custom-prompt.md', '# My custom thing\n');
    const { managed, modified, unrelated } = detectLegacyFiles(tmpDir, ['critic', 'supervisor']);
    expect(unrelated).toHaveLength(1);
    expect(unrelated[0]).toContain('my-custom-prompt.md');
    expect(managed).toHaveLength(0);
    expect(modified).toHaveLength(0);
  });

  it('TEST-027: nonexistent directory returns empty results without error', () => {
    const nonexistent = path.join(tmpDir, 'does-not-exist');
    const result = detectLegacyFiles(nonexistent, ['critic']);
    expect(result.managed).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.unrelated).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// promptAndClean
// ---------------------------------------------------------------------------

describe('promptAndClean', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    // Restore permissions on any read-only files before cleanup
    try {
      const entries = fs.readdirSync(tmpDir);
      for (const entry of entries) {
        fs.chmodSync(path.join(tmpDir, entry), 0o644);
      }
    } catch {
      // ignore
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('TEST-028: user confirms → managed files deleted', async () => {
    const filePath = writeFile(tmpDir, 'critic.md', '<!-- nopilot-managed v0.0.3 -->\n');
    const managed = [{ path: filePath, name: 'critic', hasMarker: true, markerVersion: '0.0.3' }];

    const result = await promptAndClean(managed, [], stdinFrom('y\n'));

    expect(result.deleted).toContain(filePath);
    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('TEST-029: user rejects → managed files skipped', async () => {
    const filePath = writeFile(tmpDir, 'critic.md', '<!-- nopilot-managed v0.0.3 -->\n');
    const managed = [{ path: filePath, name: 'critic', hasMarker: true, markerVersion: '0.0.3' }];

    const result = await promptAndClean(managed, [], stdinFrom('n\n'));

    expect(result.skipped).toContain(filePath);
    expect(result.deleted).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('TEST-030: permission error on delete → recorded in failed, continues', async () => {
    const filePath = writeFile(tmpDir, 'critic.md', '<!-- nopilot-managed v0.0.3 -->\n');
    const filePath2 = writeFile(tmpDir, 'supervisor.md', '<!-- nopilot-managed v0.0.3 -->\n');
    fs.chmodSync(filePath, 0o444);
    // Make parent dir read-only to actually prevent deletion
    fs.chmodSync(tmpDir, 0o555);

    const managed = [
      { path: filePath, name: 'critic', hasMarker: true, markerVersion: '0.0.3' },
      { path: filePath2, name: 'supervisor', hasMarker: true, markerVersion: '0.0.3' },
    ];

    const result = await promptAndClean(managed, [], stdinFrom('y\n'));

    // Restore permissions so afterEach cleanup can proceed
    fs.chmodSync(tmpDir, 0o755);

    expect(result.failed.length).toBeGreaterThan(0);
    expect(result.failed[0].path).toBe(filePath);
    expect(result.failed[0].error).toBeTruthy();
  });

  it('TEST-051: modified file default N (empty input → skip)', async () => {
    const filePath = writeFile(tmpDir, 'supervisor.md', '# Modified\n');
    const modified = [{ path: filePath, name: 'supervisor', hasMarker: false, markerVersion: null }];

    const result = await promptAndClean([], modified, stdinFrom('\n'));

    expect(result.skipped).toContain(filePath);
    expect(result.deleted).toHaveLength(0);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('TEST-052: modified file explicit y → deleted', async () => {
    const filePath = writeFile(tmpDir, 'supervisor.md', '# Modified\n');
    const modified = [{ path: filePath, name: 'supervisor', hasMarker: false, markerVersion: null }];

    const result = await promptAndClean([], modified, stdinFrom('y\n'));

    expect(result.deleted).toContain(filePath);
    expect(result.skipped).toHaveLength(0);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWithinMigrationWindow
// ---------------------------------------------------------------------------

describe('isWithinMigrationWindow', () => {
  it('TEST-031: in window — current minor within range', () => {
    // migrationSince = 0.0.3 → minor=0, window = minor+5=5 (of patch, but we use minor)
    // migrationSince = 0.3.0 → minor=3, window ends at minor 8
    const result = isWithinMigrationWindow('0.5.0', '0.3.0');
    expect(result.active).toBe(true);
    expect(result.versionsRemaining).toBeGreaterThan(0);
  });

  it('TEST-032: beyond window — current minor exceeds window', () => {
    // migrationSince minor=3, window=8; current minor=9
    const result = isWithinMigrationWindow('0.9.0', '0.3.0');
    expect(result.active).toBe(false);
    expect(result.versionsRemaining).toBe(0);
  });

  it('MIGRATION_SINCE_VERSION constant is 0.0.3', () => {
    expect(MIGRATION_SINCE_VERSION).toBe('0.0.3');
  });
});
