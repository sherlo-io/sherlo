import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderDiffScopeLines } from '../diffScopeLines';
import type { PlatformCapture } from '../testSteps';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

const CHANGED_FILE = 'src/components/Button/Button.Text.tsx';

const NARROWED: PlatformCapture = {
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
    changedFiles: [CHANGED_FILE],
    reason: `${CHANGED_FILE} changed`,
  },
};

const FULL: PlatformCapture = {
  platform: 'ios',
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

describe('the lines the test prints about Diff Scope', () => {
  it('prints the captured and reused counts the service answered, not a sum of its own', () => {
    const answered: PlatformCapture = {
      ...NARROWED,
      capturedStories: 5,
      diffScope: {
        ...NARROWED.diffScope,
        storiesChecked: 100,
        storiesCaptured: 40,
        storiesReused: 61,
      },
    };

    expect(renderDiffScopeLines([answered]).slice(1)).toEqual([
      '40 captured: 26 look different, 51 could not be checked',
      '61 reuse their last picture',
    ]);
  });

  it('prints the three lines once when both platforms answered the same', () => {
    expect(renderDiffScopeLines([NARROWED, { ...NARROWED, platform: 'ios' }])).toEqual([
      `384 checked, after ${CHANGED_FILE} changed`,
      '77 captured: 26 look different, 51 could not be checked',
      '307 reuse their last picture',
    ]);
  });

  it('prints the three lines once per platform under a line naming it when the platforms differ', () => {
    expect(renderDiffScopeLines([FULL, NARROWED])).toEqual([
      '🤖 Android',
      `384 checked, after ${CHANGED_FILE} changed`,
      '77 captured: 26 look different, 51 could not be checked',
      '307 reuse their last picture',
      '🍎 iOS',
      '442 checked, after native code changed since Test 14',
      '442 captured: every story',
      '0 reuse their last picture',
    ]);
  });

  it('names the changed file when one file changed and says the several-files words when more than one did', () => {
    const several: PlatformCapture = {
      ...NARROWED,
      diffScope: {
        ...NARROWED.diffScope,
        changedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
        reason: '4 files changed',
      },
    };

    expect(renderDiffScopeLines([NARROWED])[0]).toBe(`384 checked, after ${CHANGED_FILE} changed`);
    expect(renderDiffScopeLines([several])[0]).toBe('384 checked, after 4 files changed');
  });

  it('prints the three lines for a narrowed capture', () => {
    expect(renderDiffScopeLines([NARROWED])).toEqual([
      `384 checked, after ${CHANGED_FILE} changed`,
      '77 captured: 26 look different, 51 could not be checked',
      '307 reuse their last picture',
    ]);
  });

  it('prints the three lines for a full capture with its reason', () => {
    const full = FULL;

    expect(renderDiffScopeLines([full])).toEqual([
      '442 checked, after native code changed since Test 14',
      '442 captured: every story',
      '0 reuse their last picture',
    ]);
  });

  it('marks the captured line with a warning when the quick check failed', () => {
    const unfinished: PlatformCapture = {
      ...NARROWED,
      capturedStories: 197,
      diffScope: {
        storiesChecked: 384,
        storiesCaptured: 197,
        storiesReused: 187,
        reason: `${CHANGED_FILE} changed`,
        quickCheck: 'FAILED',
      },
    };

    expect(renderDiffScopeLines([unfinished])).toEqual([
      `384 checked, after ${CHANGED_FILE} changed`,
      '! 197 captured: the quick check could not finish, so every story the change can reach',
      '187 reuse their last picture',
    ]);
  });

  it('prints nothing when the server sent no Diff Scope numbers', () => {
    expect(
      renderDiffScopeLines([{ ...NARROWED, diffScope: { reason: 'no main branch' } }])
    ).toEqual([]);
    expect(renderDiffScopeLines([{ ...NARROWED, diffScope: undefined }])).toEqual([]);
    expect(renderDiffScopeLines([])).toEqual([]);
  });
});
