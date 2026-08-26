/**
 * THE LITERAL PIN - the only thing standing between a refactor and a silently
 * changed CLI transcript, for every family whose fixture is masked of colour.
 *
 * WHY THIS EXISTS, IN ONE PARAGRAPH. The render-layer extraction is proved by
 * re-rendering a scripted run and demanding byte-identity with a fixture that was
 * committed before the extraction. That ratchet is a real instrument - but it
 * compares MASKED bytes, and `maskTestBundledCli` (like `maskInitOutput`) strips
 * ANSI before comparing. So for those families the ratchet cannot see a chalk
 * boundary move, and it cannot see whitespace move ACROSS one. The dry-run slice
 * proved this the hard way: hoisting the newline out of
 * `chalk.bold('\n📦 ...')` - the tidiest-looking cleanup on the board - left the
 * ratchet green while changing what a real terminal prints. This file is not a
 * supplement to that ratchet. For a colour-stripping family it is the ONLY cover.
 *
 * WHAT IT PINS, AND WHY NOT A SNAPSHOT. Two instruments were on the table:
 *
 *   (a) a SNAPSHOT of the rendered segments, and
 *   (b) an assertion over the SOURCE's string literals (the repo's grep-pin idiom).
 *
 * Neither is what is below, and the reasons are worth keeping. A snapshot loses on
 * the one axis that matters here: the corruption class we are guarding is an
 * innocuous-looking cleanup, and a snapshot's own remedy is `vitest -u`, which
 * blesses exactly such a cleanup without a human ever reading the escape that
 * moved. A pure source grep loses on the other axis: it reds when prettier reflows
 * a line or a literal is hoisted into a constant - changes that alter no byte a
 * user sees - and a pin that cries wolf trains people to re-bless pins, which is
 * how the real corruption eventually walks through.
 *
 * So the instrument below is EXPECTED BYTES, WRITTEN INLINE. It renders each
 * segment through the SHIPPED `renderSegment` (not a copy of it) with
 * `chalk.level` pinned, and compares against a literal written out here with every
 * escape spelled `ESC[1m` / `\n` rather than embedded raw, so a moved newline is a
 * visible character in the diff. It is a behavioural pin, so a harmless
 * re-spelling of the source passes; and it is an inline literal with no snapshot
 * file, so there is no `-u` that can update it. Changing it is a diff a reviewer
 * reads, in which a moved `\n` is a visible character.
 *
 * WHAT IT CANNOT CATCH. Stated plainly, because believing a pin is total is worse
 * than knowing its edge:
 *   - WHICH segments the logic emits, and in what ORDER. That is the byte
 *     ratchet's job and it does see it, because ordering survives masking.
 *   - The gradient WORDMARK's colours. Its bytes are per-character and
 *     gradient-string-version-dependent, so the intro is pinned on its
 *     ANSI-STRIPPED shape (where every newline and trailing space is, which IS the
 *     class) plus the fact that colour is present at all. A change of gradient
 *     stops alone would pass here.
 *   - An edit that changes the renderer and this pin in the same commit. No pin
 *     can catch that; it is what review is for.
 *   - Colour behaviour at chalk levels other than 1. The layer's own header
 *     declares one regime - colour always on - so one level is pinned.
 */
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CapturedTranscript } from '../../helpers/transcriptSink';
import type { RenderedSegment } from '../renderSegment';
import type { TranscriptSegment } from '../segments';

/**
 * The layer bakes chalk into module-level constants at IMPORT time
 * (`DRY_RUN_CLOSER` in dryRunPlan.ts says so in its own header), so colour must be
 * pinned BEFORE the first import of any CLI module - hence the dynamic import.
 */
let renderSegment: (segment: TranscriptSegment) => RenderedSegment;
let emit: (segment: TranscriptSegment) => void;
let captureTranscript: (body: () => Promise<void>) => Promise<CapturedTranscript>;

beforeAll(async () => {
  chalk.level = 1;
  ({ renderSegment } = await import('../renderSegment'));
  ({ emit, captureTranscript } = await import('../../helpers/transcriptSink'));
});

/* ========================================================================== */
/* The pins                                                                   */
/* ========================================================================== */

const ESC = '\u001b';

/**
 * One pinned segment: the state that produces it, and the EXACT bytes the shipped
 * renderer must turn that state into. `prints` mirrors {@link RenderedSegment} -
 * one entry per print call, each entry that call's arguments.
 *
 * Note how chalk v4 re-opens its style on every LINE of a styled string: the
 * bundling header below reads `ESC[1m ESC[22m \n ESC[1m 📦 ... ESC[22m \n ESC[1m
 * ESC[22m`, which is precisely the shape that disappears when the newline is
 * hoisted out of the `chalk.bold(...)` call - and precisely what a colour-stripping
 * masker erases.
 */
