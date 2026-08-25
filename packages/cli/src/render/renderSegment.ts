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
import { COLOR, PLATFORM_LABEL } from '../constants';
import { formatDryRunPreview } from './dryRunPlan';
import {
  formatLink,
  renderBinaryPlatformLabel,
  renderBinaryReused,
  renderBuildMessageLine,
  renderEasUpdate,
  renderNotice,
  renderOutputKeys,
  renderRunHeader,
} from './pushSpine';
import type { TranscriptSegment, TranscriptStream } from './segments';

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

    case 'eas-update':
      return {
        stream: 'stdout',
        prints: [[renderEasUpdate(segment)]],
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

    case 'manifest-producing':
      // The `\n` is INSIDE the chalk call on purpose - see ./pushSpine's header.
      return {
        stream: 'stdout',
        prints: [[chalk.cyan('\n📄 Producing the module manifest for Diff Scope...')]],
      };

    case 'manifest-uploaded':
      return {
        stream: 'stdout',
        prints: [[chalk.green(`  ✓ ${PLATFORM_LABEL[segment.platform]} module manifest uploaded`)]],
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
  }
}

/* ========================================================================== */

function platformEmoji(platform: 'android' | 'ios'): string {
  return platform === 'android' ? '🤖' : '🍎';
}
