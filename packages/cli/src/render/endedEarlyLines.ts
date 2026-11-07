/**
 * WHY THE CAPTURE GAVE UP BEFORE ITS PATIENCE RAN OUT: the app was covered by a screen the scene
 * does not answer.
 *
 * Pure, like everything under ./: the scene's record in, lines out.
 */
import { seconds } from './capturedStory';
import type { SceneEndedEarly } from './sceneStop';

/** The lines that say nobody faked who is logged in, which sent the app to sign-in. */
export const NO_LOGGED_IN_USER = [
  '  Nothing faked who is logged in, so the app sent itself to sign-in. ' +
    "Add a logged-in user to the scene's mocks.",
];

/** Why the capture gave up before its patience ran out, and what to do about the screen it stopped on. */
export function endedEarlyLines(early: SceneEndedEarly | undefined): string[] {
  if (!early) return [];
  if (early.stuckOn === 'sign-in') {
    return [
      `  Sherlo stopped after ${seconds(early.afterMs)}: the app was still on a sign-in screen.`,
      ...NO_LOGGED_IN_USER,
    ];
  }
  return [
    `  Sherlo stopped after ${seconds(early.afterMs)}: the app was still on a consent screen that nothing in the scene answers.`,
    `  Tap through it in the scene's play${early.button ? ':' : ', or fake the stored answer.'}`,
    ...(early.button ? [`     play: [{ tap: { label: ${JSON.stringify(early.button)} } }]`] : []),
  ];
}
