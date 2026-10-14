/**
 * THE RENDER LAYER: state in, bytes out. Pure - no `console.`, no `process.`, no
 * `await`, no `@sherlo/sdk-client`.
 *
 * This module holds EVERY literal, emoji, chalk call and blank line the CLI
 * prints. Nothing upstream of it spells a sentence, and
 * nothing downstream of it edits one: the logic decides WHICH segments happen
 * and in WHAT ORDER, this decides what each one LOOKS like, and a sink decides
 * where the result lands.
 *
 * WHY A LIST OF PRINT CALLS, NOT A STRING. `console.log()` with no arguments and
 * `console.log('')` both emit one newline, but `console.warn('x', err)` formats
 * two arguments the way node formats them, and the intro is three separate calls
 * whose middle one is styled. Modelling a segment as the exact ARGUMENT LISTS the
 * CLI passes keeps the real path byte-for-byte what it was before the layer
 * existed, and lets a buffering sink reproduce those bytes with node's own
 * formatter rather than a re-implementation of it.
 *
 * COLOUR IS ALWAYS ON HERE. Whether a committed fixture carries ANSI is decided
 * by the tester's masker (`maskTestBundledCli` strips it; `maskPushOutput` keeps
 * it), never by this module and never by the environment - so there is ONE
 * regime: render with colour, and let the shipped masker strip where its family
 * requires it.
 */
import path from 'path';
import chalk from 'chalk';
import gradientString from 'gradient-string';
import { COLOR } from '../constants';
import {
  renderBuildViewHeader,
  renderBuildViewStatus,
  renderBuildViewTally,
  renderStoriesTable,
  renderViewJson,
} from './buildView';
import {
  renderAppBuildCached,
  renderAppBuildDone,
  renderAppBuildFailed,
  renderAppBuildNextStep,
  renderEasHostedVariables,
} from './appBuild';
import { renderOutputKeys, renderTestNotice } from './pushSpine';
import { renderStepInProgress } from './stepInProgress';
import {
  renderFinishedUnderTheTestRow,
  renderPlatformRow,
  renderTestFinishedWithNothingToTest,
  renderTestStarted,
  renderTestStoppedOnFailedBuild,
  renderTestWaiting,
} from './runRows';
import {
  platformWithEmoji,
  renderCommandIntro,
  renderFailedTestStep,
  renderHelpBlock,
  renderReviewLink,
  renderTestNextStep,
  renderTestStep,
} from './testSteps';
import { renderProjectCreated } from './projectCreated';
import { renderTeamCreated } from './teamCreated';
import { renderProjectList } from './projectList';
import { renderOpenedStory } from './openedStory';
import { renderCapturedStory } from './capturedStory';
import { renderCapturedLog } from './capturedLog';
import { renderTeamList } from './teamList';
import {
  renderAlreadyLoggedIn,
  renderLoggedIn,
  renderLoggedOut,
  renderLoginLink,
  renderLoginWaiting,
  renderNotLoggedIn,
} from './login';
import type { TranscriptSegment, TranscriptStream } from './segments';
import {
  renderVerdictCaptureAccounting,
  renderVerdictNoChanges,
  renderVerdictNothingRecorded,
  renderVerdictPassed,
  renderVerdictReviewRequired,
  renderVerdictRunErrored,
  renderTestFinished,
  renderWaitAuthFailed,
  renderWaitBuildNotFound,
  renderWaitHeartbeat,
  renderWaitInterrupted,
  renderWaitNetworkRetry,
  renderWaitProgress,
  renderWaitTimedOut,
} from './verdictCloser';

/** The sherlo wordmark, rendered per character by `gradient-string`. */
const INTRO_HEADER = `
             888                       888          
             888                       888          
             888                       888          
    .d8888b  888 8b.   .d88b.  .d88888 888  .d88b.  
    88K      888 "88b d8P  Y8b 888"    888 d88""88b 
    "Y8888b. 888  888 88888888 888     888 888  888 
         X88 888  888 Y8b.     888     888 Y88..88P 
    '88888P' 888  888  "Y8888  888     888  "Y88P"
`;

