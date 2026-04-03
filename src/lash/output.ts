/**
 * Shared output convention functions for the Lash runtime.
 * Mirrors Python cli.py _out() and _err() exactly.
 */
import { writeSync } from 'node:fs';

/**
 * Write JSON data to stdout.
 * Mirrors Python _out(): print(json.dumps(data, indent=2, default=str))
 */
export function out(data: unknown): void {
  const json = jsonOutput(data);
  writeSync(1, json + '\n');
}

/**
 * Write error JSON to stderr and exit.
 * Mirrors Python _err(): print(json.dumps({"error": msg}), file=sys.stderr); sys.exit(code)
 * Return type `never` documents the exit semantics.
 */
export function err(message: string, code: number = 1): never {
  const json = JSON.stringify({ error: message }, null, 2);
  writeSync(2, json + '\n');
  process.exit(code);
}

/**
 * Serialize data to JSON string with consistent formatting.
 * Mirrors Python json.dumps(data, indent=2, default=str)
 * - Uses a replacer to handle Date objects (→ ISO string)
 * - Handles other non-serializable types gracefully (→ toString())
 */
export function jsonOutput(data: unknown): string {
  return JSON.stringify(data, (_key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, 2);
}
