/**
 * The story files a started test lists under its row, read through the shipped renderer with
 * colour off: which rows carry a plus and which carry none.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderSegment } from '../renderSegment';
import type { PlatformCapture } from '../testSteps';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

function storyFileRows(capture: PlatformCapture[]): string[] {
  const { prints } = renderSegment({
    kind: 'test-started',
    buildIndex: 1,
    capture,
    rowsAbove: { rows: [], printedAsTheyHappened: false },
  });
  return prints.map(([line]) => String(line)).filter((line) => /^\s+[+~ ] \S/.test(line));
}

const CAPTURED: PlatformCapture = {
  platform: 'ios',
  full: true,
  capturedStories: 0,
  reason: 'first build - nothing to compare against yet',
  storyFiles: ['Hello.stories.tsx', 'Cart.stories.tsx'],
  newStoryFiles: ['Hello.stories.tsx', 'Cart.stories.tsx'],
  storyTitles: [
    { storyFile: 'Hello.stories.tsx', title: 'Sanity/Hello', stories: 1 },
    { storyFile: 'Cart.stories.tsx', title: 'Shop/Cart', stories: 2 },
  ],
};

describe('the story files listed under a started test', () => {
  it('a build with an earlier build to compare against marks the files that are new', () => {
    const rows = storyFileRows([
      { ...CAPTURED, reason: 'no main branch is set', newStoryFiles: ['Cart.stories.tsx'] },
    ]);
    expect(rows.map((row) => row.trim())).toEqual([
      '+ Shop/Cart (2 stories)',
      'Sanity/Hello (1 story)',
    ]);
  });
});
