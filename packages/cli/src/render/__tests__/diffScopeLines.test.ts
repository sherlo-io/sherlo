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
    changedFiles: [CHANGED_FILE],
  },
};

describe('the lines the test prints about Diff Scope', () => {
  it('prints the three lines for a narrowed capture', () => {
    expect(renderDiffScopeLines([NARROWED])).toEqual([
      `384 checked, after ${CHANGED_FILE} changed`,
      '77 captured: 26 look different, 51 could not be checked',
      '307 reuse their last picture',
    ]);
  });

  it('prints the three lines for a full capture with its reason', () => {
    const full: PlatformCapture = {
      platform: 'android',
      full: true,
      capturedStories: 0,
      storiesInBundle: 442,
      reason: 'native code changed since Test 14',
      diffScope: { reason: 'native code changed since Test 14', storiesChecked: 442 },
    };

    expect(renderDiffScopeLines([full])).toEqual([
      '442 checked, after native code changed since Test 14',
      '442 captured: every story',
      '0 reuse their last picture',
    ]);
  });

  it('prints the three lines with a warning when the quick check could not finish', () => {
    const unfinished: PlatformCapture = {
      ...NARROWED,
      capturedStories: 197,
      diffScope: {
        storiesChecked: 384,
        changedFiles: [CHANGED_FILE],
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

  it.todo('prints the captured and reused counts the service answered, not a sum of its own');
  it.todo('prints the three lines once when both platforms answered the same');
  it.todo(
    'prints the three lines once per platform under a line naming it when the platforms differ'
  );
  it.todo('marks the captured line with a warning when the quick check failed');
  it.todo(
    'names the changed file when one file changed and says the several-files words when more than one did'
  );
});
