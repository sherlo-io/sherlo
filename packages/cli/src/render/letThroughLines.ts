/**
 * THE REQUESTS A RULE OF THE SCENE LET REACH THE REAL NETWORK, which can change the picture
 * between runs.
 *
 * Pure, like everything under ./: the scene's record in, lines out.
 */
import chalk from 'chalk';
import { ruleOf } from './mockRuleLine';
import type { SceneLeft } from './capturedScene';

/** Requests a rule of the scene let reach the real network: the picture may change between runs. */
export function letThroughLines(letThrough: SceneLeft['letThrough']): string[] {
  if (!letThrough || letThrough.length === 0) return [];
  const count = letThrough.length;
  return [
    '',
    `${chalk.yellow('◦')}  ${count} real ${count === 1 ? 'request was' : 'requests were'} made, so the picture may change between runs:`,
    ...letThrough.map(({ method, url }) => `     ${method} ${url}`),
    '  Fake them instead, one rule each:',
    ...[...new Set(letThrough.map(ruleOf))].map((rule) => `     ${rule}`),
  ];
}
