/**
 * WHAT THE APP'S SCREEN SAID when a scene never got ready, or that it drew nothing.
 *
 * Pure, like everything under ./: the scene's record in, lines out.
 */
import chalk from 'chalk';
import type { SceneScreen } from './sceneStop';

/** How many words of the app's screen are quoted before the rest is left out. */
const SCREEN_WORDS_SHOWN = 6;

/** What the app's screen said, or that it drew nothing. */
export function screenLines(screen: SceneScreen | undefined): string[] {
  if (!screen) return [];
  if (screen.views === 0) return ['  The screen drew no views.'];
  const shown = screen.words.slice(0, SCREEN_WORDS_SHOWN).map((word) => `"${word}"`);
  const rest = screen.words.length - shown.length;
  return [
    `  The screen said: ${shown.join(', ')}${rest > 0 ? `, and ${rest} more` : ''}`,
    chalk.dim(`   ${screen.views} views drawn`),
  ];
}
