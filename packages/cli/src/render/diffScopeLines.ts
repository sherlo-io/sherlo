/**
 * THE THREE LINES UNDER THE TEST'S ROW THAT SAY WHAT DIFF SCOPE DECIDED, in a customer's words,
 * the same three in every case:
 *
 *     Test 15     ✔ Started: 77 of 384 stories on 1 device (Pixel 7)
 *                   384 checked, after src/components/Button/Button.Text.tsx changed
 *                   77 captured: 26 look different, 51 could not be checked
 *                   307 reuse their last picture
 *
 * Only what follows `captured:` and the reason on the first line change from case to case. After
 * `captured:` come the kinds that have stories, in this order: look different, could not be
 * checked, are new or read a changed file (new stories and stories reading a changed picture or
 * font file, which need no check). With none of the last kind it stays "N look different, N could
 * not be checked", counts of 0 included:
 *
 *     5 captured: 1 look different, 4 are new or read a changed file
 *
 * Pure, like everything under ./. Words a customer does not know are not used here.
 */
import chalk from 'chalk';
import type { DiffScopeNumbers } from '../seams/serverCalls';
import { platformWithEmoji, type PlatformCapture } from './testSteps';

const QUICK_CHECK_FAILED_WORDS =
  'the quick check could not finish, so every story the change can reach';

/** Whether the service sent Diff Scope's numbers for this platform: an answer with only a reason has none. */
export function hasDiffScopeNumbers<Answer extends DiffScopeNumbers>(
  diffScope: Answer | undefined
): diffScope is Answer & {
  storiesChecked: number;
  storiesCaptured: number;
  storiesReused: number;
} {
  return (
    typeof diffScope?.storiesChecked === 'number' &&
    typeof diffScope.storiesCaptured === 'number' &&
    typeof diffScope.storiesReused === 'number'
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
  const quickCheckFailed = diffScope?.quickCheck === 'FAILED' && !full;
  if (!hasDiffScopeNumbers(diffScope)) {
    return quickCheckFailed ? [`${chalk.yellow('!')} ${QUICK_CHECK_FAILED_WORDS} is captured`] : [];
  }

  const whatTheyAre = full
    ? 'every story'
    : quickCheckFailed
      ? QUICK_CHECK_FAILED_WORDS
      : capturedKinds(diffScope);
  const warning = quickCheckFailed ? `${chalk.yellow('!')} ` : '';
  const after = diffScope.reason ? `, after ${diffScope.reason}` : '';

  return [
    `${diffScope.storiesChecked} checked${after}`,
    `${warning}${diffScope.storiesCaptured} captured: ${whatTheyAre}`,
    `${diffScope.storiesReused} reuse their last picture`,
  ];
}

function capturedKinds(diffScope: {
  storiesCaptured: number;
  storiesLookDifferent?: number | null;
  storiesCouldNotBeChecked?: number | null;
}): string {
  const lookDifferent = diffScope.storiesLookDifferent ?? 0;
  const couldNotBeChecked = diffScope.storiesCouldNotBeChecked ?? 0;
  const newOrChangedFile = diffScope.storiesCaptured - lookDifferent - couldNotBeChecked;
  if (newOrChangedFile <= 0) {
    return `${lookDifferent} look different, ${couldNotBeChecked} could not be checked`;
  }

  return [
    lookDifferent > 0 && `${lookDifferent} look different`,
    couldNotBeChecked > 0 && `${couldNotBeChecked} could not be checked`,
    `${newOrChangedFile} are new or read a changed file`,
  ]
    .filter(Boolean)
    .join(', ');
}
