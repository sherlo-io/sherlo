import { describe, expect, it } from 'vitest';
import { keepStrings } from '../appLog';

describe('the app log reading keeps only what the wire sent as strings', () => {
  it('keeps only the strings of a list', () => {
    expect(keepStrings(['a', 1, null, 'b'])).toEqual(['a', 'b']);
  });

  it('gives nothing when the wire sent no list', () => {
    expect(keepStrings(undefined)).toEqual([]);
    expect(keepStrings('a')).toEqual([]);
  });
});
