/**
 * Tests for MOD-001: TemplateEngine
 * Covers: renderContent, renderSkillFile, validateOutput
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { renderContent, renderSkillFile, validateOutput } from '../template-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string | undefined;

function writeTmp(filename: string, content: string): string {
  if (!tmpDir) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nopilot-te-test-'));
  }
  const full = path.join(tmpDir, filename);
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

// ---------------------------------------------------------------------------
// renderContent — variable replacement
// ---------------------------------------------------------------------------

describe('renderContent — variable replacement', () => {
  it('TEST-001: replaces a single variable', () => {
    const result = renderContent('Hello <%= name %>!', { name: 'World' }, 'claude');
    expect(result).toBe('Hello World!');
  });

  it('TEST-002: replaces multiple variables', () => {
    const result = renderContent(
      'Platform: <%= platform %>, Tool: <%= tool %>, Author: <%= author %>',
      { tool: 'NoPilot', author: 'Taiyang' },
      'claude',
    );
    expect(result).toBe('Platform: claude, Tool: NoPilot, Author: Taiyang');
  });
});

// ---------------------------------------------------------------------------
// renderContent — conditional rendering
// ---------------------------------------------------------------------------

describe('renderContent — conditional rendering', () => {
  it('TEST-003: renders claude-specific block when platform is claude', () => {
    const template = [
      '<% if (platform === "claude") { %>',
      'This is claude only.',
      '<% } else { %>',
      'This is not claude.',
      '<% } %>',
    ].join('\n');

    const result = renderContent(template, {}, 'claude');
    expect(result).toContain('This is claude only.');
    expect(result).not.toContain('This is not claude.');
  });

  it('TEST-004: renders codex-specific block when platform is codex', () => {
    const template = [
      '<% if (platform === "codex") { %>',
      'This is codex only.',
      '<% } else { %>',
      'This is not codex.',
      '<% } %>',
    ].join('\n');

    const result = renderContent(template, {}, 'codex');
    expect(result).toContain('This is codex only.');
    expect(result).not.toContain('This is not codex.');
  });
});

// ---------------------------------------------------------------------------
// renderContent — error cases
// ---------------------------------------------------------------------------

describe('renderContent — error cases', () => {
  it('TEST-005: throws UNDEFINED_VARIABLE when variable is missing', () => {
    expect(() => renderContent('Hello <%= missing %>!', {}, 'claude')).toThrowError(
      expect.objectContaining({ code: 'UNDEFINED_VARIABLE' }),
    );
  });

  it('TEST-006: throws TEMPLATE_SYNTAX_ERROR on bad eta syntax', () => {
    expect(() => renderContent('Bad: <%= %>', {}, 'claude')).toThrowError(
      expect.objectContaining({ code: 'TEMPLATE_SYNTAX_ERROR' }),
    );
  });
});

// ---------------------------------------------------------------------------
// validateOutput
// ---------------------------------------------------------------------------

describe('validateOutput', () => {
  it('TEST-007: detects residual placeholder in rendered output', () => {
    const content = 'Hello <%= name %> world';
    const result = validateOutput(content, 'test.md');
    expect(result.valid).toBe(false);
    expect(result.residuals).toHaveLength(1);
    expect(result.residuals[0].pattern).toBe('<%= name %>');
    expect(result.residuals[0].line).toBe(1);
  });

  it('TEST-008: returns valid=true for clean content', () => {
    const content = 'Hello World\nNo placeholders here.';
    const result = validateOutput(content, 'test.md');
    expect(result.valid).toBe(true);
    expect(result.residuals).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Syntax interop
// ---------------------------------------------------------------------------

describe('renderContent — syntax interop', () => {
  it('TEST-009: Jinja {{}} syntax is preserved and not interfered with', () => {
    const template = 'Jinja: {{ jinja_var }} and eta: <%= eta_var %>';
    const result = renderContent(template, { eta_var: 'replaced' }, 'claude');
    expect(result).toBe('Jinja: {{ jinja_var }} and eta: replaced');
  });

  it('TEST-010: replaces variable inside markdown code block', () => {
    // eta consumes trailing newline after %>, so place variable mid-line
    const template = '```bash\nnopilot install --platform <%= platform %> --verbose\n```';
    const result = renderContent(template, {}, 'gemini');
    expect(result).toContain('nopilot install --platform gemini --verbose');
  });
});

// ---------------------------------------------------------------------------
// renderSkillFile
// ---------------------------------------------------------------------------

describe('renderSkillFile', () => {
  it('reads and renders a file from disk', () => {
    // eta consumes trailing newline after %>, use toContain assertions
    const filePath = writeTmp('skill.md', '# Skill\nPlatform: <%= platform %>\nTool: <%= tool %>');
    const result = renderSkillFile(filePath, { tool: 'NoPilot' }, 'claude');
    expect(result).toContain('Platform: claude');
    expect(result).toContain('Tool: NoPilot');
  });

  it('throws UNDEFINED_VARIABLE for missing variable in file', () => {
    const filePath = writeTmp('skill-missing.md', 'Hello <%= missing %>!');
    expect(() => renderSkillFile(filePath, {}, 'claude')).toThrowError(
      expect.objectContaining({ code: 'UNDEFINED_VARIABLE' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Escape syntax
// ---------------------------------------------------------------------------

describe('renderContent — escape syntax', () => {
  it('TEST-049: <%%=...%%> escape syntax outputs literal <%=...%>', () => {
    // <%%=name%%> should render to the literal string <%=name%>
    const template = 'Escaped: <%%=name%%>';
    const result = renderContent(template, { name: 'World' }, 'claude');
    expect(result).toContain('<%=name%>');
    expect(result).not.toContain('World');
  });
});
