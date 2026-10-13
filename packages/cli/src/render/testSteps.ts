/**
 * `sherlo test` IN INIT'S GRAMMAR (epic sherlo-test-builds-apps, operator decisions 2026-10-12).
 * What a test prints reads like what `sherlo init` prints: the logo (in a terminal), one line saying
 * what the command is doing, one past-tense line per finished step, a long step shown while it runs
 * (./stepInProgress), a failed step as `✖ <Step> failed` above its error, and ONE section at the
 * end - the next step, or the verdict when the command waited for it - with the review link last.
 *
 * The shapes are init's own (./initSteps, ./initLines), called rather than copied, so the two
 * commands cannot drift apart. This module holds only what a test adds to them: the intro line, the
 * platform's emoji, the started test's line, the next step, and the help block a failed run ends
 * with.
 *
 * Pure, like everything under ./: state in, print-call arguments out. The words are drafts for the
 * content department.
 */
import chalk from 'chalk';
import { DEVICES } from '@sherlo/shared';
import type { Platform } from '@sherlo/api-types';
import { APP_DOMAIN, CONTACT_EMAIL, DISCORD_URL, PLATFORM_LABEL } from '../constants';
import type { Config } from '../types';
import { renderSectionTitle } from './initLines';
import { renderFailedStepLine, renderStepLine, renderStuckBlock } from './initSteps';

/** The command a run's opening line names. */
export type IntroducedCommand = 'test' | 'build' | 'eas-build-on-complete';

const INTRO_LINE: Record<IntroducedCommand, string> = {
  test: 'Testing your app...',
  build: 'Building your app...',
  'eas-build-on-complete': 'Sending your EAS build to Sherlo...',
};

/** The line under the logo that says what the command is doing, then a blank line. */
export function renderCommandIntro(command: IntroducedCommand): string[] {
  return [INTRO_LINE[command], ''];
}

/** `🤖 Android` / `🍎 iOS` - the one way a test names a platform beside a value. */
export function platformWithEmoji(platform: Platform): string {
  return `${PLATFORM_EMOJI[platform]} ${PLATFORM_LABEL[platform]}`;
}

const PLATFORM_EMOJI: Record<Platform, string> = { android: '🤖', ios: '🍎' };

/**
 * One finished step: init's step line. A step with nothing to add after its name ends at its
 * name. `alreadyDone` is init's own `(already done)`, for a step this run found already done.
 */
export function renderTestStep({
  name,
  detail = '',
  alreadyDone = false,
}: {
  /** What the step did, past tense: "Built the Android app". */
  name: string;
  detail?: string;
  alreadyDone?: boolean;
}): string {
  return renderStepLine({ outcome: alreadyDone ? 'already' : 'done', name, detail }).trimEnd();
}

/** `✖ Building the Android app failed`, then the blank line init puts above the error. */
export function renderFailedTestStep(doing: string): string[] {
  return renderFailedStepLine(`${doing} failed`);
}

/**
 * `on 2 devices (Pixel 7, iPhone 15)` - the devices a test runs on, by the names the web app
 * shows. A device this CLI does not know is left out of the names, never the count.
 */
export function describeDevices(devices: Config['devices']): string {
  const count = devices.length === 1 ? '1 device' : `${devices.length} devices`;
  const names = devices
    .map(({ id }) => DEVICES[id as keyof typeof DEVICES]?.displayName)
    .filter((name): name is string => Boolean(name));

  return names.length > 0 ? `on ${count} (${names.join(', ')})` : `on ${count}`;
}

/**
 * What one platform's test captures, as openBuild recorded it: every story (`full`), or the
 * stories a change reaches. The count is of story files, out of the bundle's own story files when
 * the bundle's module map could count them.
 */
export type PlatformCapture = {
  platform: Platform;
  /** Every story is captured. Read FIRST: a full capture's story list is empty and means "all". */
  full: boolean;
  /** How many stories a partial capture takes. Ignored on a full capture. */
  capturedStories: number;
  /** How many stories the bundle holds; absent when no module map could count them. */
  storiesInBundle?: number;
  /** The server's own reason, printed only on a full capture (operator ruling 2026-10-12, Q2). */
  reason?: string;
};

/**
 * `✔ Started Test 14        3 of 24 stories on 2 devices (Pixel 7, iPhone 15)` - the one line that
 * says what the test runs.
 *
 * ONE COUNT when every platform captures the same, which is nearly always; one per platform when
 * they differ. A full capture's reason is kept, after a comma, only when every platform captures
 * every story for that one reason - it is the reason a person can act on (`no main branch is set`).
 * A partial capture's reason and its story files are `npx sherlo view <n> --json`'s to say.
 *
 * The same line starts a test whichever job or EAS build brought its last app build in. A print
 * site that knows neither the devices nor the capture (the second job of a split run, the last EAS
 * build in) prints the bare `✔ Started Test 1` (build item 66 gives it the devices).
 */
export function renderTestStarted({
  buildIndex,
  devices,
  capture = [],
}: {
  buildIndex: number;
  devices?: Config['devices'];
  capture?: PlatformCapture[];
}): string {
  const storiesOfEachPlatform = describeStoriesOfEachPlatform(capture);
  const stories = storiesOfEachPlatform.join(', ');
  const onDevices = devices ? describeDevices(devices) : '';
  // `3 of 24 stories on 1 device`, but `🤖 Android 3 of 24 stories, 🍎 iOS all 24 stories, on 2 devices`.
  const beforeDevices = storiesOfEachPlatform.length > 1 ? ', ' : ' ';
  const whatRuns = [stories, onDevices].filter((part) => part !== '').join(beforeDevices);
  const reason = reasonEveryStoryIsCaptured(capture);

  return renderTestStep({
    name: `Started Test ${buildIndex}`,
    detail: reason ? `${whatRuns}, ${reason}` : whatRuns,
  });
}

