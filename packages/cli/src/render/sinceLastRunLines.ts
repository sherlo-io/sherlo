/**
 * WHAT CHANGED AGAINST THE LAST RUN of the same scene, row by row.
 *
 * Pure, like everything under ./: the scene's record in, lines out.
 */
import chalk from 'chalk';
import type { SceneLeft } from './capturedScene';

/** How the three endings a last run can have are told. */
const ENDING_WORDS = {
  captured: 'captured',
  'never-settled': 'never settled',
  'never-reached': 'never got ready',
};

/** What changed against the last run of the same scene, row by row, only the rows that changed. */
export function sinceLastRunLines(
  last: SceneLeft['lastRun'],
  now: { ending: NonNullable<SceneLeft['lastRun']>['ending']; route: string[]; refused: number }
): string[] {
  if (!last) return [];
  const rows = [
    ['ended', ENDING_WORDS[last.ending], ENDING_WORDS[now.ending]],
    ['route', last.route.join(' › '), now.route.join(' › ')],
    ['refused', String(last.refused), String(now.refused)],
  ].filter(([, before, after]) => before !== after);
  return [
    'Since the last run of this scene:',
    ...rows.map(([name, before, after]) => `  ${name.padEnd(9)}was ${before}, now ${after}`),
    chalk.dim('   Run git diff to see what changed since.'),
  ];
}
