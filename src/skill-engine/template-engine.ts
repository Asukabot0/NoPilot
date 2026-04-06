/**
 * MOD-001: TemplateEngine for the Universal Skill Engine.
 *
 * Renders skill template files using eta, with platform-aware variable injection
 * and residual placeholder validation.
 */

import * as fs from 'node:fs';
import { Eta, EtaError } from 'eta';

import type { ValidationResult } from './types.js';

// ---------------------------------------------------------------------------
// Eta instance (shared, stateless rendering)
// ---------------------------------------------------------------------------

const eta = new Eta({ useWith: true, rmWhitespace: false, autoEscape: false });

// Pattern that matches residual un-rendered eta placeholders in output
const RESIDUAL_PATTERN = /<%=.*?%>/g;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Pre-process template content before handing to eta.
 * Converts the escape syntax <%%=...%%> → <%= "<%=...%>" %> so that callers
 * can embed literal <%=...%> markers in output without triggering eta parsing.
 */
function preProcess(content: string): string {
  // Replace <%%=EXPR%%> with a code expression that emits the literal <%=EXPR%>
  // The syntax <%%=name%%> should output the literal string <%=name%>
  return content.replace(/<%%=(.*?)%%>/g, (_match, inner) => {
    const varName = inner.trim();
    return `<%= "<%=" + ${JSON.stringify(varName)} + "%>" %>`;
  });
}

/**
 * Execute eta rendering and normalize errors to our error codes.
 */
function etaRender(
  content: string,
  data: Record<string, string>,
  sourcePath: string,
): string {
  const processed = preProcess(content);
  try {
    return eta.renderString(processed, data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (
      err instanceof EtaError &&
      (message.includes('is not defined') || message.includes('ReferenceError'))
    ) {
      const varMatch = message.match(/^(\w+) is not defined/);
      const varName = varMatch ? varMatch[1] : 'unknown';
      const e = new Error(
        `Template variable "${varName}" is not defined (file: ${sourcePath})`,
      );
      (e as NodeJS.ErrnoException).code = 'UNDEFINED_VARIABLE';
      throw e;
    }

    if (
      err instanceof EtaError &&
      (message.includes('Bad template syntax') ||
        message.includes('SyntaxError') ||
        message.includes('Unexpected token'))
    ) {
      const e = new Error(
        `Template syntax error in "${sourcePath}": ${message.split('\n')[0]}`,
      );
      (e as NodeJS.ErrnoException).code = 'TEMPLATE_SYNTAX_ERROR';
      throw e;
    }

    // ReferenceError from the with(it||{}) scope — undefined variable
    if (message.includes('is not defined')) {
      const varMatch = message.match(/^(\w+) is not defined/);
      const varName = varMatch ? varMatch[1] : 'unknown';
      const e = new Error(
        `Template variable "${varName}" is not defined (file: ${sourcePath})`,
      );
      (e as NodeJS.ErrnoException).code = 'UNDEFINED_VARIABLE';
      throw e;
    }

    // Unknown eta error — re-wrap as syntax error
    const e = new Error(
      `Template error in "${sourcePath}": ${message.split('\n')[0]}`,
    );
    (e as NodeJS.ErrnoException).code = 'TEMPLATE_SYNTAX_ERROR';
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a skill template file and render it with the given variables + platform.
 *
 * @throws Error with code `UNDEFINED_VARIABLE` if a referenced variable is absent
 * @throws Error with code `TEMPLATE_SYNTAX_ERROR` on eta parse errors
 */
export function renderSkillFile(
  sourcePath: string,
  variables: Record<string, string>,
  platform: string,
): string {
  const content = fs.readFileSync(sourcePath, 'utf-8');
  const data: Record<string, string> = { ...variables, platform };
  return etaRender(content, data, sourcePath);
}

/**
 * Render template content from a string (no file I/O).
 *
 * @throws Error with code `UNDEFINED_VARIABLE` if a referenced variable is absent
 * @throws Error with code `TEMPLATE_SYNTAX_ERROR` on eta parse errors
 */
export function renderContent(
  content: string,
  variables: Record<string, string>,
  platform: string,
): string {
  const data: Record<string, string> = { ...variables, platform };
  return etaRender(content, data, '<inline>');
}

/**
 * Validate rendered output for residual un-rendered eta placeholders.
 *
 * Returns `{ valid: true, residuals: [] }` when clean, or
 * `{ valid: false, residuals: [{pattern, line}] }` for each match.
 */
export function validateOutput(
  content: string,
  sourcePath: string,
): ValidationResult {
  const lines = content.split('\n');
  const residuals: Array<{ pattern: string; line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(RESIDUAL_PATTERN);
    if (matches) {
      for (const pattern of matches) {
        residuals.push({ pattern, line: i + 1 });
      }
    }
  }

  return {
    valid: residuals.length === 0,
    residuals,
  };
}
