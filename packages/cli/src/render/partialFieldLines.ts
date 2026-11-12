/**
 * THE PARTIAL FIELDS A SCENE DOES NOT NAME, from what the app logged, and the block that names them.
 *
 * Pure, like everything under ./: the scene's record in, lines out.
 */
import chalk from 'chalk';
import { PARTIAL_READ } from './partialRead';
import type { SceneLeft } from './capturedScene';

/** The partial fields the scene does not name, from what the app logged, and the block that names them. */
export function partialFieldLines(logged: SceneLeft['loggedErrors']): string[] {
  const fields = (logged?.messages ?? []).flatMap(({ message }) => {
    const field = PARTIAL_READ.exec(message)?.[1];
    return field ? [field] : [];
  });
  if (!logged || fields.length === 0) return [];
  return [
    '',
    `${chalk.yellow('◦')}  ${fields.length} ${fields.length === 1 ? 'field was' : 'fields were'} read of a partial object that the scene does not name:`,
    ...logged.messages
      .filter(({ message }) => PARTIAL_READ.test(message))
      .map(({ message }) => `     ${message}`),
    '  Paste the fields into the partial and fill in each value:',
    ...fields.map((field) => `     ${field}: /* fill in */,`),
  ];
}
