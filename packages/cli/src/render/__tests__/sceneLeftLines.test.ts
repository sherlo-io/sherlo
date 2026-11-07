/**
 * What a scene left behind, under its ending: the discover list of rules to paste, and the
 * requests no mock answered. Colour is off; the whole screens are the poses under poses/capture.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { leftLines } from '../sceneLeftLines';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

const FEED = { method: 'GET', url: 'https://api.kindred.test/feed' };

describe('the lines under a scene ending', () => {
  it('prints nothing for a scene that left nothing behind', () => {
    expect(leftLines({})).toEqual([]);
  });

  it('lists a request no mock answered under a scene that is not a discover capture', () => {
    const text = leftLines({ unanswered: [FEED] }).join('\n');

    expect(text).toContain('GET https://api.kindred.test/feed');
  });

  it('gives a discover capture each request once as the rule that would answer it', () => {
    const lines = leftLines({ discover: true, unanswered: [FEED, FEED] });

    expect(lines.filter((line) => line.includes('mockRequest('))).toHaveLength(1);
    expect(lines.join('\n')).toContain('1 request had no mock. Paste this rule');
  });

  it('says that no request went without a mock when a discover capture found none', () => {
    expect(leftLines({ discover: true })).toContain('No request went without a mock.');
  });
});
