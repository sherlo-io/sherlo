import { describe, expect, it } from 'vitest';
import parseMaxWaitTime from '../parseMaxWaitTime';

describe('parseMaxWaitTime', () => {
  it('returns undefined when no value is passed (falls back to the default wait timeout)', () => {
    expect(parseMaxWaitTime(undefined)).toBeUndefined();
  });

  it('parses a valid minutes string into a number', () => {
    expect(parseMaxWaitTime('45')).toBe(45);
  });

  it('parses a single-digit minutes string into a number', () => {
    expect(parseMaxWaitTime('1')).toBe(1);
  });
});