const INTRO_TAGLINE = 'Make sure your mobile app looks perfect on every device';

/** The stderr warn `getGitInfo` prints when the git read fails and it degrades. */
const GIT_INFO_UNAVAILABLE = "Couldn't get git info";

/**
 * One segment, rendered.
 *
 * `prints` holds one entry per print call, each entry being that call's
 * arguments verbatim - so `[[]]` is a bare `console.log()` and `[['a', err]]` is
 * a two-argument call node formats itself.
 */
export type RenderedSegment = {
  stream: TranscriptStream;
  prints: unknown[][];
};

/** Turn one segment into the exact print calls the CLI makes for it. */
export function renderSegment(segment: TranscriptSegment): RenderedSegment {
  switch (segment.kind) {
    case 'intro':
      return {
        stream: 'stdout',
        prints: [
          [gradientString(COLOR.reported, COLOR.approved, COLOR.noChanges)(INTRO_HEADER)],
          [chalk.dim(chalk.italic(INTRO_TAGLINE))],
          [],
        ],
      };

    case 'command-intro':
      return {
        stream: 'stdout',
        prints: renderCommandIntro(segment.command).map((line) => [line]),
      };

    // A STEP IN PROGRESS, as a log shows it: one plain line, printed once when the step starts. In a
    // terminal the same words are a spinner's (../commands/shared/terminal), and this segment is
    // never emitted there.
    case 'platform-bundle-start':
    case 'app-build-generating':
    case 'app-build-compiling':
    case 'binary-uploading':
    case 'eas-builds-starting':
    case 'wait-header':
      return { stream: 'stdout', prints: [[renderStepInProgress(segment)]] };

    // The bundle and its assets print nothing: bundling and uploading are one wait, and the step a
    // person reads is the test it starts; a bundle's format and asset count are not theirs to read.
    case 'platform-bundle-built':
    case 'platform-bundle-assets':
      return { stream: 'stdout', prints: [] };

    case 'platform-bundle-supplied':
      return {
        stream: 'stdout',
        prints: [
          [
            renderTestStep({
              name: 'Used your JavaScript',
              detail: `${platformWithEmoji(segment.platform)} ${path.basename(
                segment.bundlePath
              )}, from --bundle-dir`,
            }),
          ],
        ],
      };

    case 'platform-bundle-supplied-note':
      return {
        stream: 'stdout',
        prints: [[chalk.yellow(`! ${segment.note}`)]],
      };

    case 'bundle-emit-header':
      // Each platform's own step says where its JavaScript went (`platform-bundle-emitted`).
      return { stream: 'stdout', prints: [] };

    case 'platform-bundle-emitted':
      return {
        stream: 'stdout',
        prints: [
          [
            renderTestStep({
              name: 'Saved the JavaScript',
              detail: `${platformWithEmoji(segment.platform)}, to ${segment.bundleDir}`,
            }),
          ],
        ],
      };

    case 'platform-bundle-failed':
      // The run exits right after this line (../commands/test/bundleAndPreview), so it ends on help.
      return {
        stream: 'stdout',
        prints: [
          ...renderFailedTestStep('Bundling the JavaScript'),
          chalk.red(segment.message),
          '',
          ...renderHelpBlock(),
        ].map((line) => [line]),
      };

    case 'git-info-unavailable':
      return {
        stream: 'stderr',
        prints: [[GIT_INFO_UNAVAILABLE, segment.error]],
      };

    /* ---------------------- the push spine (F1) ---------------------- */

    case 'binary-upload-retry':
      return {
        stream: 'stdout',
        prints: [
          [
            chalk.dim(
              `   Upload failed (attempt ${segment.attempt} of ${segment.maxRetries}), trying again...`
            ),
          ],
        ],
      };

    case 'platform-row':
      return { stream: 'stdout', prints: renderPlatformRow(segment.row).map((line) => [line]) };

    case 'test-started':
      return { stream: 'stdout', prints: renderTestStarted(segment).map((line) => [line]) };

    case 'notice':
      return {
        stream: 'stdout',
        prints: renderTestNotice(segment).map((line) => [line]),
      };

    case 'results-url':
      // THE ADDRESS IS PRINTED ONCE, ON THE LINE WITH THE EMOJI. The closer printed it twice under
      // CI - a `url=` line for a machine above the link for a person - and no screen ever carries
      // the second copy, whoever is reading. The GitHub Action reads the address off this line (actions/lib/cliOutputs.mjs).
      return {
        stream: 'stdout',
        prints: (segment.testIndex !== undefined
          ? renderTestNextStep({
              testIndex: segment.testIndex,
              url: segment.url,
              projectWithNoCiToken: segment.projectWithNoCiToken,
            })
          : [renderReviewLink(segment.url), '']
        ).map((line) => [line]),
      };

    case 'app-build-cached':
      return { stream: 'stdout', prints: [[renderAppBuildCached(segment.platform)]] };

    case 'app-build-done':
      return { stream: 'stdout', prints: [[renderAppBuildDone(segment)]] };

    case 'app-build-failed':
      return { stream: 'stdout', prints: renderAppBuildFailed(segment).map((line) => [line]) };

    case 'test-stopped-on-failed-build':
      return {
        stream: 'stdout',
        prints: renderTestStoppedOnFailedBuild(segment).map((line) => [line]),
      };

    case 'app-build-next-step':
      return { stream: 'stdout', prints: renderAppBuildNextStep().map((line) => [line]) };

    case 'eas-hosted-variables':
      return {
        stream: 'stdout',
        prints: renderEasHostedVariables(segment.profile, segment.environment).map((line) => [
          line,
        ]),
      };

    case 'run-waits-for-builds':
      return { stream: 'stdout', prints: renderTestWaiting(segment).map((line) => [line]) };

    case 'output-keys':
      return {
        stream: 'stdout',
        prints: renderOutputKeys(segment.entries).map((line) => [line]),
      };

    /* -------------------- the verdict family (F4) -------------------- */

    case 'blank-line':
      // One ARGUMENT-LESS console.log(). `console.log('')` is a different call
      // and util.format renders it differently, so the empty argument list is
      // the content here.
      return { stream: 'stdout', prints: [[]] };

    case 'test-finished':
      // `sherlo test --wait` printed the test's row, and the step stands under it.
      return {
        stream: 'stdout',
        prints: [
          [
            segment.seconds !== undefined
              ? renderFinishedUnderTheTestRow(segment.seconds)
              : renderTestFinished(segment.testIndex),
          ],
        ],
      };

    case 'wait-progress':
      return { stream: 'stdout', prints: [[renderWaitProgress(segment.runStatus)]] };

    case 'wait-heartbeat':
      return {
        stream: 'stdout',
        prints: [[renderWaitHeartbeat(segment.statusLabel, segment.elapsedMinutes)]],
      };

    case 'wait-network-retry':
      return { stream: 'stdout', prints: [[renderWaitNetworkRetry(segment.message)]] };

    case 'wait-build-not-found':
      return { stream: 'stdout', prints: [[renderWaitBuildNotFound()]] };

    case 'wait-auth-failed':
      return { stream: 'stdout', prints: [[renderWaitAuthFailed(segment.message)]] };

    case 'wait-timed-out':
      return {
        stream: 'stdout',
        prints: renderWaitTimedOut(segment.timeoutMinutes, segment.testIndex).map((line) => [line]),
      };

    case 'wait-interrupted':
      return { stream: 'stdout', prints: [[renderWaitInterrupted(segment.testIndex)]] };

    case 'verdict-passed':
      return { stream: 'stdout', prints: renderVerdictPassed().map((line) => [line]) };

    case 'verdict-server-bypassed':
      return {
        stream: 'stdout',
        prints: renderTestFinishedWithNothingToTest(segment).map((line) => [line]),
      };

    case 'verdict-review-required':
      return {
        stream: 'stdout',
        prints: renderVerdictReviewRequired(segment.screens, segment.counts).map((line) => [line]),
      };

    case 'verdict-run-errored':
      return {
        stream: 'stdout',
        prints: renderVerdictRunErrored(segment.runStatus, segment.runError, segment.testIndex).map(
          (line) => [line]
        ),
      };

    /* GATED on showsOnlyBranchChanges - see ./verdictCloser and helpers/sparseBuildVerdict. */

    case 'verdict-no-changes':
      return { stream: 'stdout', prints: renderVerdictNoChanges().map((line) => [line]) };

    case 'verdict-capture-accounting':
      return {
        stream: 'stdout',
        prints: [[renderVerdictCaptureAccounting(segment.captured, segment.inherited)]],
      };

    case 'verdict-nothing-recorded':
      return {
        stream: 'stdout',
        prints: renderVerdictNothingRecorded(segment.testIndex).map((line) => [line]),
      };

    /* ---------------------- the build view (F5) ---------------------- */

    case 'build-view-header':
      return {
        stream: 'stdout',
        prints: [[renderBuildViewHeader(segment.buildIndex, segment.runStatus)]],
      };

    case 'build-view-tally':
      return { stream: 'stdout', prints: [[renderBuildViewTally(segment.counts)]] };

    case 'build-view-status':
      // Zero print calls when the wire gave the CLI no sentence to print - an
      // empty list is how this layer says nothing, and it is not the same as a
      // blank line.
      return {
        stream: 'stdout',
        prints: renderBuildViewStatus(segment).map((line) => [line]),
      };

    case 'build-view-json':
      return { stream: 'stdout', prints: [[renderViewJson(segment.json)]] };

    case 'build-view-stories-table':
      return {
        stream: 'stdout',
        prints: renderStoriesTable(segment.stories).map((line) => [line]),
      };

    /* --------------------- project management ------------------------ */

    case 'project-created':
      return {
        stream: 'stdout',
        prints: renderProjectCreated(segment.project).map((line) => [line]),
      };

    case 'team-created':
      return {
        stream: 'stdout',
        prints: renderTeamCreated(segment.team).map((line) => [line]),
      };

    case 'project-list':
      // The read-side sibling of project-created: one row per project, index first.
      return {
        stream: 'stdout',
        prints: renderProjectList(segment.list).map((line) => [line]),
      };

    case 'opened-story':
      return {
        stream: 'stdout',
        prints: renderOpenedStory(segment.state).map((line) => [line]),
      };

    case 'captured-story':
      return {
        stream: 'stdout',
        prints: renderCapturedStory(segment.state).map((line) => [line]),
      };

    case 'captured-log':
      return {
        stream: 'stdout',
        prints: renderCapturedLog(segment.logs).map((line) => [line]),
      };

    case 'team-list':
      return {
        stream: 'stdout',
        prints: renderTeamList(segment.list).map((line) => [line]),
      };

    /* --------------------------- logging in -------------------------- */

    case 'login-link':
      return {
        stream: 'stdout',
        prints: renderLoginLink(segment.authorizeUrl).map((line) => [line]),
      };

    case 'login-waiting':
      return {
        stream: 'stdout',
        prints: renderLoginWaiting().map((line) => [line]),
      };

    case 'logged-in':
      return {
        stream: 'stdout',
        prints: renderLoggedIn(segment.email, segment.insideSetup).map((line) => [line]),
      };

    case 'already-logged-in':
      return {
        stream: 'stdout',
        prints: renderAlreadyLoggedIn(segment.email).map((line) => [line]),
      };

    case 'logged-out':
      return { stream: 'stdout', prints: renderLoggedOut(segment.email).map((line) => [line]) };

    case 'not-logged-in':
      return { stream: 'stdout', prints: renderNotLoggedIn().map((line) => [line]) };
  }
}
