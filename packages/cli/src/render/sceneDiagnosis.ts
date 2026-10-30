/**
 * THE LINES THAT HELP A SCENE GET RIGHT FAST: what the screen said, why a scene likely stopped, and
 * the next step, with a line to paste where there is one.
 *
 * Pure, like everything under ./: the scene's record in, lines out. Each function answers one case
 * a person or agent making scenes meets, and prints nothing when its case does not apply, so the
 * ending of the scene (./capturedScene) stays the first line and these follow as evidence, then the
 * next step. Secondary lines are dim.
 */
import chalk from 'chalk';
import { errorLine } from './capturedStory';
import { moreLines } from './moreLines';
import { ruleOf } from './mockRuleLine';
import type { SceneLeft } from './capturedScene';
import type { AnswerFinding, UnansweredRequest } from '../seams/readAppAnswer';

/** How many words of the app's screen are quoted before the rest is left out. */
const SCREEN_WORDS_SHOWN = 6;

/** What the app said when a partial object was read past what the scene names; the field is the capture. */
const PARTIAL_READ = /^A scene read "(.+)" of a partial object, and the scene does not name it\./;

/* ========================================================================== */
/* Before the scene runs                                                      */
/* ========================================================================== */

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
      appIsMissing(phoneNotApplied)
        ? '   Install the app on the phone (run it once from your IDE), then capture again so the setting is in place.'
        : '   Set it by hand in the phone, then capture again.'
    ),
    '',
  ];
}

function appIsMissing(unapplied: NonNullable<SceneLeft['phoneNotApplied']>): boolean {
  return unapplied.some((one) => one.why === 'app-not-installed');
}

/* ========================================================================== */
/* A scene that never got ready                                               */
/* ========================================================================== */

/** What the app's screen said, or that it drew nothing. */
export function screenLines(screen: SceneLeft['screen']): string[] {
  if (!screen) return [];
  if (screen.views === 0) return ['  The screen drew no views.'];
  const shown = screen.words.slice(0, SCREEN_WORDS_SHOWN).map((word) => `"${word}"`);
  const rest = screen.words.length - shown.length;
  return [
    `  The screen said: ${shown.join(', ')}${rest > 0 ? `, and ${rest} more` : ''}`,
    chalk.dim(`   ${screen.views} views drawn`),
  ];
}

/** Why the capture gave up before its patience ran out, and what to do about the screen it stopped on. */
export function endedEarlyLines(early: SceneLeft['endedEarly']): string[] {
  if (!early) return [];
  const seconds = `${(early.afterMs / 1000).toFixed(1)}s`;
  if (early.stuckOn === 'sign-in') {
    return [
      `  Sherlo stopped after ${seconds}: the app was still on a sign-in screen.`,
      '  Nothing faked who is logged in, so the app sent itself to sign-in. ' +
        "Add a logged-in user to the scene's mocks.",
    ];
  }
  return [
    `  Sherlo stopped after ${seconds}: the app was still on a consent screen that nothing in the scene answers.`,
    `  Tap through it in the scene's play${early.button ? ':' : ', or fake the stored answer.'}`,
    ...(early.button ? [`     play: [{ tap: { label: ${JSON.stringify(early.button)} } }]`] : []),
  ];
}

/** What to check when the app is on its route and drew nothing. */
export function blankScreenLines(sceneId: string, left: SceneLeft): string[] {
  if (left.screen?.views !== 0) return [];
  return [
    '  Check next:',
    '     - a module fake that did not apply leaves the real module running, and a screen built on it can draw nothing',
    '     - an error the app logged while it drew (the lines below, when there are any)',
    '',
    `  See what the app logged:  npx sherlo capture --scene ${sceneId} --logs`,
  ];
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

function shape(name: string): string {
  const article = /^[aeiou]/.test(name) ? 'an' : 'a';
  return `${article} ${name}`;
}

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

/* ========================================================================== */
/* What the scene left behind                                                 */
/* ========================================================================== */

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

/** Requests a rule of the scene let reach the real network: the picture may change between runs. */
export function letThroughLines(letThrough: SceneLeft['letThrough']): string[] {
  if (!letThrough || letThrough.length === 0) return [];
  const count = letThrough.length;
  return [
    '',
    `${chalk.yellow('◦')}  ${count} real ${count === 1 ? 'request was' : 'requests were'} made, so the picture may change between runs:`,
    ...letThrough.map(({ method, url }) => `     ${method} ${url}`),
    '  Fake them instead, one rule each:',
    ...uniqueRules(letThrough).map((rule) => `     ${rule}`),
  ];
}

function uniqueRules(requests: UnansweredRequest[]): string[] {
  return [...new Set(requests.map(ruleOf))];
}

/** One finding about a mock GraphQL answer, as the app listed it. */
export function findingLine({ kind, operation, path, expected }: AnswerFinding): string {
  const where = `${operation ?? 'an operation'}${path ? ` at ${path}` : ''}`;
  const want = expected ? ` (expected ${expected})` : '';
  switch (kind) {
    case 'field-missing':
      return `  ${where}: the mock answer has no such field${want}`;
    case 'typename-missing':
      return `  ${where}: the mock answer has no __typename${want}`;
    case 'typename-matches-no-fragment':
      return `  ${where}: its __typename matches no fragment of the query${want}`;
    case 'no-query-text':
      return `  ${operation ?? 'a request'}: not checked, the request sent no query text`;
  }
}

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

/** The errors the app logged during the scene, in the content's words, without the partial reads, which have their own block. */
export function loggedErrorLines(logged: SceneLeft['loggedErrors']): string[] {
  if (!logged) return [];
  const messages = logged.messages.filter(({ message }) => !PARTIAL_READ.test(message));
  if (messages.length === 0) return [];
  const count = messages.length + logged.moreLeftOut;
  return [
    '',
    `The app logged ${count === 1 ? '1 different error message' : `${count} different error messages`} during this scene:`,
    ...messages.map(({ message, times }) =>
      times > 1 ? `  ${message} (logged ${times} times)` : `  ${message}`
    ),
    ...moreLines(logged.moreLeftOut),
  ];
}

/** Whether anything in the record explains why a scene stopped, so the stock sign-in hint stays out of the way. */
export function explainsTheStop(left: SceneLeft): boolean {
  return Boolean(
    left.threw ||
    left.endedEarly ||
    left.screen ||
    left.mockNotApplied?.length ||
    left.unanswered?.length ||
    left.loggedErrors?.messages.length ||
    left.answerFindings?.length ||
    left.lastRun
  );
}
