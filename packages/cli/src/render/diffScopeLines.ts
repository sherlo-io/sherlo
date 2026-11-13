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
import type { PlatformDiffScope } from '../seams/serverCalls';
import type { PlatformCapture } from './testSteps';

/** Whether the service sent Diff Scope's numbers for this platform: an answer with only a reason has none. */
export function hasDiffScopeNumbers(
  diffScope: PlatformDiffScope | undefined
): diffScope is PlatformDiffScope & { storiesChecked: number } {
  return diffScope?.storiesChecked !== undefined;
}

/** The three lines, unindented; none when the server sent no Diff Scope numbers. */
export function renderDiffScopeLines(capture: PlatformCapture[]): string[] {
  const [first] = capture;
  if (!first || !hasDiffScopeNumbers(first.diffScope)) return [];

  const { diffScope } = first;
  const everyStoryBecause = first.full ? diffScope.reason : undefined;
  const quickCheckFailed = diffScope.quickCheck === 'FAILED';

  const checked = diffScope.storiesChecked;
  const captured = everyStoryBecause !== undefined ? checked : first.capturedStories;
  const reused = first.full ? 0 : checked - first.capturedStories;

  const changed = everyStoryBecause ?? `${diffScope.changedFiles?.[0]} changed`;
  const whatTheyAre =
    everyStoryBecause !== undefined
      ? 'every story'
      : quickCheckFailed
        ? 'the quick check could not finish, so every story the change can reach'
        : `${diffScope.storiesLookDifferent ?? 0} look different, ${diffScope.storiesCouldNotBeChecked ?? 0} could not be checked`;
  const warning = quickCheckFailed ? `${chalk.yellow('!')} ` : '';

  return [
    `${checked} checked, after ${changed}`,
    `${warning}${captured} captured: ${whatTheyAre}`,
    `${reused} reuse their last picture`,
  ];
}
