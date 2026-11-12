/**
 * The port a command reads from `--port` (../readPort).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BUNDLER_PORT } from '../../constants';
import { readPort } from '../readPort';

describe('the port a command reads', () => {
  it('falls back to the default bundler port when none is passed', () => {
    expect(readPort(undefined)).toBe(DEFAULT_BUNDLER_PORT);
  });

  it('reads a whole number in the port range', () => {
    expect(readPort('8082')).toBe(8082);
  });
});
