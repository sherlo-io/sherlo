/**
 * THE ERRORS THE APP LOGGED during a scene, in the content's words.
 *
 * Pure, like everything under ./: the scene's record in, lines out.
 */
import { moreLines } from './moreLines';
import { PARTIAL_READ } from './partialRead';
import type { SceneLeft } from './capturedScene';

/** The errors the app logged during the scene, in the content's words, without the partial reads, which have their own block. */
export function loggedErrorLines(logged: SceneLeft['loggedErrors']): string[] {
  if (!logged) return [];
  const messages = logged.messages.filter(({ message }) => !PARTIAL_READ.test(message));
  if (messages.length === 0) return [];
  const count = messages.length + logged.moreLeftOut;
  return [
    '',
    `The app logged ${count === 1 ? '1 different error message' : `${count} different error messages`} during this scene:`,
    ...messages.map(({ message, times }) =>
      times > 1 ? `  ${message} (logged ${times} times)` : `  ${message}`
    ),
    ...moreLines(logged.moreLeftOut),
  ];
}
