/**
 * THE DECLARED MODULE FAKES the app never used.
 *
 * Pure, like everything under ./: the scene's record in, lines out.
 */
import chalk from 'chalk';
import type { SceneLeft } from './capturedScene';

/** The declared module fakes the app never used: a short list, each with its reason when known. */
export function mockNotAppliedLines(unapplied: SceneLeft['mockNotApplied']): string[] {
  if (!unapplied || unapplied.length === 0) return [];
  return [
    '',
    `${chalk.yellow('◦')}  ${unapplied.length} module ${unapplied.length === 1 ? 'fake' : 'fakes'} declared, did not apply:`,
    ...unapplied.map(({ module, why: reason }) =>
      reason === 'bundler-had-not-seen-it'
        ? `     ${module}  ${chalk.dim('the bundler had not seen the module when it started: restart it')}`
        : `     ${module}`
    ),
    chalk.dim('   The app ran the real module instead. Restart the bundler, then capture again.'),
  ];
}
