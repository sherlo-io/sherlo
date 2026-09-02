/**
 * THE RENDER LAYER: state in, bytes out. Pure - no `console.`, no `process.`, no
 * `await`, no `@sherlo/sdk-client`.
 *
 * This module holds EVERY literal, emoji, chalk call and blank line the
 * `--dry-run` family prints. Nothing upstream of it spells a sentence, and
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
  renderBuildDetails,
  renderBuildViewHeader,
  renderBuildViewStatus,
  renderBuildViewTally,
} from './buildView';
import { formatDryRunPreview } from './dryRunPlan';
import {
  formatLink,
  renderBinaryPlatformLabel,
  renderBinaryReused,
  renderBuildMessageLine,
  renderNotice,
  renderOutputKeys,
  renderRunHeader,
} from './pushSpine';
import type { TranscriptSegment, TranscriptStream } from './segments';
import {
  renderVerdictCaptureAccounting,
  renderVerdictNoChanges,
  renderVerdictNothingRecorded,
  renderVerdictPassed,
  renderVerdictReviewRequired,
  renderVerdictRunErrored,
  renderVerdictServerBypassed,
  renderWaitAuthFailed,
  renderWaitBuildNotFound,
  renderWaitHeader,
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

    case 'dry-run-bundling-header':
      return {
        stream: 'stdout',
        prints: [[chalk.bold('\n📦 Bundling for dry-run preview...\n')]],
      };

    case 'platform-bundle-start':
      return {
        stream: 'stdout',
        prints: [
          [
            chalk.cyan(
              `\n${platformEmoji(segment.platform)} Building ${segment.platform} bundle...`
            ),
          ],
        ],
      };

    case 'platform-bundle-built':
      return {
        stream: 'stdout',
        prints: [
          [
            chalk.green(`  ✓ Bundle: ${path.basename(segment.bundlePath)}`) +
              ` (${segment.bundleSizeMb} MB, ${segment.bundleFormat}, ${segment.bundler})`,
          ],
        ],
      };

    case 'platform-bundle-assets':
      return {
        stream: 'stdout',
        prints: [[chalk.green(`  ✓ Assets: ${segment.assetCount} files`)]],
      };

    case 'platform-bundle-supplied':
      return {
        stream: 'stdout',
        prints: [
          [
            chalk.green(`  ✓ Bundle supplied: ${path.basename(segment.bundlePath)}`) +
              ` (${segment.bundleSizeMb} MB, ${segment.bundleFormat}, ${segment.bundler})`,
          ],
        ],
      };

    case 'platform-bundle-supplied-note':
      return {
        stream: 'stdout',
        prints: [[chalk.yellow(`  ! ${segment.note}`)]],
      };

    case 'bundle-emit-header':
      return {
        stream: 'stdout',
        prints: [[chalk.bold(`\n📦 Emitting bundle directory to ${segment.bundleDir}...\n`)]],
      };

    case 'platform-bundle-emitted':
      return {
        stream: 'stdout',
        prints: [
          [
            chalk.green(`  ✓ Emitted ${segment.platform} bundle`) +
              ` (${segment.assetCount} assets)`,
          ],
        ],
      };

    case 'platform-bundle-failed':
      return {
        stream: 'stdout',
        prints: [[chalk.red(`\n  ✗ ${segment.message}`)]],
      };

    case 'dry-run-capture-plan':
      return {
        stream: 'stdout',
        prints: [[formatDryRunPreview(segment.previews)]],
      };

    case 'git-info-unavailable':
      return {
        stream: 'stderr',
        prints: [[GIT_INFO_UNAVAILABLE, segment.error]],
      };

    /* ---------------------- the push spine (F1) ---------------------- */

    case 'run-header':
      return {
        stream: 'stdout',
        prints: [[renderRunHeader(segment.nextBuildIndex, segment.devices)]],
      };

    case 'binary-platform-label':
      return {
        stream: 'stdout',
        prints: [[renderBinaryPlatformLabel(segment.platform)]],
      };

    case 'binary-uploading':
      return {
        stream: 'stdout',
        prints: [[renderBuildMessageLine(`uploading build... (${segment.sizeMb} MB)`, 'info')]],
      };

    case 'binary-uploaded':
      // Two print calls, not one string with a trailing newline: the shipped
      // `endsWithNewLine` branch was a second bare `console.log()`, and a bare
      // one is what a buffering sink has to reproduce to stay byte-faithful.
      return {
        stream: 'stdout',
        prints: [[renderBuildMessageLine('upload complete', 'success')], []],
      };

    case 'binary-upload-retry':
      return {
        stream: 'stdout',
        prints: [
          [
            renderBuildMessageLine(
              `Upload failed (attempt ${segment.attempt}/${segment.maxRetries}), retrying...`,
              'info'
            ),
          ],
        ],
      };

    case 'binary-reused':
      return {
        stream: 'stdout',
        prints: [[renderBinaryReused(segment.buildIndex, segment.timeAgo)], []],
      };

    case 'notice':
      return {
        stream: 'stdout',
        prints: [[renderNotice(segment)]],
      };

    case 'build-message':
      return {
        stream: 'stdout',
        prints: [
          [renderBuildMessageLine(segment.message, segment.type)],
          ...(segment.endsWithNewLine ? [[]] : []),
        ],
      };

    case 'results-url':
      return {
        stream: 'stdout',
        prints: [
          ...renderOutputKeys({ url: segment.url }).map((line) => [line]),
          [`🔗 ${formatLink(segment.url)}\n`],
        ],
      };

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

    case 'wait-header':
      return { stream: 'stdout', prints: [[renderWaitHeader(segment.timeoutMinutes)]] };

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
        prints: renderWaitTimedOut(segment.timeoutMinutes).map((line) => [line]),
      };

    case 'wait-interrupted':
      return { stream: 'stdout', prints: [[renderWaitInterrupted()]] };

    case 'verdict-passed':
      return { stream: 'stdout', prints: [[renderVerdictPassed()]] };

    case 'verdict-server-bypassed':
      return {
        stream: 'stdout',
        prints: renderVerdictServerBypassed(segment.reason).map((line) => [line]),
      };

    case 'verdict-review-required':
      return {
        stream: 'stdout',
        prints: renderVerdictReviewRequired(segment.unreviewed, segment.reported).map((line) => [
          line,
        ]),
      };

    case 'verdict-run-errored':
      return {
        stream: 'stdout',
        prints: renderVerdictRunErrored(segment.runStatus, segment.runError).map((line) => [line]),
      };

    /* GATED on showsOnlyBranchChanges - see ./verdictCloser and helpers/sparseBuildVerdict. */

    case 'verdict-no-changes':
      return { stream: 'stdout', prints: [[renderVerdictNoChanges()]] };

    case 'verdict-capture-accounting':
      return {
        stream: 'stdout',
        prints: [[renderVerdictCaptureAccounting(segment.captured, segment.inherited)]],
      };

    case 'verdict-nothing-recorded':
      return {
        stream: 'stdout',
        prints: renderVerdictNothingRecorded().map((line) => [line]),
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
        prints: renderBuildViewStatus(segment.runStatus, segment.status).map((line) => [line]),
      };

    case 'build-details':
      return {
        stream: 'stdout',
        prints: renderBuildDetails(segment.details).map((line) => [line]),
      };
  }
}

/* ========================================================================== */

function platformEmoji(platform: 'android' | 'ios'): string {
  return platform === 'android' ? '🤖' : '🍎';
}
