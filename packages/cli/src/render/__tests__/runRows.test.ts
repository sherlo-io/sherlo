/**
 * The story files a started test lists under its row, read through the shipped renderer with
 * colour off: which rows carry a plus and which carry none.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { nothingToCaptureWords } from '../../commands/test/waitForQuickCheck';
import { renderDiffScopeLines } from '../diffScopeLines';
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

  it('a first look lists its stories with no changed mark', () => {
    const rows = storyFileRows([
      {
        ...CAPTURED,
        full: false,
        firstLook: true,
        capturedStories: 1,
        newStoryFiles: [],
        storyFiles: ['Hello.stories.tsx'],
        changedStoryFiles: ['Hello.stories.tsx'],
      },
    ]);
    expect(rows.map((row) => row.trim())).toEqual(['Sanity/Hello (1 story)']);
  });
});

describe('the lines under a started test', () => {
  it("the three lines under a test's row come from one function for every case", () => {
    const narrowed: PlatformCapture = {
      platform: 'android',
      full: false,
      capturedStories: 77,
      storiesInBundle: 384,
      diffScope: {
        storiesChecked: 384,
        storiesLookDifferent: 26,
        storiesCouldNotBeChecked: 51,
        storiesCaptured: 77,
        storiesReused: 307,
        changedFiles: ['src/a.ts'],
        reason: 'src/a.ts changed',
      },
    };
    const full: PlatformCapture = {
      platform: 'android',
      full: true,
      capturedStories: 0,
      storiesInBundle: 442,
      reason: 'native code changed since Test 14',
      diffScope: {
        reason: 'native code changed since Test 14',
        storiesChecked: 442,
        storiesCaptured: 442,
        storiesReused: 0,
      },
    };

    for (const capture of [narrowed, full]) {
      const { prints } = renderSegment({
        kind: 'test-started',
        buildIndex: 1,
        capture: [capture],
        rowsAbove: { rows: [], printedAsTheyHappened: false },
      });
      const printed = prints.map(([line]) => String(line).trim());
      const [checkedLine, capturedLine, reusedLine] = renderDiffScopeLines([capture]);

      expect(printed).toEqual(expect.arrayContaining([checkedLine, capturedLine, reusedLine]));
    }
  });

  it('a test whose platforms differ prints a line naming each platform above its three lines', () => {
    const answer = (full: boolean, storiesChecked: number, storiesCaptured: number) => ({
      full,
      capturedStories: 0,
      diffScope: { reason: 'x changed', storiesChecked, storiesCaptured, storiesReused: 0 },
    });
    const { prints } = renderSegment({
      kind: 'test-started',
      buildIndex: 1,
      capture: [
        { platform: 'ios', ...answer(true, 10, 10) },
        { platform: 'android', ...answer(false, 8, 3) },
      ],
      rowsAbove: { rows: [], printedAsTheyHappened: false },
    });
    const printed = prints.map(([line]) => String(line).trim());

    const android = printed.indexOf('🤖 Android');
    const ios = printed.indexOf('🍎 iOS');
    expect(android).toBeGreaterThan(-1);
    expect(printed[android + 1]).toBe('8 checked, after x changed');
    expect(ios).toBe(android + 4);
    expect(printed[ios + 1]).toBe('10 checked, after x changed');
  });

  it('a finished test with nothing to capture prints its three lines from the answer', () => {
    const reason = nothingToCaptureWords({
      runStatus: 'finished',
      platforms: {
        android: {
          arrived: true,
          capture: {
            full: false,
            reason: 'src/utils/analytics.ts changed',
            storyFiles: [],
            storiesChecked: 384,
            storiesLookDifferent: 0,
            storiesCouldNotBeChecked: 0,
            storiesCaptured: 0,
            storiesReused: 384,
          },
        },
      },
    });

    const { prints } = renderSegment({
      kind: 'verdict-server-bypassed',
      reason: reason!,
      testIndex: 15,
      rowsAbove: { rows: [], printedAsTheyHappened: false },
    });

    expect(prints.map(([line]) => String(line).trim())).toEqual([
      'Test 15     ✔ Finished: nothing to capture',
      '384 checked, after src/utils/analytics.ts changed',
      '0 captured: 0 look different, 0 could not be checked',
      '384 reuse their last picture, no devices started',
    ]);
  });
});
