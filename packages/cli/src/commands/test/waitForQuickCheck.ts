/**
 * THE WAIT FOR THE QUICK CHECK: opening a test cannot wait for it (the service's call has a 30
 * second limit), so the service starts the quick check and the command line asks for the test's
 * status until no platform is running one, then prints the test's row and the lines under it from
 * the finished answer.
 *
 * It waits for no more than {@link QUICK_CHECK_WAIT_LIMIT_SECONDS}; a quick check still running
 * then is the service's to finish, and the row prints from the last answer it gave.
 */
import type { Platform } from '@sherlo/api-types';
import type { BuildStatus } from '../../helpers/buildStatusRequest';
import { hasDiffScopeNumbers, renderDiffScopeLines } from '../../render/diffScopeLines';
import type { PlatformCapture } from '../../render/testSteps';
import { serverCalls, type OpenBuildAnswer } from '../../seams/serverCalls';
import { surroundings } from '../../seams/surroundings';
import { whileShowing } from '../shared/terminal';

/** The longest the command line waits for the quick check, in seconds. */
export const QUICK_CHECK_WAIT_LIMIT_SECONDS = 120;

/** The one line shown while the command waits. */
export const QUICK_CHECK_WAITING_WORDS = 'Checking which stories may look different';

const SECONDS_BETWEEN_ASKS = 3;

/**
 * Asks for the test's status until no platform runs a quick check, and returns the last answer.
 * Returns at once, showing nothing and asking nothing, when the open answer names no platform
 * running a quick check (`NOT_NEEDED`, or no field). A read that fails ends the wait: the row then
 * prints from what the open answer said.
 */
export async function waitForQuickCheck({
  openBuildReturn,
  token,
  projectIndex,
  teamId,
}: {
  openBuildReturn: OpenBuildAnswer;
  token: string;
  projectIndex: number;
  teamId: string;
}): Promise<BuildStatus | undefined> {
  const openedPlatforms = Object.values(openBuildReturn.build.diffScopeInfo?.platforms ?? {});
  if (!openedPlatforms.some((platform) => platform?.quickCheck === 'RUNNING')) return undefined;

  return whileShowing(
    { kind: 'quick-check-waiting', words: QUICK_CHECK_WAITING_WORDS },
    async () => {
      let lastAnswer: BuildStatus | undefined;
      for (
        let waitedSeconds = 0;
        waitedSeconds < QUICK_CHECK_WAIT_LIMIT_SECONDS;
        waitedSeconds += SECONDS_BETWEEN_ASKS
      ) {
        try {
          lastAnswer =
            (await serverCalls().getBuildStatus({
              token,
              buildIndex: openBuildReturn.build.index,
              projectIndex,
              teamId,
              boundedRead: true,
            })) ?? lastAnswer;
        } catch {
          // The row is cosmetic beside the run itself: a read that fails ends the wait, never the test.
          return lastAnswer;
        }
        const stillRunning = Object.values(lastAnswer?.platforms ?? {}).some(
          (platform) => platform?.quickCheck === 'RUNNING'
        );
        if (!stillRunning) return lastAnswer;
        // The last ask is the limit's: nothing is slept after it.
        if (waitedSeconds + SECONDS_BETWEEN_ASKS < QUICK_CHECK_WAIT_LIMIT_SECONDS) {
          await surroundings().sleep(SECONDS_BETWEEN_ASKS * 1000);
        }
      }
      return lastAnswer;
    }
  );
}

/**
 * What each platform captures once the quick check has answered: the open answer's capture, with
 * the numbers, the reason and the story files the status gives in their place. A platform the
 * answer has no numbers for stays as the open answer said it.
 */
export function captureWithTheAnswer(
  capture: PlatformCapture[],
  answer: BuildStatus | undefined
): PlatformCapture[] {
  return capture.map((platformCapture) => {
    const answered = answer?.platforms?.[platformCapture.platform];
    if (!answered || !hasDiffScopeNumbers(answered)) return platformCapture;

    const storyFiles = answered.capture?.full === false ? answered.capture.storyFiles : undefined;
    return {
      ...platformCapture,
      full: answered.capture?.full ?? platformCapture.full,
      capturedStories: answered.storiesCaptured,
      ...(storyFiles ? { storyFiles, changedStoryFiles: storyFiles } : {}),
      diffScope: {
        ...platformCapture.diffScope,
        ...numbersOf(answered),
        reason: answered.capture?.reason ?? platformCapture.diffScope?.reason,
      },
    };
  });
}

/**
 * The words of a test the service closed with nothing to capture, from the answer's numbers: the
 * row's `nothing to capture`, then the three lines. None when the answer carries no numbers.
 */
export function nothingToCaptureWords(answer: BuildStatus): string | undefined {
  const capture: PlatformCapture[] = [];
  for (const platform of ['android', 'ios'] as Platform[]) {
    const answered = answer.platforms?.[platform];
    if (!answered || !hasDiffScopeNumbers(answered)) continue;
    capture.push({
      platform,
      full: false,
      capturedStories: 0,
      diffScope: { ...numbersOf(answered), reason: answered.capture?.reason ?? undefined },
    });
  }

  const lines = renderDiffScopeLines(capture).map((line) =>
    line.endsWith('reuse their last picture') ? `${line}, no devices started` : line
  );
  return lines.length > 0 ? ['nothing to capture', ...lines].join('\n') : undefined;
}

/** The quick check's state and counts of one platform's answer, and nothing else it holds. */
function numbersOf(answered: NonNullable<BuildStatus['platforms']>[Platform]) {
  return {
    quickCheck: answered?.quickCheck,
    quickCheckFault: answered?.quickCheckFault,
    storiesChecked: answered?.storiesChecked,
    storiesLookDifferent: answered?.storiesLookDifferent,
    storiesCouldNotBeChecked: answered?.storiesCouldNotBeChecked,
    storiesCaptured: answered?.storiesCaptured,
    storiesReused: answered?.storiesReused,
    changedFiles: answered?.changedFiles,
  };
}
