/**
 * THE LINES UNDER THE TEST'S ROW THAT SAY WHAT DIFF SCOPE DECIDED, in a customer's words: how many
 * stories it checked, how many are captured, how many reuse their last picture, and why.
 *
 *     Test 15     ✔ Started: 77 of 384 stories on 1 device (Pixel 7)
 *                   Checked 384 stories: 26 look different, 51 could not be checked.
 *                   Capturing those 77. The other 307 reuse their last picture.
 *                   Changed: src/components/Button/Button.Text.tsx
 *
 * Three wordings exist side by side (A sentences, B numbers first, C one line and its reason);
 * `diffScope.style` says which prints.
 *
 * Pure, like everything under ./. Words a customer does not know are not used here.
 */
import chalk from 'chalk';
import type { PlatformCapture } from './testSteps';

/** The lines, unindented; none when the server sent no Diff Scope numbers. */
export function renderDiffScopeLines(capture: PlatformCapture[]): string[] {
  const [first] = capture;
  if (!first?.diffScope) return [];

  const { diffScope, full, capturedStories } = first;
  const inScope = diffScope.checked ?? first.storiesInBundle;
  const reused = inScope != null && !full ? inScope - capturedStories : 0;
  const stories = (count: number) => (count === 1 ? '1 story' : `${count} stories`);
  const warning = chalk.yellow('!');

  const lookDifferent = diffScope.lookDifferent ?? 0;
  const couldNotCheck = diffScope.couldNotCheck ?? 0;
  const found = `${lookDifferent} look different, ${couldNotCheck} could not be checked`;

  // Case 3: every story is captured for a reason the quick check did not even start on.
  if (full && diffScope.fullReason) {
    switch (diffScope.style) {
      case 'A':
        return [
          `Capturing every story: ${diffScope.fullReason}.`,
          'None can reuse its last picture.',
        ];
      case 'B':
        return [
          `${first.storiesInBundle ?? inScope} captured`,
          `0 reuse their last picture, because ${diffScope.fullReason}`,
        ];
      case 'C':
        return []; // the Started row already ends on the reason, as it does today
    }
  }

  // Case 4: the quick check could not finish, so every story the change can reach is captured.
  if (diffScope.unfinished) {
    switch (diffScope.style) {
      case 'A':
        return [
          `${warning} The quick check could not finish, so Sherlo could not narrow the test.`,
          `${capturedStories} are captured: every story ${diffScope.changedFile} can reach.`,
          `${reused} reuse their last picture.`,
        ];
      case 'B':
        return [
          `${warning} ${capturedStories} captured: every story ${diffScope.changedFile} can reach`,
          `${warning} The quick check could not finish`,
          `${reused} reuse their last picture`,
        ];
      case 'C':
        return [
          `${warning} The quick check could not finish: capturing every story ${diffScope.changedFile} can reach`,
        ];
    }
  }

  // Case 1: Diff Scope checked the stories and narrowed the test.
  switch (diffScope.style) {
    case 'A':
      return [
        `Checked ${stories(inScope ?? 0)}: ${found}.`,
        `${capturedStories} are captured. ${reused} reuse their last picture.`,
        ...(diffScope.changedFile ? [`Changed: ${diffScope.changedFile}`] : []),
      ];
    case 'B':
      return [
        `${inScope} checked, after ${diffScope.changedFile} changed`,
        `${capturedStories} captured: ${found}`,
        `${reused} reuse their last picture`,
      ];
    case 'C':
      return [`Because ${diffScope.changedFile} changed: ${found}`];
  }
}