type Pin = {
  kind: TranscriptSegment['kind'];
  what: string;
  segment: TranscriptSegment;
  stream: 'stdout' | 'stderr';
  prints: string[][];
};

const PINS: Pin[] = [
  {
    kind: 'dry-run-bundling-header',
    what: 'the bundling header, whose blank lines live INSIDE the bold',
    segment: { kind: 'dry-run-bundling-header' },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[1m${ESC}[22m\n${ESC}[1m📦 Bundling for dry-run preview...${ESC}[22m\n${ESC}[1m${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'platform-bundle-start',
    what: 'the android bundle-start line, whose leading blank line is inside the cyan',
    segment: { kind: 'platform-bundle-start', platform: 'android' },
    stream: 'stdout',
    prints: [[`${ESC}[36m${ESC}[39m\n${ESC}[36m🤖 Building android bundle...${ESC}[39m`]],
  },
  {
    kind: 'platform-bundle-start',
    what: 'the ios bundle-start line (the apple emoji, and the lowercase platform word)',
    segment: { kind: 'platform-bundle-start', platform: 'ios' },
    stream: 'stdout',
    prints: [[`${ESC}[36m${ESC}[39m\n${ESC}[36m🍎 Building ios bundle...${ESC}[39m`]],
  },
  {
    kind: 'platform-bundle-built',
    what: 'the bundle-built line, where the green CLOSES before the size parenthetical',
    segment: {
      kind: 'platform-bundle-built',
      bundlePath: '/tmp/out/bundle.android.js',
      bundleSizeMb: 4.29,
      bundleFormat: 'plain-js',
      bundler: 'expo',
    },
    stream: 'stdout',
    prints: [[`${ESC}[32m  ✓ Bundle: bundle.android.js${ESC}[39m (4.29 MB, plain-js, expo)`]],
  },
  {
    kind: 'platform-bundle-assets',
    what: 'the assets line, two leading spaces inside the green',
    segment: { kind: 'platform-bundle-assets', assetCount: 6 },
    stream: 'stdout',
    prints: [[`${ESC}[32m  ✓ Assets: 6 files${ESC}[39m`]],
  },
  {
    kind: 'platform-bundle-supplied',
    what: 'the supplied-bundle line - it SAYS "supplied", and the green closes before the parenthetical exactly as the built line does',
    segment: {
      kind: 'platform-bundle-supplied',
      bundlePath: '/tmp/supplied/bundle.android.js',
      bundleSizeMb: 4.29,
      bundleFormat: 'plain-js',
      bundler: 'expo',
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m  ✓ Bundle supplied: bundle.android.js${ESC}[39m (4.29 MB, plain-js, expo)`],
    ],
  },
  {
    kind: 'platform-bundle-supplied-note',
    what: 'the supplied-bundle advisory - yellow, two leading spaces, a bang not a cross (it is not a failure)',
    segment: {
      kind: 'platform-bundle-supplied-note',
      note: 'built beside a different native base (abc123def456)',
    },
    stream: 'stdout',
    prints: [[`${ESC}[33m  ! built beside a different native base (abc123def456)${ESC}[39m`]],
  },
  {
    kind: 'bundle-emit-header',
    what: 'the emit header, whose blank lines live INSIDE the bold like every other header',
    segment: { kind: 'bundle-emit-header', bundleDir: '/tmp/out' },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[1m${ESC}[22m\n${ESC}[1m📦 Emitting bundle directory to /tmp/out...${ESC}[22m\n${ESC}[1m${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'platform-bundle-emitted',
    what: 'the emitted line, where the green closes before the asset parenthetical',
    segment: {
      kind: 'platform-bundle-emitted',
      platform: 'android',
      bundleDir: '/tmp/out',
      assetCount: 6,
    },
    stream: 'stdout',
    prints: [[`${ESC}[32m  ✓ Emitted android bundle${ESC}[39m (6 assets)`]],
  },
  {
    kind: 'platform-bundle-failed',
    what: 'the bundling failure, whose leading blank line is inside the red',
    segment: { kind: 'platform-bundle-failed', message: 'metro exited with code 1' },
    stream: 'stdout',
    prints: [[`${ESC}[31m${ESC}[39m\n${ESC}[31m  ✗ metro exited with code 1${ESC}[39m`]],
  },
  {
    kind: 'dry-run-capture-plan',
    what: 'the whole capture plan and its closer - indentation, the two blank lines before "◦ Dry run", and every style boundary in between',
    segment: {
      kind: 'dry-run-capture-plan',
      previews: [
        {
          status: 'decided',
          decision: {
            platform: 'android',
            isFullCapture: false,
            capturedStoryFilePaths: ['src/components/Storefront/ProductCard.stories.tsx'],
            totalStories: 12,
            reason: '1 file changed - a.tsx',
          },
        },
        { status: 'bailed-open', platform: 'ios', reason: 'the decision query timed out' },
      ],
    },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[1m📸 Capture plan (dry run)${ESC}[22m\n` +
          `  ${ESC}[36m🤖 Android${ESC}[39m - ${ESC}[1mwould capture 1 of 12 stories in this bundle, reusing 11 from the previous build${ESC}[22m\n` +
          `${ESC}[2m     why: 1 file changed - a.tsx${ESC}[22m\n` +
          `${ESC}[2m     stories:${ESC}[22m\n` +
          `${ESC}[2m       • Storefront/ProductCard${ESC}[22m\n` +
          `  ${ESC}[36m🍎 iOS${ESC}[39m - ${ESC}[1mwould capture all stories${ESC}[22m\n` +
          `${ESC}[33m     ! couldn't compute what changed - capturing everything to be safe${ESC}[39m\n` +
          `\n` +
          `${ESC}[33m◦ Dry run - no build created, nothing uploaded${ESC}[39m`,
      ],
    ],
  },

  /* ---------------------------------------------------------------------- *
   * THE PUSH SPINE (F1).                                                   *
   *                                                                        *
   * This family's masker (`maskPushOutput`) PRESERVES colour, so unlike    *
   * everything above it the byte ratchet does see a moved chalk boundary   *
   * here. These pins are therefore not the only cover - they are the       *
   * cheaper, more legible one, and they keep the rule that a kind cannot   *
   * join the union uncovered. They also cover the family's un-fixtured     *
   * branches (the upload retry, the INFO notice, the generic build         *
   * message, `output-keys`), which no committed transcript watches at all. *
   * ---------------------------------------------------------------------- */
  {
    kind: 'run-header',
    what: 'the run header for two devices on two platforms - plural noun, comma-joined breakdown, and the TRAILING newline that is the blank line under it',
    segment: {
      kind: 'run-header',
      nextBuildIndex: 3,
      devices: [
        { id: 'pixel.4.xl', osVersion: '13', theme: 'light', locale: 'en_US', fontScale: '1' },
        { id: 'iphone.14', osVersion: '16.4', theme: 'light', locale: 'en_US', fontScale: '1' },
      ],
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[32mTest 3${ESC}[39m will run on ${ESC}[34m2 devices${ESC}[39m (1 Android, 1 iOS)\n`],
    ],
  },
  {
    kind: 'run-header',
    what: 'the run header for ONE device - the singular noun, which is a different word and not a different style',
    segment: {
      kind: 'run-header',
      nextBuildIndex: 1,
      devices: [
        { id: 'pixel.4.xl', osVersion: '13', theme: 'light', locale: 'en_US', fontScale: '1' },
      ],
    },
    stream: 'stdout',
    prints: [[`${ESC}[32mTest 1${ESC}[39m will run on ${ESC}[34m1 device${ESC}[39m (1 Android)\n`]],
  },
  {
    kind: 'binary-platform-label',
    what: 'the Android binary-block label - the emoji and its ONE trailing space sit OUTSIDE the bold',
    segment: { kind: 'binary-platform-label', platform: 'android' },
    stream: 'stdout',
    prints: [[`📦 ${ESC}[1mAndroid${ESC}[22m`]],
  },
  {
    kind: 'binary-platform-label',
    what: 'the iOS binary-block label - the label is "iOS", capitalised as the product spells it',
    segment: { kind: 'binary-platform-label', platform: 'ios' },
    stream: 'stdout',
    prints: [[`📦 ${ESC}[1miOS${ESC}[22m`]],
  },
  {
    kind: 'binary-uploading',
    what: 'the uploading line - the blue closes after the icon, and TWO spaces follow it to align with the section title above',
    segment: { kind: 'binary-uploading', sizeMb: '41.2' },
    stream: 'stdout',
    prints: [[`${ESC}[34m➜${ESC}[39m  uploading build... (41.2 MB)`]],
  },
  {
    kind: 'binary-uploaded',
    what: 'the upload-complete line and the BARE console.log() that follows it - two print calls, not one string with a trailing newline',
    segment: { kind: 'binary-uploaded' },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m  upload complete`], []],
  },
  {
    kind: 'binary-upload-retry',
    what: 'the upload retry notice - a real branch no committed fixture watches, which is exactly why it is pinned here',
    segment: { kind: 'binary-upload-retry', attempt: 1, maxRetries: 3 },
    stream: 'stdout',
    prints: [[`${ESC}[34m➜${ESC}[39m  Upload failed (attempt 1/3), retrying...`]],
  },
  {
    kind: 'binary-reused',
    what: 'the reuse line - THREE nested style boundaries on one line, and a bare newline after it',
    segment: { kind: 'binary-reused', buildIndex: 1, timeAgo: '7 minutes ago' },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✔${ESC}[39m  reusing unchanged build (${ESC}[32mTest 1${ESC}[39m, ${ESC}[34m7 minutes ago${ESC}[39m)`,
      ],
      [],
    ],
  },
  {
    kind: 'eas-update',
    what: 'the whole EAS Update block - four `└─` rows in one print call, and the trailing newline that is the blank line under it',
    segment: {
      kind: 'eas-update',
      message: '"tester update"',
      timeAgo: '2 minutes ago',
      author: 'github-actions (robot)',
      branch: 'e2e-comparison',
    },
    stream: 'stdout',
    prints: [
      [
        `🔄 ${ESC}[1mEAS Update${ESC}[22m\n` +
          `└─ message: ${ESC}[34m"tester update"${ESC}[39m\n` +
          `└─ created: ${ESC}[34m2 minutes ago${ESC}[39m\n` +
          `└─ author: ${ESC}[34mgithub-actions (robot)${ESC}[39m\n` +
          `└─ branch: ${ESC}[34me2e-comparison${ESC}[39m\n`,
      ],
    ],
  },
  {
    kind: 'notice',
    what: 'a WARNING with no learn-more link - one line, the whole thing yellow',
    segment: { kind: 'notice', level: 'warning', message: 'Staged uploads unavailable - reason.' },
    stream: 'stdout',
    prints: [[`${ESC}[33mWARNING: Staged uploads unavailable - reason.${ESC}[39m`]],
  },
  {
    kind: 'notice',
    what: 'an INFO with a learn-more link - two lines joined INSIDE one print call, the link underlined inside the dim',
    segment: {
      kind: 'notice',
      level: 'info',
      message: 'Something worth knowing.',
      learnMoreLink: 'https://sherlo.io/docs',
    },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[34mINFO: Something worth knowing.${ESC}[39m\n` +
          `${ESC}[2m↳ Learn more: ${ESC}[4mhttps://sherlo.io/docs${ESC}[24m${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'build-message',
    what: 'the generic build line for the call sites outside the spine - the same icon framing, so the two roads cannot drift',
    segment: { kind: 'build-message', message: 'reading build...', type: 'info' },
    stream: 'stdout',
    prints: [[`${ESC}[34m➜${ESC}[39m  reading build...`]],
  },
  {
    kind: 'build-message',
    what: 'the generic build line with endsWithNewLine - the flag adds a BARE console.log(), not a "\\n"',
    segment: { kind: 'build-message', message: 'done', type: 'success', endsWithNewLine: true },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m  done`], []],
  },
  {
    kind: 'manifest-producing',
    what: 'the manifest header, whose leading blank line lives INSIDE the cyan - the single sharpest byte in this family',
    segment: { kind: 'manifest-producing' },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[36m${ESC}[39m\n${ESC}[36m📄 Producing the module manifest for Diff Scope...${ESC}[39m`,
      ],
    ],
  },
  {
    kind: 'manifest-uploaded',
    what: 'the manifest-uploaded line - two leading spaces INSIDE the green, like the bundle lines above',
    segment: { kind: 'manifest-uploaded', platform: 'android' },
    stream: 'stdout',
    prints: [[`${ESC}[32m  ✓ Android module manifest uploaded${ESC}[39m`]],
  },
  {
    kind: 'results-url',
    what: 'the closer - the machine-readable `url=` line FIRST, then the human link with its trailing blank line',
    segment: { kind: 'results-url', url: 'https://app.sherlo.io/build?t=tm000001&p=7&b=1' },
    stream: 'stdout',
    prints: [
      ['url=https://app.sherlo.io/build?t=tm000001&p=7&b=1'],
      [`🔗 ${ESC}[4mhttps://app.sherlo.io/build?t=tm000001&p=7&b=1${ESC}[24m\n`],
    ],
  },
  {
    kind: 'output-keys',
    what: 'the machine-readable answer lines - one print call each, an empty and an undefined value BOTH omitted, and a newline in a value flattened to a space',
    segment: {
      kind: 'output-keys',
      entries: {
        'native-needed': true,
        reason: 'a\nb',
        empty: '',
        absent: undefined,
      },
    },
    stream: 'stdout',
    prints: [['native-needed=true'], ['reason=a b']],
  },

  /* -------------------- the verdict family (F4) -------------------- */

  {
    kind: 'blank-line',
    what: 'the closer frame: ONE argument-less console.log(), which is not the same call as console.log("")',
    segment: { kind: 'blank-line' },
    stream: 'stdout',
    prints: [[]],
  },
  {
    kind: 'wait-header',
    what: 'the --wait header, dim, with the minute count and no space before "min"',
    segment: { kind: 'wait-header', timeoutMinutes: 45 },
    stream: 'stdout',
    prints: [[`${ESC}[2m⏳ Waiting for build results (timeout: 45min)...${ESC}[22m`]],
  },
  {
    kind: 'wait-progress',
    what: 'the progress line for a known status: three leading spaces INSIDE the dim, and the emoji label',
    segment: { kind: 'wait-progress', runStatus: 'inProgress' },
    stream: 'stdout',
    prints: [[`${ESC}[2m   🔵 Running${ESC}[22m`]],
  },
  {
    kind: 'wait-heartbeat',
    what: 'the heartbeat, whose label and elapsed minutes both arrive pre-computed because both come from the clock',
    segment: { kind: 'wait-heartbeat', statusLabel: 'running', elapsedMinutes: 5 },
    stream: 'stdout',
    prints: [[`${ESC}[2m   still running... (5m elapsed)${ESC}[22m`]],
  },
  {
    kind: 'wait-network-retry',
    what: "the transient-blip line, carrying the transport's own message in parentheses",
    segment: { kind: 'wait-network-retry', message: 'ENOTFOUND api.sherlo.io' },
    stream: 'stdout',
    prints: [[`${ESC}[2m   Network error, retrying... (ENOTFOUND api.sherlo.io)${ESC}[22m`]],
  },
  {
    kind: 'wait-build-not-found',
    what: 'the build-not-found retry line',
    segment: { kind: 'wait-build-not-found' },
    stream: 'stdout',
    prints: [[`${ESC}[2m   Build not found, retrying...${ESC}[22m`]],
  },
  {
    kind: 'wait-auth-failed',
    what: 'the credential-refused closer, red, with the error message verbatim after the lock',
    segment: {
      kind: 'wait-auth-failed',
      message: 'Authentication failed (HTTP 401) - check your token',
    },
    stream: 'stdout',
    prints: [[`${ESC}[31m🔒 Authentication failed (HTTP 401) - check your token${ESC}[39m`]],
  },
  {
    kind: 'wait-timed-out',
    what: 'the deadline closer: TWO print calls, and "minutes" spelled out where the header abbreviates',
    segment: { kind: 'wait-timed-out', timeoutMinutes: 45 },
    stream: 'stdout',
    prints: [
      [`${ESC}[33m⏰ Timeout reached after 45 minutes.${ESC}[39m`],
      [`${ESC}[33m   The build may still be running.${ESC}[39m`],
    ],
  },
  {
    kind: 'wait-interrupted',
    what: "the Ctrl-C closer, dim - the same style the progress lines use, which is why the tester's collapse anchors on its TEXT and not on its colour",
    segment: { kind: 'wait-interrupted' },
    stream: 'stdout',
    prints: [[`${ESC}[2mStopped waiting. The run is still going in Sherlo.${ESC}[22m`]],
  },
  {
    kind: 'verdict-passed',
    what: "today's generic green closer",
    segment: { kind: 'verdict-passed' },
    stream: 'stdout',
    prints: [[`${ESC}[32m✅ All stories passed - no visual changes require review.${ESC}[39m`]],
  },
  {
    kind: 'verdict-server-bypassed',
    what: "the server-bypassed closer: the server's prose inline in a green headline, then a fixed dim line",
    segment: {
      kind: 'verdict-server-bypassed',
      reason: 'no change on this branch reaches any story',
    },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✅ Nothing needed capturing - no change on this branch reaches any story${ESC}[39m`,
      ],
      [`${ESC}[2m   closed by the server - no device run was needed${ESC}[22m`],
    ],
  },
  {
    kind: 'verdict-review-required',
    what: 'the block closer with BOTH counts non-zero - three print calls, because how many lines it makes is a function of the state',
    segment: { kind: 'verdict-review-required', unreviewed: 2, reported: 1 },
    stream: 'stdout',
    prints: [
      [`${ESC}[33m⚠️  Build finished with changes requiring review.${ESC}[39m`],
      [`${ESC}[33m   2 story/stories unreviewed.${ESC}[39m`],
      [`${ESC}[33m   1 story/stories reported.${ESC}[39m`],
    ],
  },
  {
    kind: 'verdict-run-errored',
    what: "the infrastructure closer, with the server's error blob stringified rather than phrased",
    segment: {
      kind: 'verdict-run-errored',
      runStatus: 'error',
      runError: { code: 'RUNNER_CRASH' },
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[31m❌ Build ended in "error" state.${ESC}[39m`],
      [`${ESC}[31m   Error: {"code":"RUNNER_CRASH"}${ESC}[39m`],
    ],
  },

  /* ⚠⚠ DEPICTS FUTURE. Pinned exactly like the rest, because a drawing whose
   * bytes can drift silently is worse than no drawing: these are the bytes an
   * operator is being asked to approve a product design from. */

  {
    kind: 'verdict-no-changes',
    what: "⚠⚠ DEPICTS FUTURE: the sparse green, in the GitHub check's own words (CHECK_COPY.noChanges title + summary)",
    segment: { kind: 'verdict-no-changes' },
    stream: 'stdout',
    prints: [[`${ESC}[32m✅ No visual changes - all snapshots match their baselines.${ESC}[39m`]],
  },
  {
    kind: 'verdict-capture-accounting',
    what: '⚠⚠ DEPICTS FUTURE: the sparse accounting line - what this branch photographed, and what it carried over',
    segment: { kind: 'verdict-capture-accounting', captured: 3, inherited: 41 },
    stream: 'stdout',
    prints: [[`${ESC}[2m   3 captured on this branch, 41 inherited unchanged${ESC}[22m`]],
  },
  {
    kind: 'verdict-nothing-recorded',
    what: '⚠⚠ DEPICTS FUTURE: the guard case - an all-zero tally over an all-zero suite, which is evidence of nothing and is deliberately NOT green',
    segment: { kind: 'verdict-nothing-recorded' },
    stream: 'stdout',
    prints: [
      [`${ESC}[33m⚠️  Build finished without recording any snapshots.${ESC}[39m`],
      [
        `${ESC}[33m   Nothing was captured and nothing was inherited, so this build is not${ESC}[39m`,
      ],
      [`${ESC}[33m   evidence that nothing changed. Check the run in Sherlo.${ESC}[39m`],
    ],
  },
];

/**
 * The intro's wordmark, ANSI-stripped: eight lines of art between a leading and a
 * trailing newline, with the trailing spaces that pad them. Those spaces and those
 * newlines are the part of the intro a masker would keep but a "tidy up the
 * template literal" edit would silently move - the gradient's colours are the part
 * this file deliberately does not pin (see the header).
 */
const INTRO_WORDMARK_STRIPPED = [
  '',
  '             888                       888          ',
  '             888                       888          ',
  '             888                       888          ',
  '    .d8888b  888 8b.   .d88b.  .d88888 888  .d88b.  ',
  '    88K      888 "88b d8P  Y8b 888"    888 d88""88b ',
  '    "Y8888b. 888  888 88888888 888     888 888  888 ',
  '         X88 888  888 Y8b.     888     888 Y88..88P ',
  '    \'88888P\' 888  888  "Y8888  888     888  "Y88P"',
  '',
].join('\n');

const INTRO_TAGLINE_BYTES = `${ESC}[2m${ESC}[3mMake sure your mobile app looks perfect on every device${ESC}[23m${ESC}[22m`;

const GIT_INFO_UNAVAILABLE_BYTES = "Couldn't get git info";

/* ========================================================================== */
/* Instruments                                                                */
/* ========================================================================== */

/** Everything a masker of the `maskTestBundledCli` family removes before comparing. */
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
function stripAnsi(value: string): string {
  return value.replace(ANSI, '');
}

/** A byte string, rendered so a moved newline or escape is a VISIBLE character. */
function visible(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001b/g, '\\e').replace(/\n/g, '\\n');
}

/**
 * The failure sentence. It names the literal, the file it ships from, both
 * spellings with their escapes made visible, and - the part that matters - says
 * out loud that the byte ratchet is not a second opinion here.
 */
function mismatch(what: string, file: string, expected: string, actual: string): string {
  return [
    `${what} no longer renders the bytes it is pinned to.`,
    ``,
    `  shipped from : packages/cli/src/${file}`,
    `  pinned       : ${visible(expected)}`,
    `  rendered     : ${visible(actual)}`,
    ``,
    stripAnsi(expected) === stripAnsi(actual)
      ? `THE TWO ARE IDENTICAL ONCE ANSI IS STRIPPED. That is exactly the class the byte-identity ratchet CANNOT see: for every colour-stripping family (maskTestBundledCli, maskInitOutput) the fixture is compared after the escapes are gone, so a newline that moved into or out of a styling call, or a style boundary that shifted around the same visible text, passes there and is caught only here. If you meant to change what a real terminal prints, update this pin in the same commit and say so in the message. If you did not, you have just moved a byte a user sees.`
      : `The visible text changed too, so a fixture will red as well - but fix the intent, not the pin: this layer holds every literal the CLI prints, and rewording one here is a product change.`,
  ].join('\n');
}

function pinnedBytes(pin: Pin, actual: RenderedSegment): void {
  expect(actual.stream, `${pin.what} switched stream`).toBe(pin.stream);
  expect(
    actual.prints.length,
    `${pin.what} changed how many print calls it makes - console.log() with no argument is a newline of its own, so this is a transcript change`
  ).toBe(pin.prints.length);

  pin.prints.forEach((expectedArgs, index) => {
    const actualArgs = actual.prints[index].map(String);
    expectedArgs.forEach((expectedArg, argIndex) => {
      expect(
        actualArgs[argIndex],
        mismatch(pin.what, 'render/renderSegment.ts', expectedArg, actualArgs[argIndex] ?? '')
      ).toBe(expectedArg);
    });
  });
}

/* ========================================================================== */
/* The gate                                                                   */
/* ========================================================================== */

describe('the render layer emits the literals it is pinned to', () => {
  it.each(PINS.map((pin) => [pin.what, pin] as const))('%s', (_what, pin) => {
    pinnedBytes(pin, renderSegment(pin.segment));
  });

  it('the intro: wordmark shape, styled tagline, and the bare newline that closes it', () => {
    const { stream, prints } = renderSegment({ kind: 'intro' });

    expect(stream).toBe('stdout');
    expect(prints.length, 'the intro is THREE print calls; the third is a bare newline').toBe(3);

    const wordmark = String(prints[0][0]);
    expect(
      stripAnsi(wordmark),
      mismatch(
        'the intro wordmark',
        'render/renderSegment.ts',
        INTRO_WORDMARK_STRIPPED,
        stripAnsi(wordmark)
      )
    ).toBe(INTRO_WORDMARK_STRIPPED);
    expect(
      wordmark.includes(ESC),
      'the wordmark lost its gradient - it is rendered per character by gradient-string and must still carry colour'
    ).toBe(true);

    expect(
      String(prints[1][0]),
      mismatch(
        'the intro tagline',
        'render/renderSegment.ts',
        INTRO_TAGLINE_BYTES,
        String(prints[1][0])
      )
    ).toBe(INTRO_TAGLINE_BYTES);

    expect(
      prints[2],
      'the intro ends with an ARGUMENT-LESS console.log(); console.log("") is a different call and util.format renders it differently'
    ).toEqual([]);
  });

  it('the git-info degrade: a two-argument warn on stderr, the error passed through untouched', () => {
    const error = new Error('not a git repository');
    const { stream, prints } = renderSegment({ kind: 'git-info-unavailable', error });

    expect(stream).toBe('stderr');
    expect(prints.length).toBe(1);
    expect(
      String(prints[0][0]),
      mismatch(
        'the git-info warning',
        'render/renderSegment.ts',
        GIT_INFO_UNAVAILABLE_BYTES,
        String(prints[0][0])
      )
    ).toBe(GIT_INFO_UNAVAILABLE_BYTES);
    expect(
      prints[0][1],
      'the error must reach the stream as the SECOND argument, so node formats it - stringifying it here would change the bytes'
    ).toBe(error);
  });
});

/* ========================================================================== */
/* Coverage: a new segment cannot join silently uncovered                     */
/* ========================================================================== */

/**
 * Every `kind` the shipped segment union declares, lifted out of the file that
 * ships rather than from a list kept here. This is the repo's grep-pin idiom
 * (sherlo-tester's manifest-provenance gate) applied to the one thing that must
 * not be duplicated: the roster of what the layer can print.
 *
 * It is a complete roster because `renderSegment` switches EXHAUSTIVELY over this
 * union - TypeScript enforces that - so every byte the render layer emits reaches
 * a user through exactly one of these kinds. A new helper module under
 * `src/render/` is therefore not a hole: it is unreachable until some kind renders
 * through it, and that kind must be pinned below.
 */
function shippedSegmentKinds(): string[] {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'segments.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const kinds = [...code.matchAll(/\bkind:\s*'([a-z0-9-]+)'/g)].map((match) => match[1]);
  return [...new Set(kinds)].sort();
}

describe('every segment the CLI can print is pinned', () => {
  it('the roster is read from the shipped union and is not empty', () => {
    expect(
      shippedSegmentKinds().length,
      'no segment kinds were found in src/render/segments.ts - if the union moved, move this reader with it, because a roster of nothing makes the coverage check below vacuous'
    ).toBeGreaterThan(0);
  });

  it('no kind renders bytes that nothing in this file pins', () => {
    const pinned = new Set<string>([
      ...PINS.map((pin) => pin.kind),
      'intro',
      'git-info-unavailable',
    ]);
    const unpinned = shippedSegmentKinds().filter((kind) => !pinned.has(kind));

    expect(
      unpinned,
      `these segment kinds ship but have no literal pin: ${unpinned.join(
        ', '
      )}. Add one to PINS above with the EXACT bytes it renders (run the segment through renderSegment with chalk.level = 1 and copy what comes out, escapes and all). Until you do, this kind's literals, blank lines and style boundaries are covered by nothing - the byte ratchet masks colour away for this family, which is the whole reason this file exists.`
    ).toEqual([]);
  });
});

/* ========================================================================== */
/* CONTROLS: the instrument, tested against the thing it exists to catch      */
/* ========================================================================== */

describe('CONTROL: the pin catches what the masker hides', () => {
  /**
   * The dry-run slice's actual near-miss, reproduced. `chalk.bold('\n📦 ...')`
   * hoisted to `'\n' + chalk.bold('📦 ...')` reads better and prints differently;
   * the fixture never noticed. These two assertions are the proof that the gate
   * above is pointed at the right thing.
   */
  const shipped = `${ESC}[1m${ESC}[22m\n${ESC}[1m📦 Bundling for dry-run preview...${ESC}[22m\n${ESC}[1m${ESC}[22m`;
  const hoisted = `\n${ESC}[1m📦 Bundling for dry-run preview...${ESC}[22m\n`;

  it('a masker cannot tell the two apart', () => {
    expect(
      stripAnsi(hoisted),
      'if these ever differ once stripped, the worked example has drifted and the control below proves less than it claims'
    ).toBe(stripAnsi(shipped));
  });

  it('the pin can', () => {
    expect(hoisted).not.toBe(shipped);
  });

  it('and the pinned value is what the shipped renderer actually emits', () => {
    expect(String(renderSegment({ kind: 'dry-run-bundling-header' }).prints[0][0])).toBe(shipped);
  });
});

/* ========================================================================== */
/* The sink: the bytes a segment becomes once it leaves the renderer          */
/* ========================================================================== */

describe('the sink concatenates segments without editing them', () => {
  it('one newline per print call, the rendered bytes verbatim, stderr kept apart', async () => {
    const error = new Error('not a git repository');

    const captured = await captureTranscript(async () => {
      emit({ kind: 'dry-run-bundling-header' });
      emit({ kind: 'platform-bundle-assets', assetCount: 6 });
      emit({ kind: 'git-info-unavailable', error });
    });

    expect(
      captured.stdout,
      mismatch(
        'the buffered stdout transcript',
        'helpers/transcriptSink.ts',
        `${ESC}[1m${ESC}[22m\n${ESC}[1m📦 Bundling for dry-run preview...${ESC}[22m\n${ESC}[1m${ESC}[22m\n${ESC}[32m  ✓ Assets: 6 files${ESC}[39m\n`,
        captured.stdout
      )
    ).toBe(
      `${ESC}[1m${ESC}[22m\n${ESC}[1m📦 Bundling for dry-run preview...${ESC}[22m\n${ESC}[1m${ESC}[22m\n${ESC}[32m  ✓ Assets: 6 files${ESC}[39m\n`
    );

    expect(
      captured.stderr.startsWith(`${GIT_INFO_UNAVAILABLE_BYTES} Error: not a git repository`),
      "the warn must keep its two arguments space-joined by node's own formatter, not by this layer"
    ).toBe(true);
    expect(captured.stderr.endsWith('\n')).toBe(true);
  });
});
