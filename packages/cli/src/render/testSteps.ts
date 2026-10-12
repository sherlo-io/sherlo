/**
 * `sherlo test` IN INIT'S GRAMMAR (epic sherlo-test-builds-apps, operator decision 2026-10-12:
 * Direction C). What a test prints reads like what `sherlo init` prints: the logo, one line saying
 * what the command is doing, one past-tense line per step, `(reused)` dimmed the way init dims
 * `(already done)`, a failed step as `✖ <Step> failed` above its error, and the ending in a titled
 * section - the next step, or the verdict when the command waited for it.
 *
 * The shapes are init's own (./initSteps, ./initLines), called rather than copied, so the two
 * commands cannot drift apart. This module holds only what a test adds to them: the intro line,
 * how a step that reused work says so, the platform's emoji, the devices a test runs on, the next
 * step, and the help block a failed run ends with.
 *
 * Pure, like everything under ./: state in, print-call arguments out. The words are drafts for the
 * content department.
 */
import chalk from 'chalk';
import { DEVICES } from '@sherlo/shared';
import type { Platform } from '@sherlo/api-types';
import { CONTACT_EMAIL, DISCORD_URL, PLATFORM_LABEL } from '../constants';
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
 * One finished step: init's step line, with a dimmed `(reused)` when the step took work an earlier
 * run did rather than doing it again - the test's `(already done)`. A step with nothing to add
 * after its name ends at its name.
 */
export function renderTestStep({
  name,
  detail = '',
  reused = false,
}: {
  /** What the step did, past tense: "Built the Android app". */
  name: string;
  detail?: string;
  reused?: boolean;
}): string {
  const shownDetail = reused ? `${detail} ${chalk.dim('(reused)')}`.trimStart() : detail;

  return renderStepLine({ outcome: 'done', name, detail: shownDetail }).trimEnd();
}

/** A long step still running, printed once before it (a spinner in a terminal is build work). */
export function renderStepInProgress(text: string): string {
  return chalk.dim(text);
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
 * The link to a test's review page, on a line of its own that STARTS with `🔗` and ENDS with the
 * address: the GitHub Action reads it off exactly that shape (actions/lib/cliOutputs.mjs).
 */
export function renderReviewLink(url: string): string {
  return `🔗 Review: ${chalk.cyan(url)}`;
}

/**
 * The ending of a test the command did not wait for: what to do next, in init's section, with
 * the command that waits for the verdict here - an agent cannot click the link.
 */
export function renderTestNextStep({ testIndex, url }: { testIndex: number; url: string }): string[] {
  return [
    // The underline is one longer than the title: the emoji is counted as one character and drawn as two.
    ...renderSectionTitle('👉 Next step', 12),
    chalk.bold(`Review Test ${testIndex} when it finishes`),
    `   ${renderReviewLink(url)}`,
    `   To wait for it here: ${chalk.cyan(`npx sherlo view ${testIndex} --wait`)}`,
  ];
}

/**
 * The verdict a waited test ends with, as a section: its title, underlined, then what the reader
 * needs under it. The wait loop frames every verdict with one blank line above and below, so the
 * section brings one blank line of its own above, not init's two.
 *
 * `underlineLength` is init's: for a title whose emoji JavaScript counts as one character and a
 * terminal draws two columns wide (`✅`, where `⚠️` is counted as two).
 */
export function renderVerdictSection(
  title: string,
  body: string[],
  underlineLength?: number
): string[] {
  return [...renderSectionTitle(title, underlineLength).slice(1), ...body];
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
