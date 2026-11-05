/**
 * WHAT TO CHECK when the app is on its route and drew nothing.
 *
 * Pure, like everything under ./: the scene id in, lines out.
 */

/** What to check when the app is on its route and drew nothing. */
export function blankScreenLines(sceneId: string): string[] {
  return [
    '  Check next:',
    '     - a module fake that did not apply leaves the real module running, and a screen built on it can draw nothing',
    '     - an error the app logged while it drew (the lines below, when there are any)',
    '',
    `  See what the app logged:  npx sherlo capture --scene ${sceneId} --logs`,
  ];
}
