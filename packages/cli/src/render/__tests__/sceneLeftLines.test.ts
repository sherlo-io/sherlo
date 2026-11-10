/**
 * What a scene left behind, under its ending: the discover list of rules to paste, and the
 * requests no mock answered. Colour is off; the whole screens are the poses under poses/capture.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { discoverLeftLines, refusalLeftLines } from '../sceneLeftLines';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

const FEED = { method: 'GET', url: 'https://api.kindred.test/feed' };

describe('the lines under a scene ending', () => {
  it('prints nothing for a scene that left nothing behind', () => {
    expect(refusalLeftLines({})).toEqual([]);
  });

  it('lists a request no mock answered under a scene that is not a discover capture', () => {
    const text = refusalLeftLines({ unanswered: [FEED] }).join('\n');

    expect(text).toContain('GET https://api.kindred.test/feed');
  });

  it('gives a discover capture each request once as the rule that would answer it', () => {
    const lines = discoverLeftLines({ unanswered: [FEED, FEED] });

    expect(lines.filter((line) => line.includes('mockRequest('))).toHaveLength(1);
    expect(lines.join('\n')).toContain('1 request had no mock. Paste this rule');
  });

  it('says that no request went without a mock when a discover capture found none', () => {
    expect(discoverLeftLines({})).toContain('No request went without a mock.');
  });

  it('modules that ran real are folded into one count line with where the full list is kept', () => {
    const lines = refusalLeftLines({
      stillReal: ['src/a.ts', 'src/b.ts'],
      unanswered: [FEED],
    });
    const counted = lines.filter((line) => line.includes("2 of the app's own modules"));

    expect(counted).toEqual([
      "   Not mocked - 2 of the app's own modules ran as real code. The full list is in the capture's record in .sherlo/captures.",
    ]);
    expect(lines.join('\n')).not.toContain('src/a.ts');
    expect(lines.indexOf(counted[0])).toBeGreaterThan(
      lines.findIndex((line) => line.includes('api.kindred.test/feed'))
    );
  });
});
