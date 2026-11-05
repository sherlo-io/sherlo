/**
 * WHAT THE APP THREW, where, and when a fake gave it the wrong shape of data.
 *
 * Pure, like everything under ./: the scene's record in, lines out.
 */
import chalk from 'chalk';
import { errorLine } from './capturedStory';
import type { SceneLeft } from './capturedScene';

function shape(name: string): string {
  const article = /^[aeiou]/.test(name) ? 'an' : 'a';
  return `${article} ${name}`;
}

/** The app threw, where, and when a fake gave it the wrong shape of data: which field, and what to give instead. */
export function threwLines(threw: SceneLeft['threw'], cause: SceneLeft['crashCause']): string[] {
  if (!threw) return [];
  return [
    errorLine(threw),
    ...(threw.file ? [chalk.dim(`    at ${threw.file}${threw.line ? `:${threw.line}` : ''}`)] : []),
    ...(cause
      ? [
          '',
          `  A fake gave ${chalk.bold(cause.dataPath)} as ${shape(cause.gave)}, and the app reads it as ${shape(cause.appExpects)}.`,
          `  Fix: give ${cause.dataPath} as ${shape(cause.appExpects)} in the scene's mock.`,
        ]
      : []),
  ];
}
