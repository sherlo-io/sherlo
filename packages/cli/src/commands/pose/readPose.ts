/**
 * THE POSE READER - turns a JSON document into a {@link CommandPose}, or refuses it naming
 * EVERY problem at once.
 *
 * TWO HALVES, AND ONLY ONE OF THEM IS WRITTEN BY HAND.
 *
 * The SHAPE - required fields, unknown keys, wrong types - is ./readPose.generated, written from
 * the seams' own types by `packages/cli/scripts/generate-pose-contract.ts`, which writes
 * `contracts/pose.contract.ts` from the same declaration in the same run. That is why a field
 * added to a seam's answer is added ONCE: the shape a consumer copies and the shape this reader
 * enforces are two printings of `src/seams/commandPose.ts`, and `yarn check:pose-contract` reds a
 * pull request where either was edited by hand.
 *
 * The MEANING is here, and it is everything a type cannot state:
 *
 *     which commands bundle, act on the machine, post to a letterbox or ask for a capture
 *                                     ({@link commandBundles} and the three beside it)
 *     which platform names a map may use ({@link reportForeignPlatforms})
 *     what counts as an instant         ({@link reportNonInstants})
 *     that a command line says something at all
 *
 * ------------------------------------------------------------------------
 * WHY EVERY PROBLEM AT ONCE, AND WHY NOTHING IS GUESSED.
 *
 * A pose is written by hand. A reader that stopped at the first problem would make fixing one
 * a round trip per mistake, and a reader that filled a gap with a default would let somebody
 * review a state they never asked for. So every field is required, an unknown key is refused by
 * name rather than ignored, and the refusal lists everything it found - both halves append to one
 * list of problems, and the refusal is raised once at the end.
 */
import type { CommandPose } from '../../seams/commandPose';
import { readPoseShape } from './readPose.generated';
import {
  PoseRefusal,
  at,
  atIndex,
  atKey,
  describe,
  formatWhere,
  isPlainObject,
} from './poseProblems';

export { PoseRefusal } from './poseProblems';

/** The platforms the tool bundles for, builds for and captures on - the only keys a pose may use. */
const PLATFORMS = ['android', 'ios'];

/**
 * Read a pose from the text of a JSON document. Invalid JSON is itself one problem, named the
 * same way as every other - a caller never has to tell a parse failure from a shape failure.
 */
export function readPoseDocument(text: string): CommandPose {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new PoseRefusal([`the document is not valid JSON: ${(error as Error).message}`]);
  }

  return readPose(document);
}

/** Read a pose from an already-parsed document. Throws {@link PoseRefusal} naming every problem. */
export function readPose(document: unknown): CommandPose {
  const problems: string[] = [];

  readPoseShape(document, problems);
  if (isPlainObject(document)) readPoseMeaning(document, problems);

  if (problems.length > 0) throw new PoseRefusal(problems);

  return document as unknown as CommandPose;
}

/** Everything about a pose that is true or false regardless of whether its shape is right. */
function readPoseMeaning(pose: Record<string, unknown>, problems: string[]): void {
  const argv = Array.isArray(pose.argv) ? (pose.argv.filter(isWord) as string[]) : [];

  if (Array.isArray(pose.argv) && pose.argv.length === 0) {
    problems.push('`argv`: empty - a pose has to say which command it poses, e.g. `["view", "7"]`');
  }

  reportRoadsThisCommandDoesNotTake(pose, argv, problems);
  reportForeignPlatforms(pose, problems);
  reportNonInstants(pose, problems);
}

function isWord(value: unknown): boolean {
  return typeof value === 'string';
}

/* -------------------------------------------------------------------------- *
 * The roads a command has, decided from the FIRST WORD of the command line     *
 * and nothing else. The tool's own routing decides which checks fire - these    *
 * say only which steps the command HAS at all, so a pose that describes a step  *
 * the command never takes is describing a different scenario from the one it    *
 * claims to.                                                                    *
 * -------------------------------------------------------------------------- */

/** `sherlo test` bundles on both its roads; a refusal, a `view`, a `project create` never does. */
function commandBundles(argv: string[]): boolean {
  return argv[0] === 'test';
}

/** `sherlo init` is the only command that installs a package and stops for a key. */
function commandActsOnTheMachine(argv: string[]): boolean {
  return argv[0] === 'init';
}

/** `sherlo open` is the only command that posts to the bundler's letterbox. */
function commandReachesTheLetterbox(argv: string[]): boolean {
  return argv[0] === 'open';
}

/** `sherlo capture` is the only command that asks the running app for a capture. */
function commandAsksForACapture(argv: string[]): boolean {
  return argv[0] === 'capture';
}

