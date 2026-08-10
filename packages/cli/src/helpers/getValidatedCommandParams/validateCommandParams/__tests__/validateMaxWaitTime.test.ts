import { describe, expect, it } from 'vitest';
import validateMaxWaitTime from '../validateMaxWaitTime';

describe('validateMaxWaitTime', () => {
  it('does nothing when maxWaitTime is not provided', () => {
    expect(() => validateMaxWaitTime({})).not.toThrow();
  });

  it.each(['1', '30', '999'])('accepts a valid positive integer string (%s)', (maxWaitTime) => {
    expect(() => validateMaxWaitTime({ maxWaitTime })).not.toThrow();
  });

  it.each([
    ['0', 'zero'],
    ['-5', 'negative'],
    ['1.5', 'decimal'],
    ['abc', 'non-numeric'],
    ['', 'empty string'],
    ['  ', 'whitespace'],
  ])('rejects %s (%s) with a range-naming error', (maxWaitTime) => {
    expect(() => validateMaxWaitTime({ maxWaitTime })).toThrow(
      /--maxWaitTime.*integer of at least 1/
    );
  });
});
