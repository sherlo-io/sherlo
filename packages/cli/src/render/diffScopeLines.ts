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
import type { DiffScopeNumbers } from '../seams/serverCalls';
import { platformWithEmoji, type PlatformCapture } from './testSteps';

/** Whether the service sent Diff Scope's numbers for this platform: an answer with only a reason has none. */
export function hasDiffScopeNumbers<Answer extends DiffScopeNumbers>(
  diffScope: Answer | undefined
): diffScope is Answer & {
  storiesChecked: number;
  storiesCaptured: number;
  storiesReused: number;
} {
  return (
    diffScope?.storiesChecked !== undefined &&
    diffScope.storiesCaptured !== undefined &&
    diffScope.storiesReused !== undefined
  );
}

/**
 * The three lines, unindented, with the numbers the service answered. One block when every
 * platform's lines are equal; else one block per platform, Android first, each under a line naming
 * it. None when the server sent no Diff Scope numbers.
 */
export function renderDiffScopeLines(capture: PlatformCapture[]): string[] {
  const blocks = [...capture]
    .sort((a, b) => Number(b.platform === 'android') - Number(a.platform === 'android'))
    .map((platformCapture) => ({
      platform: platformCapture.platform,
      lines: renderPlatformLines(platformCapture),
    }))
    .filter(({ lines }) => lines.length > 0);

  const [first] = blocks;
  if (!first) return [];
  if (blocks.every(({ lines }) => lines.join('\n') === first.lines.join('\n'))) return first.lines;

  return blocks.flatMap(({ platform, lines }) => [platformWithEmoji(platform), ...lines]);
}

function renderPlatformLines({ full, diffScope }: PlatformCapture): string[] {
  if (!hasDiffScopeNumbers(diffScope)) return [];

  const quickCheckFailed = diffScope.quickCheck === 'FAILED' && !full;
  const whatTheyAre = full
    ? 'every story'
    : quickCheckFailed
      ? 'the quick check could not finish, so every story the change can reach'
      : `${diffScope.storiesLookDifferent ?? 0} look different, ${diffScope.storiesCouldNotBeChecked ?? 0} could not be checked`;
  const warning = quickCheckFailed ? `${chalk.yellow('!')} ` : '';
  const after = diffScope.reason ? `, after ${diffScope.reason}` : '';

  return [
    `${diffScope.storiesChecked} checked${after}`,
    `${warning}${diffScope.storiesCaptured} captured: ${whatTheyAre}`,
    `${diffScope.storiesReused} reuse their last picture`,
  ];
}
