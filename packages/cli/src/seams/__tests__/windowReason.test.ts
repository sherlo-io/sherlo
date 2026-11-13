/**
 * Why a capture was rooted at the window, read off the wire by ../windowReason. The live socket's
 * own cases (./captureSocket.test.ts) read the same reasons through a whole capture.
 */
import { describe, expect, it } from 'vitest';
import { readWindowReason } from '../windowReason';

describe('why a capture was rooted at the window, read off the wire', () => {
  it('a reading that never named the story keeps only the testIDs that are strings', () => {
    expect(
      readWindowReason({
        cause: 'story-unnamed',
        publishedAtPollStart: true,
        testIdsAtGiveUp: ['other-story', 7, null],
      })
    ).toEqual({
      cause: 'story-unnamed',
      publishedAtPollStart: true,
      testIdsAtGiveUp: ['other-story'],
    });
  });

  it('a broken story names where its brokenness was read from', () => {
    expect(
      readWindowReason({ cause: 'story-broken', source: 'fallback-text', generation: 'live' })
    ).toEqual({ cause: 'story-broken', source: 'fallback-text', generation: 'live' });
  });

  it('a cause the reader does not know is no reason at all, never a guess', () => {
    expect(readWindowReason({ cause: 'no-metadata' })).toBeUndefined();
    expect(readWindowReason(undefined)).toBeUndefined();
  });
});
