import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/lash/index';

describe('Lash', () => {
  it('should export version', () => {
    expect(VERSION).toBe('0.0.1');
  });
});
