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
 * The layer bakes chalk into module-level constants at IMPORT time, so colour must be
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

describe('THE CLOSER PRINTS THE ADDRESS ONCE, ON THE LINE WITH THE EMOJI, WHOEVER IS READING', () => {
  const url = 'https://app.sherlo.io/build?t=tm000001&p=7&b=1';

  it('the link is printed once and nothing else - no url= line, under CI or not', () => {
    // The same address twice on a screen was the defect. `CI` is set
    // on the runner these tests run on, and the closer no longer reads it - the segment carries
    // no reader flag at all, so there is nothing for the environment to change.
    process.env.CI = 'true';
    try {
      expect(renderSegment({ kind: 'results-url', url }).prints).toEqual([
        [`\u{1F517} Review: ${ESC}[36m${url}${ESC}[39m`],
        [''],
      ]);
    } finally {
      delete process.env.CI;
    }
  });
});

/* ========================================================================== */
/* The pins                                                                   */
/* ========================================================================== */

const ESC = '\u001b';

/** Init's help block, the end of every failed run (../testSteps `renderHelpBlock`), one print each. */
const HELP_BLOCK_PRINTS = [
  [`${ESC}[2m──────────${ESC}[22m`],
  [''],
  ['Need help?'],
  [`➜ Discord: ${ESC}[36mhttps://discord.gg/G7eqTBkWZt${ESC}[39m`],
  [`➜ Email: ${ESC}[36mcontact@sherlo.io${ESC}[39m`],
];