function reportRoadsThisCommandDoesNotTake(
  pose: Record<string, unknown>,
  argv: string[],
  problems: string[]
): void {
  const command = argv[0] ?? '';
  const bundles = isPlainObject(pose.bundles) ? Object.keys(pose.bundles) : [];

  if (bundles.length > 0 && !commandBundles(argv)) {
    problems.push(
      `\`bundles\`: \`${command}\` never reaches a bundler, so there is no bundling step for ` +
        `${bundles.map((platform) => `\`${platform}\``).join(', ')} to answer. Use \`{}\`.`
    );
  }

  if ('push' in pose && !commandBundles(argv)) {
    problems.push(
      `\`push\`: \`${command}\` never reads a native build, so there is no push for it to ` +
        'describe. Leave the field out.'
    );
  }

  if ('workstation' in pose && !commandActsOnTheMachine(argv)) {
    problems.push(
      `\`workstation\`: \`${command}\` never installs a package or waits for a key, so ` +
        'there is no workstation for it to describe. Leave the field out.'
    );
  }

  if ('letterbox' in pose && !commandReachesTheLetterbox(argv)) {
    problems.push(
      `\`letterbox\`: \`${command}\` never posts to the bundler, so there is no letterbox ` +
        'for it to describe. Leave the field out.'
    );
  }

  if ('capture' in pose && !commandAsksForACapture(argv)) {
    problems.push(
      `\`capture\`: \`${command}\` never asks the app for a capture, so there is nothing ` +
        'for it to describe. Leave the field out.'
    );
  }
}

/* -------------------------------------------------------------------------- *
 * Platform names. Three maps in a pose are keyed by platform, and the type of   *
 * each says only that its keys are strings - a map cannot say which words are   *
 * words. A pose keyed `windows` would otherwise pass the shape and then answer   *
 * nothing the command ever asked for.                                           *
 * -------------------------------------------------------------------------- */

function reportForeignPlatforms(pose: Record<string, unknown>, problems: string[]): void {
  reportForeignKeys(pose.bundles, 'bundles', problems);

  if (isPlainObject(pose.push)) reportForeignKeys(pose.push.binaries, 'push.binaries', problems);

  for (const decision of captureDecisionsIn(pose)) {
    reportForeignKeys(decision.platforms, `${decision.path}.platforms`, problems);
  }
}

function reportForeignKeys(map: unknown, path: string, problems: string[]): void {
  if (!isPlainObject(map)) return;

  const known = PLATFORMS.map((platform) => `\`${platform}\``).join(' and ');

  for (const key of Object.keys(map)) {
    if (PLATFORMS.includes(key)) continue;
    problems.push(
      `${formatWhere(atKey(path, key))}: \`${key}\` is not a platform - the tool knows ${known}`
    );
  }
}

/** Every capture decision a pose scripts, with where in the `api` list it was scripted. */
function captureDecisionsIn(
  pose: Record<string, unknown>
): Array<{ path: string; platforms: unknown }> {
  if (!Array.isArray(pose.api)) return [];

  return pose.api.flatMap((entry, index) => {
    if (!isPlainObject(entry) || entry.call !== 'openBuild') return [];
    if (!isPlainObject(entry.answer) || !isPlainObject(entry.answer.captureDecision)) return [];

    return [
      {
        path: at(`api[${index}]`, 'answer.captureDecision'),
        platforms: entry.answer.captureDecision.platforms,
      },
    ];
  });
}

/* -------------------------------------------------------------------------- *
 * Instants. `now` and every entry of `clock` are typed as strings, and a        *
 * string is not a time - a pose saying "yesterday afternoon" would set a clock   *
 * the wait could never read.                                                     *
 * -------------------------------------------------------------------------- */

function reportNonInstants(pose: Record<string, unknown>, problems: string[]): void {
  if (isPlainObject(pose.push) && typeof pose.push.now === 'string' && !isInstant(pose.push.now)) {
    problems.push(
      `${formatWhere(at('push', 'now'))}: expected an ISO 8601 instant, ` +
        `got ${describe(pose.push.now)}`
    );
  }

  if (!Array.isArray(pose.clock)) return;

  pose.clock.forEach((instant, index) => {
    if (typeof instant === 'string' && !isInstant(instant)) {
      problems.push(
        `${formatWhere(atIndex('clock', index))}: expected an ISO 8601 instant, ` +
          `got ${describe(instant)}`
      );
    }
  });
}

function isInstant(text: string): boolean {
  return !Number.isNaN(Date.parse(text));
}
