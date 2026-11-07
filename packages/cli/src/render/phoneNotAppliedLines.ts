/**
 * THE PHONE SETTINGS A SCENE ASKED FOR that Sherlo could not write, said before anything else.
 *
 * Pure, like everything under ./: the scene's record in, lines out; nothing when its case does not apply.
 */
import chalk from 'chalk';
import type { SceneLeft } from './capturedScene';

/** The phone settings the scene asked for and Sherlo could not write, said before anything else. */
export function phoneNotAppliedLines(left: SceneLeft): string[] {
  const { phoneNotApplied } = left;
  if (!phoneNotApplied || phoneNotApplied.length === 0) return [];
  return [
    ...phoneNotApplied.map(
      ({ setting, wanted, why }) =>
        `${chalk.yellow('◦')}  The scene asks for ${setting}: ${wanted}, and Sherlo could not set it on the phone: ${
          why === 'app-not-installed' ? 'the app is not installed there yet' : 'the phone refused'
        }`
    ),
    chalk.dim(
      phoneNotApplied.some((one) => one.why === 'app-not-installed')
        ? '   Install the app on the phone (run it once from your IDE), then capture again so the setting is in place.'
        : '   Set it by hand in the phone, then capture again.'
    ),
    '',
  ];
}
