/**
 * THE THREE LINES UNDER THE TEST'S ROW THAT SAY WHAT DIFF SCOPE DECIDED, in a customer's words,
 * the same three in every case:
 *
 *     Test 15     ✔ Started: 77 of 384 stories on 1 device (Pixel 7)
 *                   384 checked, after src/components/Button/Button.Text.tsx changed
 *                   77 captured: 26 look different, 51 could not be checked
 *                   307 reuse their last picture
 *
 * Only what follows `captured:` and the reason on the first line change from case to case.
 *
 * Pure, like everything under ./. Words a customer does not know are not used here.
 */
import chalk from 'chalk';
import type { PlatformCapture } from './testSteps';

/** The three lines, unindented; none when the server sent no Diff Scope numbers. */
export function renderDiffScopeLines(capture: PlatformCapture[]): string[] {
  const [first] = capture;
  if (!first?.diffScope) return [];

  const { diffScope, full, capturedStories } = first;
  const everyStory = full && diffScope.fullReason !== undefined;
  const checked = everyStory
    ? (first.storiesInBundle ?? 0)
    : (diffScope.checked ?? first.storiesInBundle ?? 0);
  const captured = everyStory ? checked : capturedStories;
  const reused = full ? 0 : checked - capturedStories;

  const changed = everyStory ? diffScope.fullReason : `${diffScope.changedFile} changed`;
  const whatTheyAre = everyStory
    ? 'every story'
    : diffScope.unfinished
      ? 'the quick check could not finish, so every story the change can reach'
      : `${diffScope.lookDifferent ?? 0} look different, ${diffScope.couldNotCheck ?? 0} could not be checked`;
  const warning = diffScope.unfinished ? `${chalk.yellow('!')} ` : '';

  return [
    `${checked} checked, after ${changed}`,
    `${warning}${captured} captured: ${whatTheyAre}`,
    `${reused} reuse their last picture`,
  ];
}
