/**
 * THE CLOSEST IDS - `closestIds.ts` orders an app's story ids by how near they are to a typed one.
 */
import { describe, expect, it } from 'vitest';
import { closestStoryIds, editDistance } from '../closestIds';

describe('the ids nearest to a typed one', () => {
  it('counts the single-character edits between two strings', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
  });

  it('puts ids sharing the most words first, then the fewest edits, then the app order', () => {
    const known = ['x--y', 'a-button--secondary', 'a-button--primaryy', 'a-card--primary'];
    expect(closestStoryIds('a-button--primary', known)).toEqual([
      'a-button--primaryy',
      'a-button--secondary',
      'a-card--primary',
      'x--y',
    ]);
  });

  it('keeps every id and leaves the list it was given as it was', () => {
    const known = ['b--two', 'a--one'];
    expect(closestStoryIds('a--one', known)).toEqual(['a--one', 'b--two']);
    expect(known).toEqual(['b--two', 'a--one']);
  });
});
