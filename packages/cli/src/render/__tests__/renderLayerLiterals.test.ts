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

describe('THE CLOSER PRINTS THE ADDRESS ONCE, ON THE LINE WITH THE EMOJI, WHOEVER IS READING', () => {
  const url = 'https://app.sherlo.io/build?t=tm000001&p=7&b=1';

  it('the link is printed once and nothing else - no url= line, under CI or not', () => {
    // Operator ruling 2026-09-15: the same address twice on a screen was the defect. `CI` is set
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
    kind: 'dry-run-bundling-header',
    what: 'the dry run opens like every test, so its bundling has no header of its own - zero print calls',
    segment: { kind: 'dry-run-bundling-header' },
    stream: 'stdout',
    prints: [],
  },
  {
    kind: 'command-intro',
    what: "the line under the logo saying what the command is doing, then init's blank line",
    segment: { kind: 'command-intro', command: 'test' },
    stream: 'stdout',
    prints: [['Testing your app...'], ['']],
  },
  {
    kind: 'platform-bundle-start',
    what: 'the android bundle-start line - a step still running, dim, printed once (a spinner is build work)',
    segment: { kind: 'platform-bundle-start', platform: 'android' },
    stream: 'stdout',
    prints: [[`${ESC}[2mBundling the JavaScript for 🤖 Android...${ESC}[22m`]],
  },
  {
    kind: 'platform-bundle-start',
    what: 'the ios bundle-start line (the apple emoji, and the platform as the product spells it)',
    segment: { kind: 'platform-bundle-start', platform: 'ios' },
    stream: 'stdout',
    prints: [[`${ESC}[2mBundling the JavaScript for 🍎 iOS...${ESC}[22m`]],
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
  {
    kind: 'dry-run-capture-plan',
    what: 'the whole capture plan and its closer - one step per platform when they differ, the stories under a partial one, and the dry-run line',
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
        `${ESC}[32m✔${ESC}[39m Previewed the capture  🤖 Android - 1 of 12 stories: 1 file changed - a.tsx\n` +
          `${ESC}[2m   Storefront/ProductCard${ESC}[22m\n` +
          `${ESC}[32m✔${ESC}[39m Previewed the capture  🍎 iOS - all stories: couldn't work out what changed, so all are captured to be safe\n` +
          `\n` +
          `This was a dry run: nothing was uploaded and no test was started.`,
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
    what: "the run header for two devices - init's step line, the plural noun, and the devices by the names the web app shows",
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
      [`${ESC}[32m✔${ESC}[39m Set up Test 3          on 2 devices (Pixel 4 XL, iPhone 14)`],
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
    prints: [[`${ESC}[32m✔${ESC}[39m Set up Test 1          on 1 device (Pixel 4 XL)`]],
  },
  {
    kind: 'binary-platform-label',
    what: "the binary-block label prints nothing - the upload's own step says it",
    segment: { kind: 'binary-platform-label', platform: 'android' },
    stream: 'stdout',
    prints: [],
  },
  {
    kind: 'binary-uploading',
    what: 'the uploading line - a step still running, dim, with the size',
    segment: { kind: 'binary-uploading', sizeMb: '41.2' },
    stream: 'stdout',
    prints: [[`${ESC}[2mUploading the app build (41.2 MB)...${ESC}[22m`]],
  },
  {
    kind: 'binary-uploaded',
    what: "the upload step, a name with nothing after it - init's step line trimmed at its name",
    segment: { kind: 'binary-uploaded' },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m Uploaded app build`]],
  },
  {
    kind: 'binary-upload-retry',
    what: 'the upload retry notice - a real branch no committed fixture watches, which is exactly why it is pinned here',
    segment: { kind: 'binary-upload-retry', attempt: 1, maxRetries: 3 },
    stream: 'stdout',
    prints: [[`${ESC}[2m   Upload failed (attempt 1 of 3), trying again...${ESC}[22m`]],
  },
  {
    kind: 'binary-reused',
    what: "the reuse step - init's step line, with `(reused)` dimmed the way init dims `(already done)`",
    segment: { kind: 'binary-reused', buildIndex: 1, timeAgo: '7 minutes ago' },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✔${ESC}[39m Uploaded app build     the same as Test 1's, 7 minutes ago ${ESC}[2m(reused)${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'javascript-uploaded',
    what: 'one upload step for every bundle the run sent, each platform with its emoji and size',
    segment: { kind: 'javascript-uploaded', bundleSizesMb: { android: 4.29, ios: 4.31 } },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m Uploaded JavaScript    🤖 Android 4.29 MB, 🍎 iOS 4.31 MB`]],
  },
  {
    kind: 'test-started',
    what: 'the step that started the test, on the devices the config names',
    segment: {
      kind: 'test-started',
      buildIndex: 3,
      devices: [
        { id: 'pixel.4.xl', osVersion: '13', theme: 'light', locale: 'en_US', fontScale: '1' },
        { id: 'iphone.14', osVersion: '16.4', theme: 'light', locale: 'en_US', fontScale: '1' },
      ],
    },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m Started Test 3         on 2 devices (Pixel 4 XL, iPhone 14)`]],
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
    kind: 'results-url',
    what: 'the closer standing alone - the link once, labelled, a blank line under it, and no `url=` line',
    segment: {
      kind: 'results-url',
      url: 'https://app.sherlo.io/build?t=tm000001&p=7&b=1',
    },
    stream: 'stdout',
    prints: [[`🔗 Review: ${ESC}[36mhttps://app.sherlo.io/build?t=tm000001&p=7&b=1${ESC}[39m`], ['']],
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
      [`   To wait for it here: ${ESC}[36mnpx sherlo view 1 --wait${ESC}[39m`],
    ],
  },
  {
    kind: 'app-build-stored-reused',
    what: 'the stored app build taken again - one of the three sources, said apart from the other two',
    segment: { kind: 'app-build-stored-reused', platform: 'ios', storedBuildIndex: 12 },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✔${ESC}[39m Built the iOS app      stored from Test 12, only JavaScript changed since ${ESC}[2m(reused)${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'app-build-cached',
    what: 'the app build from the local build cache, with why this run needed a new one',
    segment: { kind: 'app-build-cached', platform: 'android', why: { reason: 'nothing-stored' } },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✔${ESC}[39m Built the Android app  kept in the local build cache, none stored by Sherlo yet ${ESC}[2m(reused)${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'app-build-generating',
    what: 'expo prebuild, a step still running',
    segment: { kind: 'app-build-generating', platform: 'android' },
    stream: 'stdout',
    prints: [[`${ESC}[2mGenerating the android folder with expo prebuild...${ESC}[22m`]],
  },
  {
    kind: 'app-build-compiling',
    what: 'the compile, a step still running, naming the build tool',
    segment: { kind: 'app-build-compiling', platform: 'ios' },
    stream: 'stdout',
    prints: [[`${ESC}[2mBuilding the iOS app with Xcode...${ESC}[22m`]],
  },
  {
    kind: 'app-build-done',
    what: 'an app build made here, with the time it took, why, the log, and the native changes under it',
    segment: {
      kind: 'app-build-done',
      platform: 'android',
      seconds: 88,
      logPath: '.sherlo/build-android.log',
      command: 'test',
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
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✔${ESC}[39m Built the Android app  in 1m 28s, native code changed since Test 12's app build ${ESC}[2m(log: .sherlo/build-android.log)${ESC}[22m`,
      ],
      [`   ${ESC}[33m~${ESC}[39m android/app/build.gradle`],
      [`   ${ESC}[32m+${ESC}[39m react-native-maps 1.3.0`],
    ],
  },
  {
    kind: 'app-build-done',
    what: '`sherlo build` says where it kept the app build instead of why it built one',
    segment: {
      kind: 'app-build-done',
      platform: 'ios',
      seconds: 42,
      logPath: '.sherlo/build-ios.log',
      command: 'build',
    },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✔${ESC}[39m Built the iOS app      in 42s, kept in the local build cache ${ESC}[2m(log: .sherlo/build-ios.log)${ESC}[22m`,
      ],
    ],
  },
  {
    kind: 'app-build-failed',
    what: "the failed build in init's failed-step shape, the log's last lines, what to do, and the help block",
    segment: {
      kind: 'app-build-failed',
      platform: 'android',
      seconds: 72,
      lastLines: ['BUILD FAILED in 1m 12s'],
      logPath: '.sherlo/build-android.log',
      command: 'test',
      why: { reason: 'nothing-stored' },
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[31m✖${ESC}[39m Building the Android app failed`],
      [''],
      ['The build failed after 1m 12s. Last lines of the log:'],
      [`${ESC}[2m   | BUILD FAILED in 1m 12s${ESC}[22m`],
      [''],
      ['Full log: .sherlo/build-android.log'],
      [
        `Nothing was uploaded and no test was started. Fix the build, then run ${ESC}[36mnpx sherlo test${ESC}[39m again.`,
      ],
      [''],
      ...HELP_BLOCK_PRINTS,
    ],
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
        `   ${ESC}[36mnpx sherlo test${ESC}[39m takes this app build from the local build cache instead of building,`,
      ],
      ['   until native code or build settings change.'],
    ],
  },
  {
    kind: 'eas-build-queued',
    what: 'one EAS build started, its platform and profile',
    segment: { kind: 'eas-build-queued', platform: 'android', profile: 'sherlo' },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m Started an EAS build   🤖 Android, profile "sherlo"`]],
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
    what: "a split job's run, waiting for the other job's platform",
    segment: {
      kind: 'run-waits-for-builds',
      buildIndex: 1,
      waitingFor: { otherJob: 'ios', ciRunId: '123' },
    },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[32m✔${ESC}[39m Opened Test 1          it starts when 🍎 iOS arrives from the other job (CI run 123)`,
      ],
    ],
  },
  {
    kind: 'run-waits-for-builds',
    what: 'an EAS run, waiting for its EAS builds',
    segment: { kind: 'run-waits-for-builds', buildIndex: 1, waitingFor: { easBuilds: true } },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m Opened Test 1          it starts when the EAS builds are uploaded`]],
  },
  {
    kind: 'run-waits-for-builds',
    what: 'the EAS build that delivered first: it joined the run, which waits for the other',
    segment: { kind: 'run-waits-for-builds', buildIndex: 1, waitingFor: { easBuild: 'ios' } },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m Added to Test 1        it starts when the 🍎 iOS EAS build is uploaded`],
    ],
  },
  {
    kind: 'run-starting',
    what: "this job's app build was the last one the run waited for",
    segment: { kind: 'run-starting', buildIndex: 1 },
    stream: 'stdout',
    prints: [[`${ESC}[32m✔${ESC}[39m Started Test 1         🤖 Android and 🍎 iOS have both arrived`]],
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
    what: 'the --wait header, dim, saying what is waited for and for how long',
    segment: { kind: 'wait-header', timeoutMinutes: 45, testIndex: 7 },
    stream: 'stdout',
    prints: [[`${ESC}[2mWaiting for Test 7 to finish (up to 45 min)...${ESC}[22m`]],
  },
  {
    kind: 'wait-header',
    what: 'the --wait header before the wait loop passes the number - "the test", lowercase',
    segment: { kind: 'wait-header', timeoutMinutes: 45 },
    stream: 'stdout',
    prints: [[`${ESC}[2mWaiting for the test to finish (up to 45 min)...${ESC}[22m`]],
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
    what: 'the deadline closer: TWO print calls, a yellow bang, "minutes" spelled out where the header abbreviates, and the command that goes on waiting',
    segment: { kind: 'wait-timed-out', timeoutMinutes: 45, testIndex: 7 },
    stream: 'stdout',
    prints: [
      [`${ESC}[33m! Stopped waiting after 45 minutes.${ESC}[39m`],
      [`  Test 7 may still be running. To keep waiting: ${ESC}[36mnpx sherlo view 7 --wait${ESC}[39m`],
    ],
  },
  {
    kind: 'wait-timed-out',
    what: 'the deadline closer for one minute, a real singular, before the wait loop passes the number',
    segment: { kind: 'wait-timed-out', timeoutMinutes: 1 },
    stream: 'stdout',
    prints: [
      [`${ESC}[33m! Stopped waiting after 1 minute.${ESC}[39m`],
      [`${ESC}[33m  The test may still be running in Sherlo.${ESC}[39m`],
    ],
  },
  {
    kind: 'wait-interrupted',
    what: "the Ctrl-C closer, dim - the same style the progress lines use, which is why the tester's collapse anchors on its TEXT and not on its colour",
    segment: { kind: 'wait-interrupted' },
    stream: 'stdout',
    prints: [[`${ESC}[2mStopped waiting. The test is still running in Sherlo.${ESC}[22m`]],
  },
  {
    kind: 'wait-interrupted',
    what: 'the Ctrl-C closer once the number is known, ending on the command that goes on waiting',
    segment: { kind: 'wait-interrupted', testIndex: 7 },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[2mStopped waiting. Test 7 is still running. ${ESC}[22mTo keep waiting: ${ESC}[36mnpx sherlo view 7 --wait${ESC}[39m`,
      ],
    ],
  },
  {
    kind: 'verdict-passed',
    what: "the green verdict as init's section - one blank above (the wait frames it with the other), the title, an underline one longer than the title for the wide emoji",
    segment: { kind: 'verdict-passed' },
    stream: 'stdout',
    prints: [
      [''],
      [`${ESC}[1m✅ All stories passed${ESC}[22m`],
      [`${ESC}[2m═════════════════════${ESC}[22m`],
      [''],
      ['No visual changes need review.'],
    ],
  },
  {
    kind: 'verdict-server-bypassed',
    what: "the server-bypassed verdict as init's finished step - the server's reason is not printed",
    segment: {
      kind: 'verdict-server-bypassed',
      reason: 'no change on this branch reaches any story',
      testIndex: 13,
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m Finished Test 13       no device ran, nothing needed capturing`],
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
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[31m✖${ESC}[39m Running the test failed`],
      [''],
      ['The test ended as "error".'],
      [`${ESC}[2mError: {"code":"RUNNER_CRASH"}${ESC}[22m`],
      [''],
      ...HELP_BLOCK_PRINTS,
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
    what: 'the review tally - dim, each count before its plain name, in a fixed order that is NOT the wire\'s alphabetical one',
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
    segment: { kind: 'build-view-status', buildIndex: 7, runStatus: 'finished', status: 'noChanges' },
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
      buildIndex: 7,
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
    what: 'a test still running - the review status the wire sent is DELIBERATELY not read, because the server computes it whatever the run is doing; it ends on the command that waits',
    segment: { kind: 'build-view-status', buildIndex: 7, runStatus: 'inProgress', status: 'unreviewed' },
    stream: 'stdout',
    prints: [[''], [`To wait for it here: ${ESC}[36mnpx sherlo view 7 --wait${ESC}[39m`]],
  },
  {
    kind: 'build-view-status',
    what: 'a finished test whose review status the API did not send - ZERO print calls, which is how this layer says nothing and is not the same as a blank line',
    segment: { kind: 'build-view-status', buildIndex: 7, runStatus: 'finished' },
    stream: 'stdout',
    prints: [],
  },
  {
    kind: 'build-details',
    what: 'the whole details block from the road that knows the most - NO colour anywhere in it, and the label column padded to the widest label present',
    segment: {
      kind: 'build-details',
      details: {
        git: {
          branchName: 'feature/login-copy',
          commitHash: '4f3a9c1e77b0d2a6f5c8419e3b7d0a1c2e6f8b04',
          isDirty: false,
          defaultBranch: 'main',
        },
        runStatus: 'finished',
        showsOnlyBranchChanges: true,
        viewStatusesCount: { approved: 5, noChanges: 36, reported: 1, unreviewed: 2 },
        diffScopeInfo: { capturedSnapshotCount: 3, inheritedSnapshotCount: 41 },
      },
    },
    stream: 'stdout',
    prints: [
      ['── details ──'],
      ['branch:        feature/login-copy @ 4f3a9c1 (clean tree)'],
      ['main line:     main'],
      ['scope:         branch-only · feature build'],
      ['runner:        finished'],
      ['diff scope:    captured 3 · inherited 41'],
      ['verdicts cast: 6'],
    ],
  },
  {
    kind: 'build-details',
    what: 'the same block with no git and no accounting - the rows are ABSENT rather than zero-filled, and the column narrows to the widest label that remains',
    segment: {
      kind: 'build-details',
      details: {
        runStatus: 'error',
        runError: 'user_runner',
        viewStatusesCount: { approved: 0, noChanges: 0, reported: 0, unreviewed: 0 },
      },
    },
    stream: 'stdout',
    prints: [['── details ──'], ['runner:        errored (user_runner)'], ['verdicts cast: 0']],
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
    what: 'everything `sherlo project create` prints - and the shape that keeps the project token OFF a key=value line, because those lines exist for CI to scrape and a secret must not be put on that journey',
    segment: {
      kind: 'project-created',
      project: {
        name: 'Design System',
        index: 12,
        projectToken: 'pppppppppppppppppppppppppppppppp team1234 12',
      },
    },
    stream: 'stdout',
    prints: [
      [`${ESC}[32m✔${ESC}[39m  Created project ${ESC}[1mDesign System${ESC}[22m`],
      [''],
      ['projectIndex=12'],
      ['projectName=Design System'],
      [''],
      [`${ESC}[33mProject token - shown once. Store it now; it cannot be shown again.${ESC}[39m`],
      [''],
      ['  pppppppppppppppppppppppppppppppp team1234 12'],
      [''],
      [`${ESC}[2mAdd it to your CI as the SHERLO_TOKEN secret.${ESC}[22m`],
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
    what: 'the wait off a terminal - a plain line that stays, and tells an agent it may wait in the background',
    segment: { kind: 'login-waiting' },
    stream: 'stdout',
    prints: [
      [
        `${ESC}[33m⏳${ESC}[39m Waiting for you to click Authorize... ${ESC}[2m(Ctrl+C to stop)${ESC}[22m`,
      ],
      [
        `${ESC}[2mAn agent may run this in the background while the person clicks. Running it again waits on the same link.${ESC}[22m`,
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

  // The header this example was taken from no longer prints (epic sherlo-test-builds-apps: the dry
  // run opens with `Testing your app...` like every test), so the example stays a worked one, and
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

    const expected = `Testing your app...\n\n${ESC}[2mBundling the JavaScript for 🤖 Android...${ESC}[22m\n`;
    expect(
      captured.stdout,
      mismatch('the buffered stdout transcript', 'helpers/transcriptSink.ts', expected, captured.stdout)
    ).toBe(expected);

    expect(
      captured.stderr.startsWith(`${GIT_INFO_UNAVAILABLE_BYTES} Error: not a git repository`),
      "the warn must keep its two arguments space-joined by node's own formatter, not by this layer"
    ).toBe(true);
    expect(captured.stderr.endsWith('\n')).toBe(true);
  });
});
