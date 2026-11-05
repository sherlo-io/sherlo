/**
 * The news a posed scene tells: the scene news kept when stated, and the flat screen and
 * ended-early fields of a pose met as the one stop the record carries.
 */
import { describe, expect, it } from 'vitest';
import { newsOf, stopNewsOf } from '../posedSceneNews';

const EMPTY = { views: 0, words: [] };
const EARLY = { afterMs: 4000, stuckOn: 'sign-in' as const };

describe('the news of a posed scene', () => {
  it('keeps only the fields the pose states', () => {
    expect(newsOf({})).toEqual({});
    expect(newsOf({ letThrough: [{ method: 'GET', url: '/a' }] })).toEqual({
      letThrough: [{ method: 'GET', url: '/a' }],
    });
  });
});

describe('the stop of a posed scene that never got ready', () => {
  it('names a covering screen before a blank one, keeping the screen it read', () => {
    expect(stopNewsOf({ endedEarly: EARLY, screen: EMPTY }).stop).toEqual({
      kind: 'covered',
      early: EARLY,
      screen: EMPTY,
    });
    expect(stopNewsOf({ endedEarly: EARLY }).stop).toEqual({ kind: 'covered', early: EARLY });
  });

  it('names a screen with no views blank and one with views another screen', () => {
    expect(stopNewsOf({ screen: EMPTY }).stop).toEqual({ kind: 'blank', screen: EMPTY });
    const drawn = { views: 3, words: ['Hi'] };
    expect(stopNewsOf({ screen: drawn }).stop).toEqual({
      kind: 'on-another-screen',
      screen: drawn,
    });
  });

  it('names no stop when the pose states none, and keeps the cause and the last run', () => {
    const lastRun = { ending: 'captured' as const, route: [], refused: 0 };

    expect(stopNewsOf({})).toEqual({});
    expect(stopNewsOf({ lastRun })).toEqual({ lastRun });
  });
});
