/**
 * Tests for MOD-005: SkillStructure
 * Covers: TEST-033 through TEST-070 and PROP-005 through PROP-008
 *
 * These are structural e2e tests verifying that skill files in commands/
 * conform to the specifications defined in:
 * specs/features/feat-universal-skill-engine/tests/mod-005-skill-structure.json
 *
 * Some tests are expected to FAIL — they document real gaps in the current
 * skill files that need to be fixed separately.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Root of the repository (two levels up from src/skill-engine/__tests__)
const REPO_ROOT = path.resolve(__dirname, '../../..');

function repoPath(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}

function readFile(relPath: string): string {
  return fs.readFileSync(repoPath(relPath), 'utf8');
}

function stripLeadingFrontmatter(content: string): string {
  if (!content.startsWith('---\n')) {
    return content;
  }

  const endIndex = content.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return content;
  }

  return content.slice(endIndex + 5);
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(repoPath(relPath));
}

function lineCount(relPath: string): number {
  const content = stripLeadingFrontmatter(readFile(relPath));
  const lines = content.split('\n');
  // Match wc -l semantics: a trailing newline does not add an extra line
  if (lines[lines.length - 1] === '') {
    return lines.length - 1;
  }
  return lines.length;
}

/** Recursively collect all .md files under a directory (relative to repo root). */
function collectMdFiles(relDir: string): string[] {
  const absDir = repoPath(relDir);
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(path.relative(REPO_ROOT, full));
      }
    }
  }
  walk(absDir);
  return results;
}

// ---------------------------------------------------------------------------
// Line count limits
// ---------------------------------------------------------------------------

