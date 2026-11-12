/**
 * THE MOCK ANSWERS THE APP COULD NOT USE, with the fix beside each that has one.
 *
 * Pure, like everything under ./: the scene's record in, lines out.
 */
import { findingLine } from './findingLine';
import type { SceneLeft } from './capturedScene';

/** The mock answers the app could not use, with the fix beside each that has one. */
export function answerFindingLines(findings: SceneLeft['answerFindings']): string[] {
  if (!findings || findings.length === 0) return [];
  const fixes = [
    ...new Set(
      findings.flatMap(({ kind, expected }) =>
        kind === 'typename-missing' && expected ? [`__typename: '${expected}',`] : []
      )
    ),
  ];
  return [
    '',
    'Mock answers the app could not use:',
    ...findings.map(findingLine),
    ...(fixes.length > 0
      ? [
          '  Add the missing __typename to that object in the mock answer:',
          ...fixes.map((fix) => `     ${fix}`),
        ]
      : []),
  ];
}