/** Init's `👉 Next step` section title: two blank lines, the bold title, its dim underline, a blank. */
const NEXT_STEP_TITLE_PRINTS = [
  [''],
  [''],
  [`${ESC}[1m👉 Next step${ESC}[22m`],
  [`${ESC}[2m════════════${ESC}[22m`],
  [''],
];

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
    kind: 'command-intro',
    what: "the line under the logo saying what the command is doing, then init's blank line",
    segment: { kind: 'command-intro', command: 'test' },
    stream: 'stdout',
    prints: [['Testing your app...'], ['']],
  },
  {
    kind: 'signed-in-through-github',
    what: "the line a CI push opens with when GitHub's ID token was the credential, then a blank line",
    segment: { kind: 'signed-in-through-github', repository: 'acme-mobile/shop-app' },
    stream: 'stdout',
    prints: [['Signed in through GitHub as acme-mobile/shop-app'], []],
  },
  {
    kind: 'platform-bundle-start',
    what: "the android bundle-start line as a log shows it - a step in progress, plain, printed once (a terminal shows the same words as a spinner's)",
    segment: { kind: 'platform-bundle-start', platform: 'android' },
    stream: 'stdout',
    prints: [['🤖 Android  Bundling the JavaScript...']],
  },
  {
    kind: 'platform-bundle-start',
    what: "the ios bundle-start line - the platform's label padded to the rows' column, so the words line up with Android's",
    segment: { kind: 'platform-bundle-start', platform: 'ios' },
    stream: 'stdout',
    prints: [['🍎 iOS      Bundling the JavaScript...']],
  },
  {
    kind: 'platform-bundle-built',
    what: 'the bundle prints nothing - the upload step that follows is what a person reads',
    segment: {
      kind: 'platform-bundle-built',
      bundlePath: '/tmp/out/bundle.android.js',
      bundleSizeMb: 4.29,
      bundleFormat: 'plain-js',
      bundler: 'expo',
    },
    stream: 'stdout',
    prints: [],
  },
  {
    kind: 'platform-bundle-assets',
    what: 'the asset count prints nothing either',
    segment: { kind: 'platform-bundle-assets', assetCount: 6 },
    stream: 'stdout',
    prints: [],
  },
  {
    kind: 'platform-bundle-supplied',
    what: 'the supplied-bundle step - it SAYS the JavaScript came from --bundle-dir, so a broken supply road never reads as bundling',
    segment: {
      kind: 'platform-bundle-supplied',
      platform: 'android',
      bundlePath: '/tmp/supplied/bundle.android.js',
      bundleSizeMb: 4.29,
      bundleFormat: 'plain-js',
      bundler: 'expo',
    },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✔${ESC}[39m Used your JavaScript   🤖 Android bundle.android.js, from --bundle-dir`,
      ],
    ],
  },
  {
    kind: 'platform-bundle-supplied-note',
    what: 'the supplied-bundle advisory - yellow, a bang not a cross (it is not a failure)',
    segment: {
      kind: 'platform-bundle-supplied-note',
      note: 'built beside a different native base (abc123def456)',
    },
    stream: 'stdout',
    prints: [[`${ESC}[33m! built beside a different native base (abc123def456)${ESC}[39m`]],
  },
  {
    kind: 'bundle-emit-header',
    what: "the emit header prints nothing - each platform's own step says where its JavaScript went",
    segment: { kind: 'bundle-emit-header', bundleDir: '/tmp/out' },
    stream: 'stdout',
    prints: [],
  },
  {
    kind: 'platform-bundle-emitted',
    what: 'the emitted step, naming the platform and the folder',
    segment: {
      kind: 'platform-bundle-emitted',
      platform: 'android',
      bundleDir: '/tmp/out',
      assetCount: 6,
    },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m Saved the JavaScript   🤖 Android, to /tmp/out`]],
  },
  {
    kind: 'platform-bundle-failed',
    what: "the bundling failure in init's failed-step shape, the message in red, then the help block - the run exits right after it",
    segment: { kind: 'platform-bundle-failed', message: 'metro exited with code 1' },
    stream: 'stdout',
    prints: [
      [`${ESC}[31m✖${ESC}[39m Bundling the JavaScript failed`],
      [''],
      [`${ESC}[31mmetro exited with code 1${ESC}[39m`],
      [''],
      ...HELP_BLOCK_PRINTS,
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
    kind: 'binary-uploading',
    what: "the upload as a log shows it - a step in progress, plain, with the size (a terminal shows the same words as a spinner's)",
    segment: { kind: 'binary-uploading', sizeMb: '41.2' },
    stream: 'stdout',
    prints: [['Uploading the app build (41.2 MB)...']],
  },
  {
    kind: 'binary-uploading',
    what: 'the upload naming its platform, as a log shows it',
    segment: { kind: 'binary-uploading', sizeMb: '61.4', platform: 'android' },
    stream: 'stdout',
    prints: [['🤖 Android  Uploading the app build (61.4 MB)...']],
  },
  {
    kind: 'binary-upload-retry',
    what: 'the upload retry notice - a real branch no committed fixture watches, which is exactly why it is pinned here',
    segment: { kind: 'binary-upload-retry', attempt: 1, maxRetries: 3 },
    stream: 'stdout',
    prints: [[`${ESC}[2m   Upload failed (attempt 1 of 3), trying again...${ESC}[22m`]],
  },
  {
    kind: 'test-started',
    what: "the test's row with no capture decision recorded and no platform rows - only the devices the config names",
    segment: {
      kind: 'test-started',
      buildIndex: 3,
      devices: [
        { id: 'pixel.4.xl', osVersion: '13', theme: 'light', locale: 'en_US', fontScale: '1' },
        { id: 'iphone.14', osVersion: '16.4', theme: 'light', locale: 'en_US', fontScale: '1' },
      ],
      rowsAbove: { rows: [], printedAsTheyHappened: false },
    },
    stream: 'stdout',
    prints: [[`Test 3      ${ESC}[32m✔${ESC}[39m Started: on 2 devices (Pixel 4 XL, iPhone 14)`]],
  },
  {
    kind: 'test-started',
    what: 'a print site that knows neither devices nor capture - the row ends at Started',
    segment: {
      kind: 'test-started',
      buildIndex: 1,
      rowsAbove: { rows: [], printedAsTheyHappened: false },
    },
    stream: 'stdout',
    prints: [[`Test 1      ${ESC}[32m✔${ESC}[39m Started`]],
  },
  {
    kind: 'test-started',
    what: "the platforms' rows, Android first, a blank line, the test's row, and under it the story files by title - new first, then changed, then the rest unmarked; a file one platform has says which",
    segment: {
      kind: 'test-started',
      buildIndex: 4,
      devices: [
        { id: 'pixel.4.xl', osVersion: '13', theme: 'light', locale: 'en_US', fontScale: '1' },
        { id: 'iphone.14', osVersion: '16.4', theme: 'light', locale: 'en_US', fontScale: '1' },
      ],
      capture: [
        {
          platform: 'android',
          full: true,
          capturedStories: 0,
          storiesInBundle: 7,
          storyFiles: [
            'a/Cart.stories.tsx',
            'a/Checkout.stories.tsx',
            'a/ProductCard.stories.tsx',
            'a/Maps.stories.tsx',
          ],
          newStoryFiles: ['a/Checkout.stories.tsx'],
          changedStoryFiles: ['a/ProductCard.stories.tsx'],
          storyTitles: [
            { storyFile: 'a/Cart.stories.tsx', title: 'Storefront/Cart', stories: 1 },
            { storyFile: 'a/Checkout.stories.tsx', title: 'Storefront/Checkout', stories: 2 },
            { storyFile: 'a/ProductCard.stories.tsx', title: 'Storefront/ProductCard', stories: 3 },
            { storyFile: 'a/Maps.stories.tsx', title: 'Storefront/Maps', stories: 1 },
          ],
        },
        {
          platform: 'ios',
          full: true,
          capturedStories: 0,
          storiesInBundle: 6,
          storyFiles: ['a/Cart.stories.tsx', 'a/Checkout.stories.tsx', 'a/ProductCard.stories.tsx'],
          newStoryFiles: ['a/Checkout.stories.tsx'],
          changedStoryFiles: ['a/ProductCard.stories.tsx'],
        },
      ],
      rowsAbove: {
        rows: [
          { platform: 'ios', appBuild: 'reused-from-test', testIndex: 3 },
          { platform: 'android', appBuild: 'reused-from-local-build-cache' },
        ],
        printedAsTheyHappened: false,
      },
    },
    stream: 'stdout',
    prints: [
      [`🤖 Android  ${ESC}[32m✔${ESC}[39m Reused from the local build cache`],
      [`🍎 iOS      ${ESC}[32m✔${ESC}[39m Reused from Test 3`],
      [''],
      [
        `Test 4      ${ESC}[32m✔${ESC}[39m Started: 🤖 Android all 7 stories, 🍎 iOS all 6 stories, on 2 devices (Pixel 4 XL, iPhone 14)`,
      ],
      [`              ${ESC}[32m+${ESC}[39m Storefront/Checkout ${ESC}[2m(2 stories)${ESC}[22m`],
      [`              ${ESC}[33m~${ESC}[39m Storefront/ProductCard ${ESC}[2m(3 stories)${ESC}[22m`],
      [`                Storefront/Cart ${ESC}[2m(1 story)${ESC}[22m`],
      [
        `                Storefront/Maps ${ESC}[2m(1 story)${ESC}[22m ${ESC}[2m(🤖 Android only)${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'test-started',
    what: 'a story file with no title known is named by its path; past ten files the rest are counted - and in a log only the blank line under the rows is left to print',
    segment: {
      kind: 'test-started',
      buildIndex: 14,
      capture: [
        {
          platform: 'android',
          full: false,
          capturedStories: 11,
          storyFiles: Array.from({ length: 11 }, (_, file) => `s/${file}.stories.tsx`),
        },
      ],
      rowsAbove: {
        rows: [{ platform: 'android', appBuild: 'reused-from-test', testIndex: 13 }],
        printedAsTheyHappened: true,
      },
    },
    stream: 'stdout',
    prints: [
      [''],
      [`Test 14     ${ESC}[32m✔${ESC}[39m Started: 11 stories`],
      ...Array.from({ length: 10 }, (_, file) => [`                s/${file}.stories.tsx`]),
      [`              ${ESC}[2m  and 1 more${ESC}[22m`],
    ],
  },
  {
    kind: 'test-started',
    what: 'every story captured - the one capture reason a person can act on stays, after a comma',
    segment: {
      kind: 'test-started',
      buildIndex: 1,
      devices: [
        { id: 'pixel.4.xl', osVersion: '13', theme: 'light', locale: 'en_US', fontScale: '1' },
      ],
      capture: [
        {
          platform: 'android',
          full: true,
          capturedStories: 0,
          storiesInBundle: 24,
          reason: 'no main branch is set',
        },
      ],
      rowsAbove: { rows: [], printedAsTheyHappened: false },
    },
    stream: 'stdout',
    prints: [
      [
        `Test 1      ${ESC}[32m✔${ESC}[39m Started: all 24 stories on 1 device (Pixel 4 XL), no main branch is set`,
      ],
    ],
  },
  {
    kind: 'test-started',
    what: 'both platforms capture the same part of the bundle - one count, and no reason',
    segment: {
      kind: 'test-started',
      buildIndex: 14,
      devices: [
        { id: 'pixel.4.xl', osVersion: '13', theme: 'light', locale: 'en_US', fontScale: '1' },
        { id: 'iphone.14', osVersion: '16.4', theme: 'light', locale: 'en_US', fontScale: '1' },
      ],
      capture: [
        {
          platform: 'android',
          full: false,
          capturedStories: 3,
          storiesInBundle: 24,
          reason: 'a.tsx changed',
        },
        {
          platform: 'ios',
          full: false,
          capturedStories: 3,
          storiesInBundle: 24,
          reason: 'a.tsx changed',
        },
      ],
      rowsAbove: { rows: [], printedAsTheyHappened: false },
    },
    stream: 'stdout',
    prints: [
      [
        `Test 14     ${ESC}[32m✔${ESC}[39m Started: 3 of 24 stories on 2 devices (Pixel 4 XL, iPhone 14)`,
      ],
    ],
  },
  {
    kind: 'notice',
    what: 'a warning with no learn-more link - one line, a yellow bang',
    segment: { kind: 'notice', level: 'warning', message: 'Staged uploads unavailable - reason.' },
    stream: 'stdout',
    prints: [[`${ESC}[33m! Staged uploads unavailable - reason.${ESC}[39m`]],
  },
  {
    kind: 'notice',
    what: 'a note with a learn-more link - the note as it is, the link cyan inside the dim line under it',
    segment: {
      kind: 'notice',
      level: 'info',
      message: 'Something worth knowing.',
      learnMoreLink: 'https://sherlo.io/docs',
    },
    stream: 'stdout',
    prints: [
      ['Something worth knowing.'],
      [`${ESC}[2m  Learn more: ${ESC}[36mhttps://sherlo.io/docs${ESC}[39m${ESC}[22m`],
    ],
  },
  {
    kind: 'results-url',
    what: 'the closer standing alone - the link once, labelled, a blank line under it, and no `url=` line',
    segment: {
      kind: 'results-url',
      url: 'https://app.sherlo.io/build?t=tm000001&p=7&b=1',
    },
    stream: 'stdout',
    prints: [
      [`🔗 Review: ${ESC}[36mhttps://app.sherlo.io/build?t=tm000001&p=7&b=1${ESC}[39m`],
      [''],
    ],
  },
  {
    kind: 'results-url',
    what: "the closer of a test nobody waited for - init's next-step section, the link in it, and the command that waits",
    segment: {
      kind: 'results-url',
      url: 'https://app.sherlo.io/build?t=tm000001&p=7&b=1',
      testIndex: 1,
    },
    stream: 'stdout',
    prints: [
      ...NEXT_STEP_TITLE_PRINTS,
      [`${ESC}[1mReview Test 1 when it finishes${ESC}[22m`],
      [`   🔗 Review: ${ESC}[36mhttps://app.sherlo.io/build?t=tm000001&p=7&b=1${ESC}[39m`],
      [`   To wait for the result: ${ESC}[36mnpx sherlo view 1 --wait${ESC}[39m`],
    ],
  },
  {
    kind: 'app-build-cached',
    what: "`sherlo build` finds its build already in the cache - init's own `(already done)`, alone after the name",
    segment: { kind: 'app-build-cached', platform: 'android' },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m Built the Android app  ${ESC}[2m(already done)${ESC}[22m`]],
  },
  {
    kind: 'app-build-generating',
    what: 'expo prebuild as a log shows it - a step in progress, plain',
    segment: { kind: 'app-build-generating', platform: 'android' },
    stream: 'stdout',
    prints: [['🤖 Android  Generating the native folder with expo prebuild...']],
  },
  {
    kind: 'app-build-compiling',
    what: 'the compile as a log shows it - a step in progress, plain, naming the build tool',
    segment: { kind: 'app-build-compiling', platform: 'ios' },
    stream: 'stdout',
    prints: [['🍎 iOS      Building the app with Xcode...']],
  },
  {
    kind: 'app-build-done',
    what: '`sherlo build` says how long it took and where the log is - its next step says where the app build is kept',
    segment: {
      kind: 'app-build-done',
      platform: 'ios',
      seconds: 42,
      logPath: '.sherlo/build-ios.log',
    },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✔${ESC}[39m Built the iOS app      in 42s ${ESC}[2m(log: .sherlo/build-ios.log)${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'app-build-failed',
    what: "`sherlo build`'s failed build in init's failed-step shape, the log's last lines, what to do, and the help block",
    segment: {
      kind: 'app-build-failed',
      platform: 'android',
      seconds: 72,
      lastLines: ['BUILD FAILED in 1m 12s'],
      logPath: '.sherlo/build-android.log',
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[31m✖${ESC}[39m Building the Android app failed`],
      [''],
      ['The build failed after 1m 12s. Last lines of the log:'],
      [`${ESC}[2m   | BUILD FAILED in 1m 12s${ESC}[22m`],
      [''],
      ['Full log: .sherlo/build-android.log'],
      [`Fix the build, then run ${ESC}[36mnpx sherlo build${ESC}[39m again.`],
      [
        `Can't build here? Run Sherlo on your CI instead: ${ESC}[36mhttps://sherlo.io/docs/testing${ESC}[39m`,
      ],
      [''],
      ...HELP_BLOCK_PRINTS,
    ],
  },
  {
    kind: 'test-stopped-on-failed-build',
    what: "`sherlo test` stopped on a failed build: the platforms' rows, Android first, the failed one with what changed, then the log's last lines, what to do - building on CI from the project's page - and help",
    segment: {
      kind: 'test-stopped-on-failed-build',
      rowsAbove: {
        rows: [
          {
            platform: 'ios',
            appBuild: 'build-failed',
            seconds: 30,
            logPath: '.sherlo/build-ios.log',
            why: {
              reason: 'native-changed',
              changesSince: {
                storedBuildIndex: 12,
                changes: [{ change: 'changed', file: 'ios/Podfile.lock' }],
              },
            },
          },
          { platform: 'android', appBuild: 'reused-from-test', testIndex: 12 },
        ],
        printedAsTheyHappened: false,
      },
      lastLines: ['** BUILD FAILED **'],
      project: { teamId: 'tm000001', projectIndex: 7 },
    },
    stream: 'stdout',
    prints: [
      [`🤖 Android  ${ESC}[32m✔${ESC}[39m Reused from Test 12`],
      [
        `🍎 iOS      ${ESC}[31m✖${ESC}[39m Build failed after 30s, native code changed since Test 12 ${ESC}[2m(log: .sherlo/build-ios.log)${ESC}[22m`,
      ],
      [`              ${ESC}[33m~${ESC}[39m ios/Podfile.lock`],
      [''],
      ['Last lines of the log:'],
      [`${ESC}[2m   | ** BUILD FAILED **${ESC}[22m`],
      [''],
      [
        `Nothing was uploaded and no test was started. Fix the build, then run ${ESC}[36mnpx sherlo test${ESC}[39m again.`,
      ],
      [
        `Can't build here? Run Sherlo on your CI instead: ${ESC}[36mhttps://app.sherlo.io/project?t=tm000001&p=7${ESC}[39m`,
      ],
      [''],
      ...HELP_BLOCK_PRINTS,
    ],
  },
  {
    kind: 'test-stopped-on-failed-build',
    what: 'in a log the rows already printed when they happened: only the blank line under them is left, then the details',
    segment: {
      kind: 'test-stopped-on-failed-build',
      rowsAbove: {
        rows: [
          {
            platform: 'android',
            appBuild: 'build-failed',
            seconds: 72,
            logPath: '.sherlo/build-android.log',
          },
        ],
        printedAsTheyHappened: true,
      },
      lastLines: ['BUILD FAILED in 1m 12s'],
    },
    stream: 'stdout',
    prints: [
      [''],
      ['Last lines of the log:'],
      [`${ESC}[2m   | BUILD FAILED in 1m 12s${ESC}[22m`],
      [''],
      [
        `Nothing was uploaded and no test was started. Fix the build, then run ${ESC}[36mnpx sherlo test${ESC}[39m again.`,
      ],
      [
        `Can't build here? Run Sherlo on your CI instead: ${ESC}[36mhttps://sherlo.io/docs/testing${ESC}[39m`,
      ],
      [''],
      ...HELP_BLOCK_PRINTS,
    ],
  },
  {
    kind: 'platform-row',
    what: "a platform built here: its label padded to the rows' column, the time it took, why, the log, and the native changes under it, starting where the row's words start",
    segment: {
      kind: 'platform-row',
      row: {
        platform: 'android',
        appBuild: 'built',
        seconds: 88,
        logPath: '.sherlo/build-android.log',
        why: {
          reason: 'native-changed',
          changesSince: {
            storedBuildIndex: 12,
            changes: [
              { change: 'changed', file: 'android/app/build.gradle' },
              { change: 'added', module: 'react-native-maps', version: '1.3.0' },
            ],
          },
        },
      },
    },
    stream: 'stdout',
    prints: [
      [
        `🤖 Android  ${ESC}[32m✔${ESC}[39m Built in 1m 28s, native code changed since Test 12 ${ESC}[2m(log: .sherlo/build-android.log)${ESC}[22m`,
      ],
      [`              ${ESC}[33m~${ESC}[39m android/app/build.gradle`],
      [`              ${ESC}[32m+${ESC}[39m react-native-maps 1.3.0`],
    ],
  },
  {
    kind: 'platform-row',
    what: 'a first app build gives no reason - there was nothing to reuse',
    segment: {
      kind: 'platform-row',
      row: {
        platform: 'ios',
        appBuild: 'built',
        seconds: 252,
        logPath: '.sherlo/build-ios.log',
        why: { reason: 'nothing-stored' },
      },
    },
    stream: 'stdout',
    prints: [
      [
        `🍎 iOS      ${ESC}[32m✔${ESC}[39m Built in 4m 12s ${ESC}[2m(log: .sherlo/build-ios.log)${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'platform-row',
    what: 'the app build Sherlo holds, reused, naming the test it was built in',
    segment: {
      kind: 'platform-row',
      row: { platform: 'ios', appBuild: 'reused-from-test', testIndex: 3 },
    },
    stream: 'stdout',
    prints: [[`🍎 iOS      ${ESC}[32m✔${ESC}[39m Reused from Test 3`]],
  },
  {
    kind: 'platform-row',
    what: 'an app build from the local build cache',
    segment: {
      kind: 'platform-row',
      row: { platform: 'android', appBuild: 'reused-from-local-build-cache' },
    },
    stream: 'stdout',
    prints: [[`🤖 Android  ${ESC}[32m✔${ESC}[39m Reused from the local build cache`]],
  },
  {
    kind: 'platform-row',
    what: "the other job's platform, in the split job that starts the test",
    segment: {
      kind: 'platform-row',
      row: { platform: 'android', appBuild: 'arrived-from-other-job' },
    },
    stream: 'stdout',
    prints: [[`🤖 Android  ${ESC}[32m✔${ESC}[39m Arrived from the other job`]],
  },
  {
    kind: 'platform-row',
    what: 'an EAS build `sherlo test` started',
    segment: { kind: 'platform-row', row: { platform: 'ios', appBuild: 'building-on-eas' } },
    stream: 'stdout',
    prints: [[`🍎 iOS      ${ESC}[32m✔${ESC}[39m Building on EAS`]],
  },
  {
    kind: 'platform-row',
    what: 'an EAS build that is in',
    segment: { kind: 'platform-row', row: { platform: 'android', appBuild: 'built-on-eas' } },
    stream: 'stdout',
    prints: [[`🤖 Android  ${ESC}[32m✔${ESC}[39m Built on EAS`]],
  },
  {
    kind: 'platform-row',
    what: 'the EAS build still to come, seen from the one that is in - a dim ellipsis where the tick stands',
    segment: { kind: 'platform-row', row: { platform: 'ios', appBuild: 'still-building-on-eas' } },
    stream: 'stdout',
    prints: [[`🍎 iOS      ${ESC}[2m…${ESC}[22m Still building on EAS`]],
  },
  {
    kind: 'platform-row',
    what: 'a `--platform` job whose config tests nothing on that platform - its one row',
    segment: { kind: 'platform-row', row: { platform: 'ios', appBuild: 'skipped-not-in-config' } },
    stream: 'stdout',
    prints: [[`🍎 iOS      ${ESC}[32m✔${ESC}[39m Skipped: sherlo.config.json lists no iOS device`]],
  },
  {
    kind: 'app-build-next-step',
    what: "`sherlo build`'s ending - what the kept app build is for, in init's next-step section",
    segment: { kind: 'app-build-next-step' },
    stream: 'stdout',
    prints: [
      ...NEXT_STEP_TITLE_PRINTS,
      [`${ESC}[1mTest your app${ESC}[22m`],
      [
        `   ${ESC}[36mnpx sherlo test${ESC}[39m skips building the app until native code or build settings change.`,
      ],
    ],
  },
  {
    kind: 'eas-builds-starting',
    what: 'asking Expo to start the builds, as a log shows it - a step in progress, plain',
    segment: { kind: 'eas-builds-starting', platforms: ['android', 'ios'] },
    stream: 'stdout',
    prints: [['Starting EAS builds...']],
  },
  {
    kind: 'eas-hosted-variables',
    what: "the profile's variables kept on Expo's servers - a yellow bang, three lines",
    segment: { kind: 'eas-hosted-variables', profile: 'sherlo', environment: 'preview' },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[33m! eas.json profile "sherlo" uses variables stored on Expo's servers (environment: preview).${ESC}[39m`,
      ],
      [`${ESC}[33m  A build on this machine can't read them.${ESC}[39m`],
      [`${ESC}[33m  If the app needs them, set them in sherlo.config.json "build.env".${ESC}[39m`],
    ],
  },
  {
    kind: 'run-waits-for-builds',
    what: "a split job's test, waiting for the other job's platform, under this job's platform row",
    segment: {
      kind: 'run-waits-for-builds',
      buildIndex: 1,
      waitingFor: { otherJob: 'ios' },
      rowsAbove: {
        rows: [{ platform: 'android', appBuild: 'reused-from-local-build-cache' }],
        printedAsTheyHappened: false,
      },
    },
    stream: 'stdout',
    prints: [
      [`🤖 Android  ${ESC}[32m✔${ESC}[39m Reused from the local build cache`],
      [''],
      [`Test 1      ${ESC}[32m✔${ESC}[39m Opened: starts when 🍎 iOS arrives from the other job`],
    ],
  },
  {
    kind: 'run-waits-for-builds',
    what: 'an EAS test, waiting for both of its EAS builds - the rows above name them',
    segment: {
      kind: 'run-waits-for-builds',
      buildIndex: 1,
      waitingFor: { easBuilds: ['android', 'ios'] },
      rowsAbove: {
        rows: [
          { platform: 'ios', appBuild: 'building-on-eas' },
          { platform: 'android', appBuild: 'building-on-eas' },
        ],
        printedAsTheyHappened: false,
      },
    },
    stream: 'stdout',
    prints: [
      [`🤖 Android  ${ESC}[32m✔${ESC}[39m Building on EAS`],
      [`🍎 iOS      ${ESC}[32m✔${ESC}[39m Building on EAS`],
      [''],
      [`Test 1      ${ESC}[32m✔${ESC}[39m Opened: starts when both EAS builds finish`],
    ],
  },
  {
    kind: 'run-waits-for-builds',
    what: 'an EAS test, waiting for its one EAS build, in a log that printed the row already',
    segment: {
      kind: 'run-waits-for-builds',
      buildIndex: 1,
      waitingFor: { easBuilds: ['ios'] },
      rowsAbove: {
        rows: [{ platform: 'ios', appBuild: 'building-on-eas' }],
        printedAsTheyHappened: true,
      },
    },
    stream: 'stdout',
    prints: [
      [''],
      [`Test 1      ${ESC}[32m✔${ESC}[39m Opened: starts when the EAS build finishes`],
    ],
  },
  {
    kind: 'run-waits-for-builds',
    what: 'the EAS build that delivered first: the test it was added to starts when the other one finishes',
    segment: {
      kind: 'run-waits-for-builds',
      buildIndex: 1,
      waitingFor: { easBuild: 'ios' },
      rowsAbove: {
        rows: [
          { platform: 'android', appBuild: 'built-on-eas' },
          { platform: 'ios', appBuild: 'still-building-on-eas' },
        ],
        printedAsTheyHappened: false,
      },
    },
    stream: 'stdout',
    prints: [
      [`🤖 Android  ${ESC}[32m✔${ESC}[39m Built on EAS`],
      [`🍎 iOS      ${ESC}[2m…${ESC}[22m Still building on EAS`],
      [''],
      [`Test 1      ${ESC}[32m✔${ESC}[39m Added: starts when the 🍎 iOS EAS build finishes`],
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
    what: 'the --wait as a log shows it - a step in progress, plain, saying what is waited for and for how long',
    segment: { kind: 'wait-header', timeoutMinutes: 45, testIndex: 7 },
    stream: 'stdout',
    prints: [['Waiting for Test 7 to finish (up to 45 min)...']],
  },
  {
    kind: 'wait-header',
    what: 'the --wait before the wait loop passes the number - "the test", lowercase',
    segment: { kind: 'wait-header', timeoutMinutes: 45 },
    stream: 'stdout',
    prints: [['Waiting for the test to finish (up to 45 min)...']],
  },
  {
    kind: 'wait-progress',
    what: 'the progress line for a known status: three leading spaces INSIDE the dim, and the word',
    segment: { kind: 'wait-progress', runStatus: 'inProgress' },
    stream: 'stdout',
    prints: [[`${ESC}[2m   Running${ESC}[22m`]],
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
    what: 'the test-not-found retry line',
    segment: { kind: 'wait-build-not-found' },
    stream: 'stdout',
    prints: [[`${ESC}[2m   Test not found yet, retrying...${ESC}[22m`]],
  },
  {
    kind: 'wait-auth-failed',
    what: 'the credential-refused closer, red, with the error message verbatim after the cross',
    segment: {
      kind: 'wait-auth-failed',
      message: 'Authentication failed (HTTP 401) - check your token',
    },
    stream: 'stdout',
    prints: [[`${ESC}[31m✖ Authentication failed (HTTP 401) - check your token${ESC}[39m`]],
  },
  {
    kind: 'wait-timed-out',
    what: 'the deadline closer: ONE yellow line, "minutes" spelled out where the wait abbreviates - the command that goes on waiting is the next-step section the run ends on',
    segment: { kind: 'wait-timed-out', timeoutMinutes: 45, testIndex: 7 },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[33m! Stopped waiting after 45 minutes. Test 7 may still be running in Sherlo.${ESC}[39m`,
      ],
    ],
  },
  {
    kind: 'wait-timed-out',
    what: 'the deadline closer for one minute, a real singular, before the wait loop passes the number',
    segment: { kind: 'wait-timed-out', timeoutMinutes: 1 },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[33m! Stopped waiting after 1 minute. The test may still be running in Sherlo.${ESC}[39m`,
      ],
    ],
  },
  {
    kind: 'wait-interrupted',
    what: "the Ctrl-C closer, a yellow bang like the deadline's - the tester's collapse anchors on its TEXT, never on its colour",
    segment: { kind: 'wait-interrupted' },
    stream: 'stdout',
    prints: [[`${ESC}[33m! Stopped waiting. The test keeps running in Sherlo.${ESC}[39m`]],
  },
  {
    kind: 'wait-interrupted',
    what: 'the Ctrl-C closer once the number is known',
    segment: { kind: 'wait-interrupted', testIndex: 7 },
    stream: 'stdout',
    prints: [[`${ESC}[33m! Stopped waiting. Test 7 keeps running in Sherlo.${ESC}[39m`]],
  },
  {
    kind: 'verdict-passed',
    what: "the green verdict as init's section - one blank above (the wait frames it with the other), the title, an underline one longer than the title for the wide emoji, and nothing under it: the title says it all",
    segment: { kind: 'verdict-passed' },
    stream: 'stdout',
    prints: [
      [''],
      [`${ESC}[1m✅ All stories passed${ESC}[22m`],
      [`${ESC}[2m═════════════════════${ESC}[22m`],
    ],
  },
  {
    kind: 'test-finished',
    what: "`sherlo test --wait`'s own finished step, under the test's row with its label column blank, saying how long the test ran",
    segment: { kind: 'test-finished', testIndex: 14, seconds: 185 },
    stream: 'stdout',
    prints: [[`            ${ESC}[32m✔${ESC}[39m Finished in 3m 5s`]],
  },
  {
    kind: 'test-finished',
    what: "`sherlo view --wait`'s finished step, which did not see the test start: it names the test",
    segment: { kind: 'test-finished', testIndex: 8 },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m Finished Test 8`]],
  },
  {
    kind: 'verdict-server-bypassed',
    what: "the server-bypassed verdict as the test's row, finished, under the platforms' rows - nothing to test, and the server's own reason after the colon",
    segment: {
      kind: 'verdict-server-bypassed',
      reason: 'no change on this branch reaches any story',
      testIndex: 13,
      rowsAbove: {
        rows: [{ platform: 'android', appBuild: 'reused-from-test', testIndex: 12 }],
        printedAsTheyHappened: false,
      },
    },
    stream: 'stdout',
    prints: [
      [`🤖 Android  ${ESC}[32m✔${ESC}[39m Reused from Test 12`],
      [''],
      [
        `Test 13     ${ESC}[32m✔${ESC}[39m Finished: nothing to test: no change on this branch reaches any story`,
      ],
    ],
  },
  {
    kind: 'verdict-review-required',
    what: 'the review verdict of a build whose screens the wait never learned - the reported ones counted, then what to do',
    segment: { kind: 'verdict-review-required', counts: { unreviewed: 2, reported: 1 } },
    stream: 'stdout',
    prints: [
      [''],
      [`${ESC}[1m⚠️ 3 stories need review${ESC}[22m`],
      [`${ESC}[2m════════════════════════${ESC}[22m`],
      [''],
      ['1 story reported'],
      ['Open them in Sherlo to approve or report.'],
    ],
  },
  {
    kind: 'verdict-review-required',
    what: 'the same verdict over a build whose screens the wait DID learn - one row per screen that needs a person, its word in one column, then the rest in ONE dim line',
    segment: {
      kind: 'verdict-review-required',
      screens: [
        { name: 'Storefront - ProductCard', status: 'changed' },
        { name: 'Storefront - Checkout', status: 'rejected' },
        { name: 'Storefront - Banner', status: 'error' },
        { name: 'Storefront - Footer', status: 'unchanged' },
      ],
      counts: { unreviewed: 1, reported: 1 },
    },
    stream: 'stdout',
    prints: [
      [''],
      [`${ESC}[1m⚠️ 3 stories need review${ESC}[22m`],
      [`${ESC}[2m════════════════════════${ESC}[22m`],
      [''],
      ['Storefront - ProductCard   changed'],
      ['Storefront - Checkout      reported'],
      ['Storefront - Banner        failed'],
      [`${ESC}[2m1 other story has no changes.${ESC}[22m`],
    ],
  },
  {
    kind: 'verdict-run-errored',
    what: "the infrastructure closer as init's failed step, the server's error blob stringified rather than phrased, then the help block",
    segment: {
      kind: 'verdict-run-errored',
      runStatus: 'error',
      runError: { code: 'RUNNER_CRASH' },
      testIndex: 14,
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[31m✖${ESC}[39m Running Test 14 failed`],
      [''],
      ['Test 14 ended as "error".'],
      [`${ESC}[2mError: {"code":"RUNNER_CRASH"}${ESC}[22m`],
      [''],
      ...HELP_BLOCK_PRINTS,
    ],
  },

  /* ⚠⚠ DEPICTS FUTURE. Pinned exactly like the rest, because a drawing whose
   * bytes can drift silently is worse than no drawing: these are the bytes a
   * product design is approved from. */

  {
    kind: 'verdict-no-changes',
    what: "⚠⚠ DEPICTS FUTURE: the sparse green, in the GitHub check's own words (CHECK_COPY.noChanges title + summary)",
    segment: { kind: 'verdict-no-changes' },
    stream: 'stdout',
    prints: [
      [''],
      [`${ESC}[1m✅ No visual changes${ESC}[22m`],
      [`${ESC}[2m════════════════════${ESC}[22m`],
      [''],
      ['All snapshots match their baselines.'],
    ],
  },
  {
    kind: 'verdict-capture-accounting',
    what: '⚠⚠ DEPICTS FUTURE: the sparse accounting line - what this branch photographed, and what it carried over',
    segment: { kind: 'verdict-capture-accounting', captured: 3, inherited: 41 },
    stream: 'stdout',
    prints: [[`${ESC}[2m3 captured on this branch, 41 carried over unchanged.${ESC}[22m`]],
  },
  {
    kind: 'verdict-nothing-recorded',
    what: '⚠⚠ DEPICTS FUTURE: the guard case - an all-zero tally over an all-zero suite, which is evidence of nothing and is deliberately NOT green',
    segment: { kind: 'verdict-nothing-recorded', testIndex: 16 },
    stream: 'stdout',
    prints: [
      [''],
      [`${ESC}[1m⚠️ Nothing was recorded${ESC}[22m`],
      [`${ESC}[2m═══════════════════════${ESC}[22m`],
      [''],
      ['The test captured no stories and carried none over, so it does not show that nothing'],
      ['changed. Open Test 16 in Sherlo to check.'],
    ],
  },

  /* -------------------- the build view (F5) -------------------- */

  {
    kind: 'build-view-header',
    what: "`sherlo view`'s first line - only the test is coloured, the run status is said in plain words, and the separator is a middle dot with a space either side",
    segment: { kind: 'build-view-header', buildIndex: 7, runStatus: 'inProgress' },
    stream: 'stdout',
    prints: [[`${ESC}[32mTest 7${ESC}[39m · running`]],
  },
  {
    kind: 'build-view-tally',
    what: "the review tally - dim, each count before its plain name, in a fixed order that is NOT the wire's alphabetical one",
    segment: {
      kind: 'build-view-tally',
      counts: { approved: 5, noChanges: 39, reported: 0, unreviewed: 0 },
    },
    stream: 'stdout',
    prints: [[`${ESC}[2m5 approved · 0 reported · 0 unreviewed · 39 no changes${ESC}[22m`]],
  },
  {
    kind: 'build-view-status',
    what: "a finished test with no changes - the verdict section `--wait` ends with, the check's own words",
    segment: { kind: 'build-view-status', runStatus: 'finished', status: 'noChanges' },
    stream: 'stdout',
    prints: [
      [''],
      [`${ESC}[1m✅ No visual changes${ESC}[22m`],
      [`${ESC}[2m════════════════════${ESC}[22m`],
      [''],
      ['All snapshots match their baselines.'],
    ],
  },
  {
    kind: 'build-view-status',
    what: 'a finished test that needs review - the same section `--wait` ends with, counted off the tally',
    segment: {
      kind: 'build-view-status',
      runStatus: 'finished',
      status: 'unreviewed',
      counts: { approved: 0, noChanges: 41, reported: 0, unreviewed: 3 },
    },
    stream: 'stdout',
    prints: [
      [''],
      [`${ESC}[1m⚠️ 3 stories need review${ESC}[22m`],
      [`${ESC}[2m════════════════════════${ESC}[22m`],
      [''],
      ['Open them in Sherlo to approve or report.'],
    ],
  },
  {
    kind: 'build-view-status',
    what: 'a test still running - the review status the wire sent is DELIBERATELY not read, because the server computes it whatever the run is doing; the view ends on the next step instead (`results-url` with its test)',
    segment: { kind: 'build-view-status', runStatus: 'inProgress', status: 'unreviewed' },
    stream: 'stdout',
    prints: [],
  },
  {
    kind: 'build-view-status',
    what: 'a finished test whose review status the API did not send - ZERO print calls, which is how this layer says nothing and is not the same as a blank line',
    segment: { kind: 'build-view-status', runStatus: 'finished' },
    stream: 'stdout',
    prints: [],
  },
  {
    kind: 'build-view-json',
    what: "`sherlo view --json`'s whole output - pretty-printed JSON, NO colour, as ONE print call so a pipe gets exactly `JSON.parse`-able bytes",
    segment: {
      kind: 'build-view-json',
      json: { runStatus: 'error', buildIndex: 7 },
    },
    stream: 'stdout',
    prints: [['{\n  "runStatus": "error",\n  "buildIndex": 7\n}']],
  },
  {
    kind: 'build-view-stories-table',
    what: 'the per-story table - NO colour, three columns padded to the widest cell present, one row per story',
    segment: {
      kind: 'build-view-stories-table',
      stories: [
        { name: 'Sanity/Hello - Basic', status: 'unchanged', baseline: { buildIndex: 1 } },
        {
          name: 'Typography - Scales',
          status: 'review-required',
          baseline: null,
          reason: 'two-baselines',
          candidates: [{ buildIndex: 2 }, { buildIndex: 4 }],
        },
      ],
    },
    stream: 'stdout',
    prints: [
      ['STORY                 STATUS        BASELINE'],
      ['Sanity/Hello - Basic  no changes    Test 1'],
      ['Typography - Scales   needs review  two baselines (Test 2, Test 4)'],
    ],
  },

  /* -------------------- project create -------------------- */

  {
    kind: 'team-created',
    what: 'everything `sherlo team create` prints - two key=value facts a script can hand to `project create --team`, and no credential, because a team carries none',
    segment: {
      kind: 'team-created',
      team: { name: 'Design Guild', id: 'team_9f3a2c' },
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m  Created team ${ESC}[1mDesign Guild${ESC}[22m`],
      [''],
      ['teamId=team_9f3a2c'],
      ['teamName=Design Guild'],
      [''],
      [
        `${ESC}[2mNext: invite members from the web app, or create its first project with \`npx sherlo project create --name <name> --team <id>\`.${ESC}[22m`,
      ],
      [''],
    ],
  },

  {
    kind: 'team-list',
    what: 'everything `sherlo team list` prints - id first because it is what --team takes everywhere, counts and role dimmed as context, no teams an answer rather than an error',
    segment: {
      kind: 'team-list',
      list: {
        teams: [
          { id: 'team_br4nch', name: 'Branching Team', projectCount: 3, role: 'owner' },
          { id: 'team_9f3a2c', name: 'Design Guild', projectCount: 0, role: 'member' },
        ],
      },
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m  2 teams`],
      [``],
      [`  team_br4nch  Branching Team  ${ESC}[2m3 projects${ESC}[22m  ${ESC}[2mowner${ESC}[22m`],
      [
        `  team_9f3a2c  Design Guild    ${ESC}[2mno projects yet${ESC}[22m  ${ESC}[2mmember${ESC}[22m`,
      ],
      [``],
      [
        `${ESC}[2mNext: \`npx sherlo project list --team <id>\` shows a team's projects; \`npx sherlo team create --name <name>\` adds a team.${ESC}[22m`,
      ],
      [``],
    ],
  },

  {
    kind: 'project-list',
    what: 'everything `sherlo project list` prints - index first because it is what every other command takes, counts and branch dimmed because they are context, and an empty team is an answer rather than an error',
    segment: {
      kind: 'project-list',
      list: {
        team: { name: 'Branching Team', id: 'team_br4nch' },
        projects: [
          { index: 1, name: 'Mobile App', buildCount: 128, mainBranch: 'main' },
          { index: 2, name: 'Design System', buildCount: 0, mainBranch: null },
        ],
      },
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m  2 projects in team ${ESC}[1mBranching Team${ESC}[22m`],
      [''],
      [`  1  Mobile App     ${ESC}[2m128 builds${ESC}[22m  ${ESC}[2mmain${ESC}[22m`],
      [`  2  Design System  ${ESC}[2mno builds yet${ESC}[22m`],
      [''],
      [
        `${ESC}[2mNext: \`npx sherlo project create --name <name> --team <id>\` adds one; \`npx sherlo view <build>\` opens a build.${ESC}[22m`,
      ],
      [''],
    ],
  },

  {
    kind: 'opened-story',
    what: 'what `sherlo open` prints when the app reports the story on screen - the story id bold, because the id is the answer and everything else is a sentence around it',
    segment: {
      kind: 'opened-story',
      state: { kind: 'opened', storyId: 'foundation-typography--scales', waited: true },
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m  ${ESC}[1mfoundation-typography--scales${ESC}[22m is on screen`],
      [''],
      [`${ESC}[2mNext: \`npx sherlo capture\` records it the way a test run would.${ESC}[22m`],
      [''],
    ],
  },

  {
    kind: 'opened-story',
    what: 'the refusal that earns its keep - a mistyped story id, answered with the ids the app really has and a count of the rest, because a refusal that listed hundreds would have told the reader nothing',
    segment: {
      kind: 'opened-story',
      state: {
        kind: 'no-such-story',
        storyId: 'foundation-typografy--scales',
        known: [
          'foundation-typography--scales',
          'foundation-colour--palette',
          'controls-button--primary',
          'controls-button--disabled',
          'controls-input--empty',
        ],
      },
    },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[31m✖${ESC}[39m  No story ${ESC}[1mfoundation-typografy--scales${ESC}[22m in this app`,
      ],
      [''],
      [`${ESC}[2mThis app has:${ESC}[22m`],
      ['  foundation-typography--scales'],
      ['  foundation-colour--palette'],
      ['  controls-button--primary'],
      ['  controls-button--disabled'],
      [`${ESC}[2m  ... and 1 more${ESC}[22m`],
      [''],
    ],
  },

  {
    kind: 'captured-story',
    what: 'what `sherlo capture` prints for a story that fits one screen - the green head, the settled line, the named tree, and the view count',
    segment: {
      kind: 'captured-story',
      state: {
        kind: 'captured',
        storyId: 'foundation-typography--scales',
        settledMs: 1400,
        frames: 6,
        tree: {
          primitive: 'ScrollView',
          components: ['TypographyScales'],
          children: [
            {
              primitive: 'Text',
              components: ['SectionTitle'],
              text: 'FONT SIZES',
              children: [],
            },
            {
              primitive: 'Text',
              components: ['SampleLine'],
              text: '10px - The quick brown fox',
              children: [],
            },
          ],
        },
      },
    },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✔${ESC}[39m  ${ESC}[1mfoundation-typography--scales${ESC}[22m captured, the way a test run records it`,
      ],
      [`${ESC}[2m   settled in 1.4s over 6 frames · testing mode${ESC}[22m`],
      [''],
      [`   ${ESC}[93m<${ESC}[39m${ESC}[95mTypographyScales${ESC}[39m${ESC}[93m>${ESC}[39m`],
      [`     ${ESC}[93m<${ESC}[39m${ESC}[36mScrollView${ESC}[39m${ESC}[93m>${ESC}[39m`],
      [`       ${ESC}[93m<${ESC}[39m${ESC}[95mSectionTitle${ESC}[39m${ESC}[93m>${ESC}[39m`],
      [`         ${ESC}[93m<${ESC}[39m${ESC}[36mText${ESC}[39m${ESC}[93m>${ESC}[39m`],
      ['           FONT SIZES'],
      [`         ${ESC}[93m</${ESC}[39m${ESC}[36mText${ESC}[39m${ESC}[93m>${ESC}[39m`],
      [`       ${ESC}[93m</${ESC}[39m${ESC}[95mSectionTitle${ESC}[39m${ESC}[93m>${ESC}[39m`],
      [`       ${ESC}[93m<${ESC}[39m${ESC}[95mSampleLine${ESC}[39m${ESC}[93m>${ESC}[39m`],
      [`         ${ESC}[93m<${ESC}[39m${ESC}[36mText${ESC}[39m${ESC}[93m>${ESC}[39m`],
      ['           10px - The quick brown fox'],
      [`         ${ESC}[93m</${ESC}[39m${ESC}[36mText${ESC}[39m${ESC}[93m>${ESC}[39m`],
      [`       ${ESC}[93m</${ESC}[39m${ESC}[95mSampleLine${ESC}[39m${ESC}[93m>${ESC}[39m`],
      [`     ${ESC}[93m</${ESC}[39m${ESC}[36mScrollView${ESC}[39m${ESC}[93m>${ESC}[39m`],
      [`   ${ESC}[93m</${ESC}[39m${ESC}[95mTypographyScales${ESC}[39m${ESC}[93m>${ESC}[39m`],
      [''],
      [`${ESC}[2m   3 views · --json prints the record${ESC}[22m`],
      [''],
    ],
  },

  {
    kind: 'captured-log',
    what: '`sherlo capture --logs` with lines the app pushed - the dim count line, then each line verbatim, indented',
    segment: {
      kind: 'captured-log',
      logs: ['12:34:56: storybook style : {"style":"dark"}'],
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[2mThe app's own log - 1 line recorded during this capture:${ESC}[22m`],
      ['  12:34:56: storybook style : {"style":"dark"}'],
      [''],
    ],
  },

  {
    kind: 'captured-log',
    what: '`sherlo capture --logs` with an empty feed - a plain dim sentence, not a zero',
    segment: { kind: 'captured-log', logs: [] },
    stream: 'stdout',
    prints: [[`${ESC}[2mThe app logged nothing during this capture.${ESC}[22m`], ['']],
  },

  {
    kind: 'project-created',
    what: 'everything `sherlo project create` prints - no token comes with a new project, so it names the project page where a CI token is made',
    segment: {
      kind: 'project-created',
      project: {
        name: 'Design System',
        index: 12,
        projectPageUrl: 'https://app.sherlo.io/project?t=team1234&p=12',
      },
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m  Created project ${ESC}[1mDesign System${ESC}[22m`],
      [''],
      ['projectIndex=12'],
      ['projectName=Design System'],
      [''],
      [
        `For CI, create a CI token in the Sherlo web app and save it as the ${ESC}[1mSHERLO_TOKEN${ESC}[22m secret:`,
      ],
      [`  ${ESC}[36mhttps://app.sherlo.io/project?t=team1234&p=12${ESC}[39m`],
      [''],
    ],
  },

  /* ------------------------------ logging in ------------------------------ */

  {
    kind: 'login-link',
    what: 'the authorize link, alone on its own line, printed before the browser is asked to open it',
    segment: { kind: 'login-link', authorizeUrl: 'https://app.sherlo.io/cli-login/lg7Qm2Xa' },
    stream: 'stdout',
    prints: [
      [`Opening your browser to log in to Sherlo...`],
      [`${ESC}[2mIf it doesn't open, use this link on any device:${ESC}[22m`],
      [``],
      [`  ${ESC}[36mhttps://app.sherlo.io/cli-login/lg7Qm2Xa${ESC}[39m`],
      [``],
    ],
  },
  {
    kind: 'login-waiting',
    what: 'the wait off a terminal - one plain line that stays',
    segment: { kind: 'login-waiting' },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[33m⏳${ESC}[39m Waiting for you to click Authorize... ${ESC}[2m(Ctrl+C to stop)${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'logged-in',
    what: 'the login is saved: the email of the person who authorized it, and never the token',
    segment: { kind: 'logged-in', email: 'anna@example.com' },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m  Logged in as ${ESC}[1manna@example.com${ESC}[22m`],
      [``],
      [
        `${ESC}[2mNext: run \`npx sherlo init\` in your React Native app to set up Sherlo.${ESC}[22m`,
      ],
      [``],
    ],
  },
  {
    kind: 'already-logged-in',
    what: 'a saved login the service still accepts - no new login is started',
    segment: { kind: 'already-logged-in', email: 'anna@example.com' },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m  Already logged in as ${ESC}[1manna@example.com${ESC}[22m`],
      [``],
      [`${ESC}[2mRun \`npx sherlo logout\` to log out.${ESC}[22m`],
      [``],
    ],
  },
  {
    kind: 'logged-out',
    what: 'the login is ended on the service and deleted from this computer',
    segment: { kind: 'logged-out', email: 'anna@example.com' },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m  Logged out ${ESC}[1manna@example.com${ESC}[22m`], [``]],
  },
  {
    kind: 'not-logged-in',
    what: 'a logout with no saved login - an answer, not an error',
    segment: { kind: 'not-logged-in' },
    stream: 'stdout',
    prints: [
      [`${ESC}[33m◦${ESC}[39m  Not logged in`],
      [``],
      [`${ESC}[2mRun \`npx sherlo login\` to log in.${ESC}[22m`],
      [``],
    ],
  },
  {
    kind: 'feedback-sent',
    what: 'a stored report: its reference in bold, then what was sent with it',
    segment: {
      kind: 'feedback-sent',
      reference: 'FB-7K2Q',
      lastCommand: { command: 'test', exitCode: 1 },
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m  Feedback sent - thank you! Reference: ${ESC}[1mFB-7K2Q${ESC}[22m`],
      [``],
      [`Sent with it:`],
      [`${ESC}[2m  ➜${ESC}[22m The last Sherlo command: npx sherlo test, exit 1`],
      [`${ESC}[2m  ➜${ESC}[22m The Sherlo, React Native, Expo and Storybook versions`],
      [`${ESC}[2m  ➜${ESC}[22m The package manager and the operating system`],
      [`${ESC}[2m  ➜${ESC}[22m The project and its devices`],
      [`${ESC}[2mNo token is sent, and no app code beyond what your report quotes.${ESC}[22m`],
      [``],
    ],
  },
  {
    kind: 'feedback-dry-run',
    what: 'a dry run: the report indented, then what would be sent with it',
    segment: {
      kind: 'feedback-dry-run',
      reportKind: 'bug',
      report: '## Steps\nran it',
      context: {
        cliVersion: '1.0.0',
        reactNativeVersion: '0.79.2',
        packageManager: 'npm',
        operatingSystem: 'Darwin 25.5.0',
        lastCommand: { command: 'test', exitCode: 1, errorLines: ['boom'] },
      },
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[33m◦${ESC}[39m  Dry run - nothing was sent. This bug report is what would be sent:`],
      [``],
      [`  ## Steps`],
      [`  ran it`],
      [``],
      [`Sent with it, tokens and keys blanked out:`],
      [`  Project: not known`],
      [`  Devices: not known`],
      [`  Sherlo SDK: not known`],
      [`  Sherlo CLI: 1.0.0`],
      [`  React Native: 0.79.2`],
      [`  Expo: not known`],
      [`  Storybook: not known`],
      [`  Package manager: npm`],
      [`  Operating system: Darwin 25.5.0`],
      [`  AI agent: none`],
      [`  Last command: npx sherlo test, exit 1`],
      [`${ESC}[2m      boom${ESC}[22m`],
      [``],
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

describe('A MANAGEMENT COMMAND PRINTS ITS FACTS AS KEY=VALUE LINES AND NEVER A CREDENTIAL', () => {
  it.each(PINS.map((pin) => [pin.what, pin] as const))('%s', (_what, pin) => {
    pinnedBytes(pin, renderSegment(pin.segment));
  });

  /**
   * WRITTEN OUT RATHER THAN ADDED TO THE TABLE ABOVE. `it.each` assembles its case titles from
   * each pin's `what`, so no case name in this family exists as a searchable sentence in the
   * source. This screen's does, because it is the one a developer meets at the worst moment - the
   * story they asked to see is broken - and a case whose name can only be read by running it is a
   * case that can be renamed without anybody noticing.
   *
   * The pin itself is the same instrument: the exact bytes, compared through `pinnedBytes`.
   */
  it('the broken-story screen names the story and the error it recorded', () => {
    // The story id bold because it is the answer, and the error on a line of its own in the words
    // the story itself threw - a paraphrase would send the developer looking for a line their app
    // never printed.
    const pin: Pin = {
      kind: 'opened-story',
      what: 'the broken-story screen',
      segment: {
        kind: 'opened-story',
        state: {
          kind: 'painted-and-threw',
          storyId: 'foundation-typography--scales',
          threw: { name: 'TypeError', message: "Cannot read property 'label' of undefined" },
        },
      },
      stream: 'stdout',
      prints: [
        [
          `${ESC}[31m✖${ESC}[39m  ${ESC}[1mfoundation-typography--scales${ESC}[22m is on screen, and it threw while rendering`,
        ],
        [''],
        [`  TypeError: Cannot read property 'label' of undefined`],
        [''],
        [`${ESC}[2mThe app is showing that error in place of the story.${ESC}[22m`],
        [''],
      ],
    };

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

  // The header this example was taken from no longer prints (the dry run opens with `Testing your app...` like every test), so the example stays a worked one, and
  // the pins above are what compare against the shipped renderer.
});

/* ========================================================================== */
/* The sink: the bytes a segment becomes once it leaves the renderer          */
/* ========================================================================== */

describe('the sink concatenates segments without editing them', () => {
  it('one newline per print call, the rendered bytes verbatim, stderr kept apart', async () => {
    const error = new Error('not a git repository');

    const captured = await captureTranscript(async () => {
      emit({ kind: 'command-intro', command: 'test' });
      emit({ kind: 'platform-bundle-assets', assetCount: 6 });
      emit({ kind: 'platform-bundle-start', platform: 'android' });
      emit({ kind: 'git-info-unavailable', error });
    });

    const expected = 'Testing your app...\n\n🤖 Android  Bundling the JavaScript...\n';
    expect(
      captured.stdout,
      mismatch(
        'the buffered stdout transcript',
        'helpers/transcriptSink.ts',
        expected,
        captured.stdout
      )
    ).toBe(expected);

    expect(
      captured.stderr.startsWith(`${GIT_INFO_UNAVAILABLE_BYTES} Error: not a git repository`),
      "the warn must keep its two arguments space-joined by node's own formatter, not by this layer"
    ).toBe(true);
    expect(captured.stderr.endsWith('\n')).toBe(true);
  });
});