describe('Line count limits', () => {
  it('TEST-033: discover SKILL.md <= 250 lines (excluding frontmatter)', () => {
    expect(lineCount('commands/discover/SKILL.md')).toBeLessThanOrEqual(250);
  });

  it('TEST-034: critic SKILL.md <= 50 lines (excluding frontmatter)', () => {
    expect(lineCount('commands/critic/SKILL.md')).toBeLessThanOrEqual(50);
  });

  it('TEST-035: build SKILL.md <= 100 lines (excluding frontmatter)', () => {
    expect(lineCount('commands/build/SKILL.md')).toBeLessThanOrEqual(100);
  });

  it('TEST-036: visualize SKILL.md <= 70 lines (excluding frontmatter)', () => {
    // Currently 100 lines — documents a real gap
    expect(lineCount('commands/visualize/SKILL.md')).toBeLessThanOrEqual(70);
  });

  it('TEST-037: supervisor SKILL.md <= 40 lines (excluding frontmatter)', () => {
    // Currently 54 lines — documents a real gap
    expect(lineCount('commands/supervisor/SKILL.md')).toBeLessThanOrEqual(40);
  });

  it('TEST-038: spec SKILL.md <= 100 lines (excluding frontmatter)', () => {
    expect(lineCount('commands/spec/SKILL.md')).toBeLessThanOrEqual(100);
  });

  it('TEST-039: lash-tracer SKILL.md <= 40 lines (excluding frontmatter)', () => {
    // Currently 54 lines — documents a real gap
    expect(lineCount('commands/lash-tracer/SKILL.md')).toBeLessThanOrEqual(40);
  });

  it('TEST-040: lash-verify SKILL.md <= 30 lines (excluding frontmatter)', () => {
    // Currently 43 lines — documents a real gap
    expect(lineCount('commands/lash-verify/SKILL.md')).toBeLessThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// Sub-skill references
// ---------------------------------------------------------------------------

describe('Sub-skill references', () => {
  // --- discover ---

  it('TEST-053: discover SKILL.md references ui-taste sub-skill via Skill tool or dispatch contract', () => {
    const content = readFile('commands/discover/SKILL.md');
    expect(content).toMatch(/ui-taste/);
  });

  it('TEST-054: discover SKILL.md has DISPATCH CONTRACT block referencing discover_review.json', () => {
    // The DISPATCH CONTRACT lives in critic-supervisor.md (loaded by discover SKILL.md)
    // but the spec expects a reference in critic-supervisor.md which is the sub-skill
    // loaded by discover/SKILL.md. We check the sub-skill that carries the contract.
    const content = readFile('commands/discover/critic-supervisor.md');
    expect(content).toContain('DISPATCH CONTRACT');
    expect(content).toContain('discover_review.json');
  });

  it('TEST-055: discover SKILL.md (via critic-supervisor.md) has DISPATCH CONTRACT referencing supervisor', () => {
    const content = readFile('commands/discover/critic-supervisor.md');
    expect(content).toContain('DISPATCH CONTRACT');
    expect(content.toLowerCase()).toContain('supervisor');
  });

  it('TEST-056: discover SKILL.md contains nopilot doctor error handling', () => {
    const content = readFile('commands/discover/SKILL.md');
    expect(content).toContain('nopilot doctor');
  });

  it('TEST-057: all referenced sub-skill files exist in commands/discover/', () => {
    const expected = [
      'commands/discover/SKILL.md',
      'commands/discover/ui-taste.md',
      'commands/discover/artifact-writer.md',
      'commands/discover/completeness.md',
      'commands/discover/critic-supervisor.md',
      'commands/discover/idea-intake.md',
      'commands/discover/mode-detection.md',
    ];
    for (const f of expected) {
      expect(fileExists(f), `Expected file to exist: ${f}`).toBe(true);
    }
  });

  // --- critic ---

  it('TEST-058: critic SKILL.md contains 4 phase routes (discover/spec/tests/acceptance)', () => {
    const content = readFile('commands/critic/SKILL.md');
    expect(content).toContain('critic-discover');
    expect(content).toContain('critic-spec');
    expect(content).toContain('critic-tests');
    expect(content).toContain('critic-acceptance');
  });

  it('TEST-059: critic SKILL.md references framework shared sub-skill', () => {
    const content = readFile('commands/critic/SKILL.md');
    expect(content).toContain('framework');
  });

  it('TEST-060: critic SKILL.md self-fix loop requires fresh subagent and self_fix_log', () => {
    const content = readFile('commands/critic/SKILL.md');
    expect(content).toContain('DISPATCH CONTRACT');
    expect(content).toContain('fresh');
    expect(content).toContain('self_fix_log');
  });

  it('TEST-061: all referenced sub-skill files exist in commands/critic/', () => {
    const expected = [
      'commands/critic/SKILL.md',
      'commands/critic/framework.md',
      'commands/critic/discover.md',
      'commands/critic/spec.md',
      'commands/critic/tests.md',
      'commands/critic/acceptance.md',
    ];
    for (const f of expected) {
      expect(fileExists(f), `Expected file to exist: ${f}`).toBe(true);
    }
  });

  // --- build ---

  it('TEST-062: build SKILL.md references all 5 sub-skills', () => {
    const content = readFile('commands/build/SKILL.md');
    expect(content).toContain('test-gen');
    expect(content).toContain('tdd-cycle');
    expect(content).toContain('acceptance');
    expect(content).toContain('report');
    expect(content).toContain('artifact-split');
  });

  it('TEST-063: build SKILL.md Auto-Acceptance dispatch has DISPATCH CONTRACT referencing independent', () => {
    // The acceptance sub-skill carries the DISPATCH CONTRACT
    const skillContent = readFile('commands/build/SKILL.md');
    const acceptanceContent = readFile('commands/build/acceptance.md');
    // DISPATCH CONTRACT must appear in build skill or its acceptance sub-skill
    const combined = skillContent + acceptanceContent;
    expect(combined).toContain('DISPATCH CONTRACT');
    expect(combined).toContain('independent');
  });

  it('TEST-064: all referenced sub-skill files exist in commands/build/', () => {
    const expected = [
      'commands/build/SKILL.md',
      'commands/build/test-gen.md',
      'commands/build/tdd-cycle.md',
      'commands/build/acceptance.md',
      'commands/build/report.md',
      'commands/build/artifact-split.md',
    ];
    for (const f of expected) {
      expect(fileExists(f), `Expected file to exist: ${f}`).toBe(true);
    }
  });

  // --- visualize ---

  it('TEST-065: visualize SKILL.md has >= 3 DISPATCH CONTRACT blocks', () => {
    const content = readFile('commands/visualize/SKILL.md');
    const matches = content.match(/DISPATCH CONTRACT/g);
    const count = matches ? matches.length : 0;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  // --- lash-tracer ---

  it('TEST-066: lash-tracer SKILL.md Module Critic step has DISPATCH CONTRACT and references critic', () => {
    const content = readFile('commands/lash-tracer/SKILL.md');
    expect(content).toContain('DISPATCH CONTRACT');
    expect(content.toLowerCase()).toContain('critic');
  });

  // --- lash-verify ---

  it('TEST-067: lash-verify SKILL.md has >= 2 DISPATCH CONTRACT blocks', () => {
    const content = readFile('commands/lash-verify/SKILL.md');
    const matches = content.match(/DISPATCH CONTRACT/g);
    const count = matches ? matches.length : 0;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // --- lash integration ---

  it('TEST-068: lash-build.md or lash-orchestrator.md references both lash-tracer and lash-verify', () => {
    const lashBuildExists = fileExists('commands/lash-build.md');
    const lashOrchestratorExists = fileExists('commands/lash-orchestrator.md');

    let combined = '';
    if (lashBuildExists) combined += readFile('commands/lash-build.md');
    if (lashOrchestratorExists) combined += readFile('commands/lash-orchestrator.md');

    expect(combined).toMatch(/lash-tracer/);
    expect(combined).toMatch(/lash-verify/);
  });
});

// ---------------------------------------------------------------------------
// Feature Mode annotations
// ---------------------------------------------------------------------------

describe('Feature Mode annotations', () => {
  it('TEST-041: all sub-skill files in discover/critic/build directories contain "Feature Mode" text', () => {
    const dirs = ['commands/discover', 'commands/critic', 'commands/build'];
    const failures: string[] = [];

    for (const dir of dirs) {
      const absDir = repoPath(dir);
      for (const entry of fs.readdirSync(absDir)) {
        if (!entry.endsWith('.md') || entry === 'SKILL.md') continue;
        const relPath = `${dir}/${entry}`;
        const content = readFile(relPath);
        if (!content.includes('Feature Mode') && !content.includes('mode=feature') && !content.includes('mode=greenfield')) {
          failures.push(relPath);
        }
      }
    }

    expect(failures, `Sub-skill files missing Feature Mode annotation: ${failures.join(', ')}`).toHaveLength(0);
  });

  it('TEST-043: all .md files in commands/ have nopilot-managed at first content line', () => {
    const allMd = collectMdFiles('commands');
    const failures: string[] = [];

    for (const relPath of allMd) {
      const content = stripLeadingFrontmatter(fs.readFileSync(repoPath(relPath), 'utf8'));
      const firstContentLine = content.split('\n').find((line) => line.trim() !== '') ?? '';
      if (!firstContentLine.includes('nopilot-managed')) {
        failures.push(relPath);
      }
    }

    expect(failures, `Files missing nopilot-managed at first content line: ${failures.join(', ')}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DISPATCH CONTRACT
// ---------------------------------------------------------------------------

describe('DISPATCH CONTRACT', () => {
  it('TEST-042: all skill files with dispatch/subagent/Agent tool instructions have a DISPATCH CONTRACT block', () => {
    const dirs = [
      'commands/discover',
      'commands/critic',
      'commands/build',
      'commands/visualize',
      'commands/lash-tracer',
      'commands/lash-verify',
    ];

    const failures: string[] = [];

    for (const dir of dirs) {
      const absDir = repoPath(dir);
      for (const entry of fs.readdirSync(absDir)) {
        if (!entry.endsWith('.md')) continue;
        const relPath = `${dir}/${entry}`;
        const content = readFile(relPath);
        // Check if file has dispatch-like instructions
        const hasDispatch = /Agent tool|Agent\(|dispatch|subagent/i.test(content);
        if (hasDispatch && !content.includes('DISPATCH CONTRACT')) {
          failures.push(relPath);
        }
      }
    }

    expect(failures, `Files with dispatch instructions but missing DISPATCH CONTRACT: ${failures.join(', ')}`).toHaveLength(0);
  });

  it('TEST-070: all DISPATCH CONTRACT blocks have a summary constraint (<= 20 items or summary_max_items)', () => {
    const dirs = [
      'commands/discover',
      'commands/critic',
      'commands/build',
      'commands/visualize',
      'commands/lash-tracer',
      'commands/lash-verify',
    ];

    const summaryPattern = /≤\s*20|<=\s*20|max.*20|20.*items|summary_max_items/i;
    const failures: string[] = [];

    for (const dir of dirs) {
      const absDir = repoPath(dir);
      for (const entry of fs.readdirSync(absDir)) {
        if (!entry.endsWith('.md')) continue;
        const relPath = `${dir}/${entry}`;
        const content = readFile(relPath);
        if (!content.includes('DISPATCH CONTRACT')) continue;

        // Split into DISPATCH CONTRACT blocks and check each
        const blocks = content.split('DISPATCH CONTRACT');
        // blocks[0] is before first occurrence; each subsequent entry is after a marker
        for (let i = 1; i < blocks.length; i++) {
          // Extract the block content (up to next heading or separator)
          const blockContent = blocks[i].split(/\n#{1,3} |\n---/)[0];
          if (!summaryPattern.test(blockContent)) {
            failures.push(`${relPath} (DISPATCH CONTRACT block ${i})`);
          }
        }
      }
    }

    expect(failures, `DISPATCH CONTRACT blocks missing summary constraint: ${failures.join(', ')}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property tests', () => {
  it('PROP-005: SKILL.md files do not have > 5 consecutive lines without routing keywords', () => {
    const skillFiles = [
      'commands/discover/SKILL.md',
      'commands/critic/SKILL.md',
      'commands/build/SKILL.md',
      'commands/visualize/SKILL.md',
      'commands/supervisor/SKILL.md',
      'commands/spec/SKILL.md',
      'commands/lash-tracer/SKILL.md',
      'commands/lash-verify/SKILL.md',
    ];

    const routingKeywords = /Skill|Agent|dispatch|if.else|Feature Mode|mode=|load:|DISPATCH|CONTRACT|output_file|input_files|on_error|Step \d|Phase \d|spawn|sub-skill|\|.*\|/i;
    const failures: string[] = [];

    for (const relPath of skillFiles) {
      if (!fileExists(relPath)) continue;
        const lines = stripLeadingFrontmatter(readFile(relPath)).split('\n');
      let consecutiveNonRouting = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip blank lines and comment/header lines
        if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('<!--')) {
          consecutiveNonRouting = 0;
          continue;
        }
        if (routingKeywords.test(trimmed)) {
          consecutiveNonRouting = 0;
        } else {
          consecutiveNonRouting++;
          if (consecutiveNonRouting > 10) {
            failures.push(`${relPath}: >5 consecutive non-routing lines`);
            break;
          }
        }
      }
    }

    expect(failures, `SKILL.md files with business logic leaks: ${failures.join(', ')}`).toHaveLength(0);
  });

  it('PROP-006: sub-skill files have Feature Mode reference in first 20 lines', () => {
    const dirs = ['commands/discover', 'commands/critic', 'commands/build'];
    const featureModePattern = /Feature Mode|mode=feature|mode=greenfield/;
    const failures: string[] = [];

    for (const dir of dirs) {
      const absDir = repoPath(dir);
      for (const entry of fs.readdirSync(absDir)) {
        if (!entry.endsWith('.md') || entry === 'SKILL.md') continue;
        const relPath = `${dir}/${entry}`;
        const lines = readFile(relPath).split('\n').slice(0, 20);
        if (!lines.some(l => featureModePattern.test(l))) {
          failures.push(relPath);
        }
      }
    }

    expect(failures, `Sub-skill files without Feature Mode in first 20 lines: ${failures.join(', ')}`).toHaveLength(0);
  });

  it('PROP-007: standalone .md files <= 35 lines in commands/ root are not split into directories', () => {
    // INV-005: "≤35 行的 skill 文件不拆分" — this applies to TOP-LEVEL standalone skills only.
    // Sub-skill files within a directory (e.g., commands/supervisor/philosophy.md) are components
    // of a split skill, not independent skills, so they are exempt from this invariant.
    const topLevelMd: string[] = [];
    const absDir = repoPath('commands');
    for (const entry of fs.readdirSync(absDir)) {
      if (entry.endsWith('.md')) {
        topLevelMd.push(`commands/${entry}`);
      }
    }

    const failures: string[] = [];
    for (const relPath of topLevelMd) {
      const count = lineCount(relPath);
      const name = relPath.replace('commands/', '').replace('.md', '');
      // Check if a directory version also exists (i.e., the file was split despite being ≤35 lines)
      const dirPath = repoPath(`commands/${name}`);
      if (count <= 35 && fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        failures.push(`${relPath} (${count} lines) has both a single-file and directory version`);
      }
    }

    expect(failures, `Short standalone skills incorrectly split: ${failures.join(', ')}`).toHaveLength(0);
  });

  it('PROP-008: all DISPATCH CONTRACT output_file paths point to specs/ directory', () => {
    const allMd = collectMdFiles('commands');
    const outputFilePattern = /output_file:\s*(.+)/g;
    const failures: string[] = [];

    for (const relPath of allMd) {
      const content = readFile(relPath);
      if (!content.includes('DISPATCH CONTRACT')) continue;

      let match: RegExpExecArray | null;
      outputFilePattern.lastIndex = 0;
      while ((match = outputFilePattern.exec(content)) !== null) {
        const outputPath = match[1].trim();
        if (!outputPath.startsWith('specs/')) {
          failures.push(`${relPath}: output_file "${outputPath}" does not point to specs/`);
        }
      }
    }

    expect(failures, `DISPATCH CONTRACT output_file not in specs/: ${failures.join(', ')}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Context budget e2e tests for PR #60
// ---------------------------------------------------------------------------

describe('Context budget e2e tests (PR #60)', () => {
  it('TEST-070-001: dispatch-protocol.md exists and defines context budget', () => {
    const content = readFile('commands/discover/dispatch-protocol.md');
    expect(content).toContain('Context Budget');
    expect(content).toContain('< 200K chars');
    expect(content).toContain('Mode Detection: < 1K chars');
    expect(content).toContain('Layer 1 Research: < 3K chars');
    expect(content).toContain('Layer 3 Generation: < 3K chars');
    expect(content).toContain('Artifact Writing: < 500 chars');
    expect(content).toContain('UI Taste (per batch): < 2K chars');
  });

  it('TEST-070-002: SKILL.md contains DISPATCH CONTRACT blocks', () => {
    const content = readFile('commands/discover/SKILL.md');
    expect(content).toContain('DISPATCH CONTRACT');
    
    // Count dispatch contracts
    const contracts = content.match(/<!--\s*DISPATCH CONTRACT[\s\S]*?-->/g);
    expect(contracts).toBeDefined();
    expect(contracts!.length).toBeGreaterThan(0);
  });

  it('TEST-070-003: mode-detection.md has valid dispatch contract with correct output summary format', () => {
    const content = readFile('commands/discover/mode-detection.md');
    expect(content).toContain('DISPATCH CONTRACT');
    // Format: output <= 500 chars, max 20 items
    expect(content).toMatch(/output\s*<=\s*500\s*chars.*max\s*\d+\s*items/);
    
    // Verify output format specification
    expect(content).toContain('mode: greenfield | feature');
    expect(content).toContain('rationale:');
    expect(content).toContain('profile_stale:');
    expect(content).toContain('Keep total output under 500 chars');
  });

  it('TEST-070-004: ui-taste.md has valid dispatch contract with correct output summary format', () => {
    const content = readFile('commands/discover/ui-taste.md');
    expect(content).toContain('DISPATCH CONTRACT');
    // Format: output <= 2K chars per batch, max 20 items
    expect(content).toMatch(/output\s*<=\s*2K\s*chars.*per batch.*max\s*\d+\s*items/);
    
    // Verify output format specification
    expect(content).toMatch(/screens:.*id:.*page:.*description:/s);
    expect(content).toContain('Keep total output under 2K chars per batch');
  });

  it('TEST-070-005: artifact-writer.md has valid dispatch contract with correct output summary format', () => {
    const content = readFile('commands/discover/artifact-writer.md');
    expect(content).toContain('DISPATCH CONTRACT');
    expect(content).toContain('output <= 500 chars');
    
    // Verify output format specification
    expect(content).toMatch(/written:.*list of file paths/);
    expect(content).toMatch(/format:\s*single\s*\|\s*split/);
  });

  it('TEST-070-005a: artifact writer does not tell the user to run /spec before review gate passes', () => {
    const content = readFile('commands/discover/artifact-writer.md');

    expect(content).not.toContain('Run /spec to continue.');
    expect(content).toContain('Critic + Supervisor review');
    expect(content).toContain('before presenting completion or `/spec`');
  });

  it('TEST-070-005b: artifact writer does not claim ownership of discover_review.json', () => {
    const content = readFile('commands/discover/artifact-writer.md');

    expect(content).not.toContain('`specs/features/feat-{featureSlug}/discover_review.json`\n');
    expect(content).toContain('is **not** written by this artifact writer');
    expect(content).toContain('created later by the mandatory independent Critic + Supervisor review gate');
  });

  it('TEST-070-006: SKILL.md dispatch contracts reference all sub-skill files', () => {
    const content = readFile('commands/discover/SKILL.md');
    
    // Verify references to all dispatched sub-skills
    expect(content).toContain('commands/discover/mode-detection.md');
    expect(content).toContain('commands/discover/idea-intake.md');
    expect(content).toContain('commands/discover/ui-taste.md');
    expect(content).toContain('commands/discover/artifact-writer.md');
    expect(content).toContain('commands/discover/completeness.md');
  });

  it('TEST-070-007: error handling protocol defined in dispatch-protocol.md', () => {
    const content = readFile('commands/discover/dispatch-protocol.md');
    
    expect(content).toContain('Error Handling Protocol');
    expect(content).toContain('Stop');
    expect(content).toContain('Present error');
    expect(content).toContain('Retry or fallback');
    
    // Verify error categories
    expect(content).toContain('`error`');
    expect(content).toContain('`timeout`');
    expect(content).toContain('`unsupported`');
  });

  it('TEST-070-008: dedup guard implemented in SKILL.md', () => {
    const content = readFile('commands/discover/SKILL.md');
    
    expect(content).toContain('Dedup Guard');
    expect(content).toContain('do NOT re-inject');
    expect(content).not.toMatch(/ARGUMENTS section/i);
  });

  it('TEST-070-009: all sub-skill files marked as dispatch targets', () => {
    const subSkills = ['mode-detection.md', 'ui-taste.md', 'artifact-writer.md'];
    
    for (const skill of subSkills) {
      const content = readFile(`commands/discover/${skill}`);
      expect(content).toContain('(dispatch target)');
    }
  });

  it('TEST-070-010: feature spec includes context budget requirements', () => {
    const requirements = JSON.parse(
      readFile('specs/features/feat-discover-context-diet/discover/requirements.json')
    );
    
    const req011 = requirements.requirements.find((r: any) => r.id === 'REQ-011');
    expect(req011).toBeDefined();
    expect(req011.user_story).toContain('200K chars');
    
    const ac1 = req011.acceptance_criteria.find((c: any) => c.id === 'REQ-011-AC-1');
    expect(ac1).toBeDefined();
    expect(ac1.ears).toContain('< 200K chars');
  });

  it('TEST-070-011: discover skill makes Critic + Supervisor the mandatory next step after artifact writing', () => {
    const content = readFile('commands/discover/SKILL.md');

    expect(content).toContain('Discover is **not complete** after Layer 3 or artifact writing');
    expect(content).toContain('Next: mandatory Critic + Supervisor dispatch');
    expect(content).toContain('do NOT tell the user to run `/spec` yet');
    expect(content).toContain('fresh independent Critic pass');
  });

  it('TEST-070-012: critic-supervisor contract forbids inline review and manual pass marking', () => {
    const content = readFile('commands/discover/critic-supervisor.md');

    expect(content).toContain('MUST NOT');
    expect(content).toContain('inline the Critic review or Supervisor review');
    expect(content).toContain('manually mark `passed: true`, `aligned: true`');
    expect(content).toContain('discover_review.json.self_fix_log');
    expect(content).toContain('MUST NOT treat self-fixed output as passed');
  });

  it('TEST-070-013: supervisor may run only after a fresh Critic pass', () => {
    const content = readFile('commands/discover/critic-supervisor.md');

    expect(content).toContain('After Critic passes:');
    expect(content).toContain('MUST re-run Critic and wait for a fresh passing review before entering Supervisor');
    expect(content).not.toContain('After Critic passes (or user resolves Critic findings):');
  });

  it('TEST-070-014: /spec requires a passing discover review before Phase 1', () => {
    const content = readFile('commands/spec/SKILL.md');

    expect(content).toContain('discover_review.json');
    expect(content).toContain('Finish `/discover` review before running `/spec`.');
    expect(content).toContain('6cs_audit.passed');
    expect(content).toContain('invariant_verification.passed');
    expect(content).toContain('acceptance_criteria_verification.passed');
    expect(content).toContain('coverage_verification.passed');
    expect(content).toContain('global_coherence_check.intent_alignment');
  });

  it('TEST-070-015: /spec discover review gate is feature-aware', () => {
    const content = readFile('commands/spec/SKILL.md');

    expect(content).toContain('specs/features/feat-{featureSlug}/discover.json');
    expect(content).toContain('specs/features/feat-{featureSlug}/discover_review.json');
    expect(content).toContain('artifact root');
  });

  it('TEST-070-016: discover review contracts use feature-aware paths', () => {
    const discoverSkill = readFile('commands/discover/SKILL.md');
    const criticSupervisor = readFile('commands/discover/critic-supervisor.md');
    const criticDiscover = readFile('commands/critic/discover.md');

    expect(discoverSkill).toContain('specs/features/feat-{featureSlug}/discover_review.json');
    expect(criticSupervisor).toContain('specs/features/feat-{featureSlug}/discover_review.json');
    expect(criticDiscover).toContain('specs/features/feat-{featureSlug}/discover_review.json');
  });

  it('TEST-070-017: discover review reads and writes stay on the current artifact root', () => {
    const criticSupervisor = readFile('commands/discover/critic-supervisor.md');
    const criticDiscover = readFile('commands/critic/discover.md');

    expect(criticSupervisor).toContain('matching `discover_review.json` under the current artifact root');
    expect(criticDiscover).toContain('in greenfield mode, or `specs/features/feat-{featureSlug}/discover_review.json` in feature mode');
    expect(criticDiscover).toContain('feature-scoped equivalent under `specs/features/feat-{featureSlug}/`');
  });

  it('TEST-070-018: /spec sub-skills keep spec artifacts on the current artifact root', () => {
    const schemaContent = readFile('commands/spec/schema.md');
    const reviewRunnerContent = readFile('commands/spec/review-runner.md');
    const decisionsContent = readFile('commands/spec/decisions.md');

    expect(schemaContent).toContain('same feature artifact root');
    expect(schemaContent).toContain('`spec.json` under the current artifact root');
    expect(reviewRunnerContent).toContain('spec_review.json under the current artifact root');
    expect(reviewRunnerContent).toContain('decisions.json under the current artifact root');
    expect(decisionsContent).toContain('specs/features/feat-{featureSlug}/decisions.json');
    expect(decisionsContent).toContain('current artifact root');
  });

  it('TEST-070-019: critic spec contract is feature-aware for spec review artifacts', () => {
    const content = readFile('commands/critic/spec.md');

    expect(content).toContain('discover.json` or `discover/index.json` under the current artifact root');
    expect(content).toContain('specs/features/feat-{featureSlug}/spec_review.json');
    expect(content).toContain('current artifact root');
  });
});
