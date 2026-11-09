/**
 * WHAT A SCENE LEFT BEHIND, as the lines under its ending: the requests no mock answered, the
 * modules that ran real, the fakes the app could not use and the errors it logged.
 *
 * Pure, like everything under ./: the scene's record in, lines out. Every ending of a scene
 * (./capturedScene) that carries this news prints it by the same function, so no ending words it
 * its own way.
 */
import chalk from 'chalk';
import { stillRealLines, unansweredLines } from './capturedStory';
import { ruleOf } from './mockRuleLine';
import { refusalLines } from './refusalLines';
import { answerFindingLines } from './answerFindingLines';
import { findingLine } from './findingLine';
import { letThroughLines } from './letThroughLines';
import { loggedErrorLines } from './loggedErrorLines';
import { mockNotAppliedLines } from './mockNotAppliedLines';
import { partialFieldLines } from './partialFieldLines';
import type { SceneLeft } from './capturedScene';
import type { UnansweredRequest } from '../seams/readAppAnswer';

/** The requests no mock answered, and the modules that ran real beside an error or an unanswered request; nothing when there are none. */
export function leftLines(
  left: SceneLeft & { discover?: true; pasteRules?: true; changing?: string[] }
): string[] {
  const { stillReal, unanswered, loggedErrors } = left;
  const hasCause = Boolean(left.threw) || (unanswered ?? []).length > 0;
  const modulesNamed = (left.mockNotApplied ?? []).length > 0;
  return [
    ...(left.discover || !hasCause || modulesNamed ? [] : stillRealLines(stillReal)),
    ...(left.discover
      ? discoverLines(left)
      : left.pasteRules
        ? [...pasteableRuleLines(unanswered), ...movingPartHint(left.changing)]
        : (refusalLines(unanswered) ?? unansweredLines(unanswered))),
    ...mockNotAppliedLines(left.mockNotApplied),
    ...letThroughLines(left.letThrough),
    ...(left.discover ? [] : answerFindingLines(left.answerFindings)),
    ...partialFieldLines(loggedErrors),
    ...loggedErrorLines(loggedErrors),
  ];
}

/**
 * Each request no mock answered as the rule that would answer it, once and in the order the app
 * asked, never as a count: the lines under a scene that never settled, whose answers may be what
 * keeps its screen changing. Nothing when no request went without a mock.
 */
export function pasteableRuleLines(unanswered: SceneLeft['unanswered']): string[] {
  const rules = ruleMap(unanswered);
  if (rules.size === 0) return [];
  return [
    '',
    `${chalk.yellow('◦')}  These requests had no mock. Paste the rules into the scene file and fill in each body:`,
    ...[...rules].map(([rule, request]) => `     ${rule}${requestNote(request)}`),
  ];
}

/** What kept the screen moving, and the way to still it; nothing when the app named no part. */
export function movingPartHint(changing: string[] | undefined): string[] {
  if (!changing || changing.length === 0) return [];
  return [
    '',
    `  ${changing.join(', ')} kept moving. A playing video or animation never lets a screen rest.`,
    '  Fake the module that draws it in the mocks of the scene, and a still frame stands in.',
  ];
}

/**
 * A discover capture's result: each request no mock answered as the rule that would answer it, once
 * and in the order the app asked, then the early ready view and the findings about mock answers.
 */
function discoverLines({ unanswered, readyTooEarly, answerFindings }: SceneLeft): string[] {
  const rules = ruleMap(unanswered);
  return [
    ...(rules.size === 0
      ? ['', 'No request went without a mock.']
      : [
          '',
          `${chalk.yellow('◦')}  ${rules.size} ${rules.size === 1 ? 'request' : 'requests'} had no mock. Paste ${rules.size === 1 ? 'this rule' : 'these rules'} into the scene file:`,
          ...[...rules].map(([rule, request]) => `     ${rule}${requestNote(request)}`),
          '',
          '  Paste the rules, fill in each body, then capture again without --discover.',
        ]),
    ...(readyTooEarly
      ? [
          '',
          `  The ready view showed after step ${readyTooEarly.atStep} of ${readyTooEarly.of}, before the last step of the play ran.`,
        ]
      : []),
    ...(answerFindings && answerFindings.length > 0
      ? ['', 'Mock answers the app could not use:', ...answerFindings.map(findingLine)]
      : []),
  ];
}

/** Each rule that would answer a request, once, with the first request that needs it. */
function ruleMap(unanswered: SceneLeft['unanswered']): Map<string, UnansweredRequest> {
  const rules = new Map<string, UnansweredRequest>();
  for (const request of unanswered ?? []) {
    const rule = ruleOf(request);
    if (!rules.has(rule)) rules.set(rule, request);
  }
  return rules;
}

/** What the app knows of a request's body, after the rule: its content type and masked excerpt, on one line. */
function requestNote({ contentType, bodyExcerpt }: UnansweredRequest): string {
  const parts = [
    ...(contentType ? [contentType] : []),
    ...(bodyExcerpt ? [`body ${bodyExcerpt.replace(/\s+/g, ' ')}`] : []),
  ];
  return parts.length > 0 ? chalk.dim(`  // ${parts.join(', ')}`) : '';
}
