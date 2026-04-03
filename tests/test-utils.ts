import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function fixtureDir(...segments: string[]): string {
  return resolve(__dirname, 'fixtures', ...segments);
}