/**
 * `['3 of 24 stories']` when every platform captures the same; `['🤖 Android 3 of 24 stories',
 * '🍎 iOS all 24 stories']` when they differ; none when the server recorded no decision.
 */
function describeStoriesOfEachPlatform(capture: PlatformCapture[]): string[] {
  if (capture.length === 0) return [];

  const perPlatform = capture.map((platformCapture) => ({
    platform: platformCapture.platform,
    stories: describeCapturedStories(platformCapture),
  }));
  const everyPlatformTheSame = perPlatform.every(({ stories }) => stories === perPlatform[0].stories);
  if (everyPlatformTheSame) return [perPlatform[0].stories];

  return perPlatform.map(({ platform, stories }) => `${platformWithEmoji(platform)} ${stories}`);
}

/** The server's reason, when every platform captures every story for that one reason. */
function reasonEveryStoryIsCaptured(capture: PlatformCapture[]): string | undefined {
  if (capture.length === 0 || !capture.every(({ full }) => full)) return undefined;

  const reasons = new Set(capture.map(({ reason }) => reason));
  return reasons.size === 1 ? capture[0].reason : undefined;
}

/** `3 of 24 stories`, `all 24 stories`, `3 stories` when the bundle could not be counted. */
function describeCapturedStories({ full, capturedStories, storiesInBundle }: PlatformCapture): string {
  if (full) {
    if (storiesInBundle === undefined) return 'all stories';
    return storiesInBundle === 1 ? '1 story' : `all ${countStories(storiesInBundle)}`;
  }

  return storiesInBundle !== undefined
    ? `${capturedStories} of ${countStories(storiesInBundle)}`
    : countStories(capturedStories);
}

/**
 * The link to a test's review page, on a line of its own that STARTS with `🔗` and ENDS with the
 * address: the GitHub Action reads it off exactly that shape (actions/lib/cliOutputs.mjs).
 */
export function renderReviewLink(url: string): string {
  return `🔗 Review: ${chalk.cyan(url)}`;
}

/** A project by the two numbers its web app page is addressed by. */
export type SherloProject = { teamId: string; projectIndex: number };

/** The project's page in the web app, where its CI token is made. */
export function projectPageUrl(project: SherloProject): string {
  return `${APP_DOMAIN}/project?t=${project.teamId}&p=${project.projectIndex}`;
}

/**
 * The ending of a test the command did not wait for, or stopped waiting for: what to do next, in
 * init's section, with the command that waits for the verdict - an agent cannot click the link.
 * The command is the same wherever it runs, so the line says nothing about "here".
 *
 * A SECOND STEP while the project has no CI token, on a person's terminal only (operator,
 * 2026-10-12, with epic init-for-agents): setup no longer asks for CI, so the first place a person
 * hears about pull request tests is here, linking the project's page where the token is made.
 * Two steps are numbered, under a plural title, as init numbers its own.
 */
export function renderTestNextStep({
  testIndex,
  url,
  projectWithNoCiToken,
}: {
  testIndex: number;
  url: string;
  /** Set only when this run should suggest pull request tests: a person's run, no CI token. */
  projectWithNoCiToken?: SherloProject;
}): string[] {
  const reviewLines = [
    `   ${renderReviewLink(url)}`,
    `   To wait for the result: ${chalk.cyan(`npx sherlo view ${testIndex} --wait`)}`,
  ];
  const reviewTitle = `Review Test ${testIndex} when it finishes`;

  if (!projectWithNoCiToken) {
    return [
      // The underline is one longer than the title: the emoji is counted as one character and drawn as two.
      ...renderSectionTitle('👉 Next step', 12),
      chalk.bold(reviewTitle),
      ...reviewLines,
    ];
  }

  return [
    ...renderSectionTitle('👉 Next steps', 13),
    chalk.bold(`1. ${reviewTitle}`),
    ...reviewLines,
    '',
    chalk.bold('2. Run Sherlo on every pull request'),
    `   ${chalk.cyan(projectPageUrl(projectWithNoCiToken))}`,
  ];
}

/**
 * The verdict a waited test ends with, as a section: its title, underlined, then what the reader
 * needs under it. The wait loop frames every verdict with one blank line above and below, so the
 * section brings one blank line of its own above, not init's two - and a section with nothing
 * under its title ends at its underline, so the link under it sits one blank line below.
 *
 * `underlineLength` is init's: for a title whose emoji JavaScript counts as one character and a
 * terminal draws two columns wide (`✅`, where `⚠️` is counted as two).
 */
export function renderVerdictSection(
  title: string,
  body: string[],
  underlineLength?: number
): string[] {
  const [, ...titleLines] = renderSectionTitle(title, underlineLength);
  return body.length > 0 ? [...titleLines, ...body] : titleLines.slice(0, -1);
}

/**
 * The block a failed run ends with: init's help block, as a person reads it. The two lines init
 * adds for an agent - that `npx sherlo init` picks up where it stopped, and the feedback command -
 * are init's own (the feedback command invites from no other command, operator 2026-10-09), so
 * every other command shows every reader the person's block.
 */
export function renderHelpBlock(): string[] {
  return [
    ...renderStuckBlock({
      reader: 'person',
      isLoggedIn: false,
      discordUrl: DISCORD_URL,
      contactEmail: CONTACT_EMAIL,
    }),
  ];
}

/** `1 story`, `3 stories` - every count of stories a test prints. */
export function countStories(count: number): string {
  return count === 1 ? '1 story' : `${count} stories`;
}
