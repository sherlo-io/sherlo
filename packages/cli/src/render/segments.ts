/**
 * THE TRANSCRIPT SEGMENT UNION - what the CLI emits, before anyone decides where
 * it goes (SHERLO CLI render layer, slice S0a: the `--dry-run` family).
 *
 * A CLI transcript is not one string. The CLI prints PROGRESSIVELY - a developer
 * watches `🤖 Building android bundle...` while the bundler runs, and only then
 * sees the size line. So the render layer is per-SEGMENT, not per-transcript:
 *
 *     logic  --emit(segment)-->  renderSegment  -->  sink  -->  stdout | buffer
 *
 * The real CLI's sink writes each segment as it arrives, so nothing about the
 * user's experience changes. An expectation producer's sink appends to an array.
 * Byte-identity holds because a transcript is exactly the concatenation of its
 * segments, in order.
 *
 * A SEGMENT CARRIES DATA, NEVER TEXT. Every literal, every emoji, every chalk
 * call and every blank line lives in ./renderSegment - which is why a producer
 * cannot render a sentence the CLI would not have printed: the only thing it can
 * supply is the state, and the same renderer turns that state into bytes for the
 * real run and for the expectation.
 *
 * BLANK LINES ARE CONTENT. Several of these segments begin or end with a blank
 * line, and a committed fixture compares byte-for-byte - so a `.filter(Boolean)`
 * anywhere downstream of a renderer is a product bug, not a tidy-up.
 */
import { Platform } from '@sherlo/api-types';
import type { BundleFormat } from '../commands/test/buildBundle';
import type { Config } from '../types';
import type { BuildDetails, ViewJson, ViewStory } from './buildView';
import type { DryRunPlatformPreview } from './dryRunPlan';
import type { ProjectCreated } from './projectCreated';
import type { TeamCreated } from './teamCreated';
import type { ProjectList } from './projectList';
import type { OpenedStory } from './openedStory';
import type { CapturedStory } from './capturedStory';
import type { TeamList } from './teamList';
import type { VerdictScreen } from './verdictCloser';
import type { AppBuildCommand, RunWaitsFor, WhyANewAppBuild } from './appBuild';
import type { IntroducedCommand, PlatformCapture, SherloProject } from './testSteps';
// capturedLog is the print side of `sherlo capture --logs`, kept apart from ./capturedStory - see
// ./capturedLog's own header for why.

/** Which of the process's two streams a segment is written to. */
export type TranscriptStream = 'stdout' | 'stderr';

/**
 * One printable block of a sherlo CLI transcript.
 *
 * Two families live here now - the `--dry-run` preview (slice S0a) and the PUSH
 * SPINE (slice S0b/F1), which is the transcript `sherlo test --android/--ios` emits and
 * the one every other family's preamble is a subset of. They share ONE union and
 * ONE renderer on purpose: the intro is the same intro, and a second union would
 * be a second place for a literal to drift.
 */
export type TranscriptSegment =
  /** The gradient wordmark, the tagline and the trailing blank line. */
  | { kind: 'intro' }
  /** `Testing your app...` - the line under the logo saying what the command is doing. See ./testSteps. */
  | { kind: 'command-intro'; command: IntroducedCommand }
  /** `📦 Bundling for dry-run preview...`, wrapped in its own blank lines. */
  | { kind: 'dry-run-bundling-header' }
  /**
   * `Bundling the JavaScript for 🤖 Android...` - a step in progress (./stepInProgress): a spinner
   * in a terminal, which simply goes when the bundle is made, and one plain line in a log.
   */
  | { kind: 'platform-bundle-start'; platform: Platform }
  /**
   * The bundle the bundler made. It prints nothing: bundling and uploading are one wait, and the
   * step a person reads is the test it starts; a bundle's format and asset count are not theirs.
   */
  | {
      kind: 'platform-bundle-built';
      bundlePath: string;
      bundleSizeMb: number;
      bundleFormat: BundleFormat;
      bundler: 'expo' | 'rn';
    }
  /** The bundler's assets - emitted only when it produced an assets dir. Prints nothing, as above. */
  | { kind: 'platform-bundle-assets'; assetCount: number }
  /**
   * `✔ Used your JavaScript       🤖 Android bundle.android.js, from --bundle-dir`.
   *
   * The honest line for `--bundle-dir`. It deliberately does NOT reuse
   * `platform-bundle-built`: a run that skipped bundling must SAY it skipped
   * bundling, or a caller whose supply road silently broke would read a transcript
   * claiming work that never happened.
   */
  | {
      kind: 'platform-bundle-supplied';
      platform: Platform;
      bundlePath: string;
      bundleSizeMb: number;
      bundleFormat: BundleFormat;
      bundler: 'expo' | 'rn';
    }
  /** `  ! <note>` - an advisory about a supplied bundle that is NOT a refusal. */
  | { kind: 'platform-bundle-supplied-note'; note: string }
  /** `📦 Emitting bundle directory to <dir>...`, wrapped in its own blank lines. */
  | { kind: 'bundle-emit-header'; bundleDir: string }
  /** `  ✓ Emitted android bundle (6 assets)` - one per platform written. */
  | { kind: 'platform-bundle-emitted'; platform: Platform; bundleDir: string; assetCount: number }
  /** `  ✗ <message>` - a bundling failure, already carrying its own fallback line. */
  | { kind: 'platform-bundle-failed'; message: string }
  /** The whole `✔ Previewed the capture` plan plus the dry-run line under it. */
  | { kind: 'dry-run-capture-plan'; previews: DryRunPlatformPreview[] }
  /** `Couldn't get git info <error>` - on stderr, the one degrade the family shows. */
  | { kind: 'git-info-unavailable'; error: unknown }
  /* ---------------------------------------------------------------------- *
   * THE PUSH SPINE (F1). The order below is the order a push prints them.   *
   * ---------------------------------------------------------------------- */
  /**
   * `✔ Set up Test 3              on 2 devices (Pixel 7, iPhone 15)`.
   *
   * It carries the DEVICE LIST, not the counts: counting is a rendering
   * decision (which devices appear, in which order, singular or plural), and
   * a scenario that could hand over "2 devices" could claim a count its own
   * device list contradicts.
   */
  | { kind: 'run-header'; nextBuildIndex: number; devices: Config['devices'] }
  /** The header of one platform's binary block. Prints nothing: the upload is a step in progress. */
  | { kind: 'binary-platform-label'; platform: Platform }
  /**
   * `Uploading the 🤖 Android app build (61.4 MB)...` - a step in progress (./stepInProgress),
   * printed BEFORE the bytes go up. `platform` is absent until its print site
   * (helpers/uploadOrPrintBinaryReuse, build work) sends it, and the line then names no platform.
   */
  | { kind: 'binary-uploading'; sizeMb: string; platform?: Platform }
  /**
   * The upload finished. It prints nothing: an upload is only a wait, and the step a person reads
   * is the test it starts. The build task stops emitting it.
   */
  | { kind: 'binary-uploaded' }
  /** `   Upload failed (attempt 1 of 3), trying again...` - the per-attempt notice. */
  | { kind: 'binary-upload-retry'; attempt: number; maxRetries: number }
  /**
   * The server already held this app build, so nothing went up. It prints nothing, for the reason
   * `binary-uploaded` prints nothing. `timeAgo` arrives already phrased because computing it reads
   * the WALL CLOCK, which a renderer may not do - see helpers/.../getTimeAgo.
   */
  | { kind: 'binary-reused'; buildIndex: number; timeAgo: string }
  /**
   * `✔ Started Test 3             3 of 24 stories on 2 devices (Pixel 7, iPhone 15)` - the test is
   * open and running: what it captures, per platform as openBuild recorded it, and the devices the
   * config names. `capture` is absent where the server recorded no decision.
   */
  | {
      kind: 'test-started';
      buildIndex: number;
      devices: Config['devices'];
      capture?: PlatformCapture[];
    }
  /**
   * `! <warning>` in yellow, or a note as it is, optionally with a `Learn more:` line.
   *
   * The one segment that carries TEXT rather than data, and deliberately: the
   * message is a value computed by logic (a stageability reason from
   * `checkStageable`, an error's own `.message`), not a sentence this layer
   * would otherwise own. A scenario still cannot write one, because a scenario
   * declares wire state and never emits.
   */
  | { kind: 'notice'; level: 'warning' | 'info'; message: string; learnMoreLink?: string }
  /**
   * The generic `➜ ` / `✔ ` build line, for the print sites OUTSIDE the push
   * spine that still call `printBuildMessage` with a pre-composed string
   * (testEasCloudBuild, getBuildData). It exists so the icon-and-spacing
   * framing has exactly ONE implementation, in this layer, rather than a second
   * copy that could drift from the spine's. Everything F1 fixtures watch uses
   * the data-carrying variants above.
   */
  | { kind: 'build-message'; message: string; type: 'info' | 'success'; endsWithNewLine?: boolean }
  /**
   * The closer of a run that reached a build: `🔗 Review: <url>` - the address printed once, on
   * the line with the emoji, for a machine and a person alike (operator ruling 2026-09-15); the
   * GitHub Action reads it off that line (actions/lib/cliOutputs.mjs).
   *
   * With `testIndex`, the run did not wait for its verdict, and the link sits in init's `👉 Next
   * step` section with the command that waits for it. Without it, the link stands alone: the
   * ending of a run that waited, a split job whose run starts in the other job, or a print site
   * that does not know the test yet (PLAN-LAYER DEBT: the push spine, helpers/printResultsUrl,
   * which the build task teaches to pass the index).
   *
   * `projectWithNoCiToken`, only beside `testIndex`: the section gets a second step, running Sherlo
   * on every pull request, linking this project's page. Set only on a person's terminal while the
   * project has no CI token (../commands/test/closeTheRun), so a log never carries it.
   */
  | { kind: 'results-url'; url: string; testIndex?: number; projectWithNoCiToken?: SherloProject }
  /** Machine-readable `key=value` answer lines. A key with no value is not printed. */
  | { kind: 'output-keys'; entries: Record<string, string | number | boolean | undefined> }
  /* ---------------------------------------------------------------------- *
   * APP BUILDS - what `sherlo test` prints when a platform needs a new app  *
   * build and the tool builds it itself, and what `sherlo build` prints.    *
   * See ./appBuild. The order below is the order a build prints them.       *
   * ---------------------------------------------------------------------- */
  /**
   * `✔ Reused the iOS app     from Test 12` - a platform whose stored app build still matches: the
   * staged road, or the other half of a mixed run. `storedBuildIndex` is the test the gate named,
   * absent while the service sends none.
   */
  | { kind: 'app-build-stored-reused'; platform: Platform; storedBuildIndex?: number }
  /**
   * The app build the local build cache already held. `sherlo test`:
   * `✔ Reused the Android app from the local build cache, no app build stored yet`, where `why` is
   * the gate's reason this run needed a new app build and the native changes are listed under the
   * line. `sherlo build`: `✔ Built the Android app  kept in the local build cache (already done)`.
   */
  | { kind: 'app-build-cached'; platform: Platform; why?: WhyANewAppBuild; command: AppBuildCommand }
  /**
   * `Generating the Android folder with expo prebuild...` - a step in progress (./stepInProgress),
   * only for an Expo app with no native folder.
   */
  | { kind: 'app-build-generating'; platform: Platform }
  /** `Building the Android app with Gradle...` - a step in progress, shown while the compile runs. */
  | { kind: 'app-build-compiling'; platform: Platform }
  /**
   * `✔ Built the Android app      in 1m 28s, no app build stored yet (log: ...)`, with the native
   * changes under it. The duration arrives in whole seconds, measured by logic: the renderer reads
   * no clock.
   */
  | {
      kind: 'app-build-done';
      platform: Platform;
      seconds: number;
      logPath: string;
      why?: WhyANewAppBuild;
      command: AppBuildCommand;
    }
  /**
   * The failed build: what changed since the stored app build, its duration, the build tool's last
   * lines verbatim, where the full log is - and the help block, since the run ends there.
   */
  | {
      kind: 'app-build-failed';
      platform: Platform;
      seconds: number;
      lastLines: string[];
      logPath: string;
      why?: WhyANewAppBuild;
      command: AppBuildCommand;
      /** The project the run pushes to, when known: the "build on CI" line links its page. */
      project?: SherloProject;
    }
  /** `sherlo build`'s ending: the `👉 Next step` section naming what the kept app build is for. */
  | { kind: 'app-build-next-step' }
  /** `Starting EAS builds...` - a step in progress, while Expo is asked to start them. */
  | { kind: 'eas-builds-starting'; platforms: Platform[] }
  /** `✔ Started EAS builds     🤖 Android and 🍎 iOS, profile "sherlo"` - one line for every EAS build started. */
  | { kind: 'eas-builds-started'; platforms: Platform[]; profile: string }
  /** The EAS profile reads variables kept on Expo's servers, which a local build cannot read. */
  | { kind: 'eas-hosted-variables'; profile: string; environment: string }
  /**
   * `✔ Opened Test 1              it starts when ...` - the run is open and waits for the builds
   * still to come: the other job's platform in a split CI run, or the EAS builds.
   */
  | { kind: 'run-waits-for-builds'; buildIndex: number; waitingFor: RunWaitsFor }
  /**
   * `✔ Started Test 1         🤖 Android and 🍎 iOS are both in, on 2 devices (Pixel 7, iPhone 15)` -
   * this job's build was the last one the run waited for. `devices` is absent where the print site
   * does not know them (the EAS hook reads no config yet - build work), and the line then ends at
   * "both in".
   */
  | { kind: 'run-starting'; buildIndex: number; devices?: Config['devices'] }
  /* ---------------------------------------------------------------------- *
   * THE VERDICT FAMILY (F4) - what `--wait` prints while it polls, and what  *
   * it prints when the build reaches a terminal state.                      *
   * ---------------------------------------------------------------------- */
  /**
   * One bare `console.log()`.
   *
   * Every verdict closer in this family sits between two of them. Baking that
   * frame into each closer would be nine copies of one print call, and a tenth
   * closer would be free to forget it - so the frame is a segment the wait loop
   * emits around a closer, which is exactly the shape the shipped code had.
   */
  | { kind: 'blank-line' }
  /**
   * `Waiting for Test 7 to finish (up to 45 min)...` - a step in progress (./stepInProgress),
   * started before the first poll. `testIndex` on this and the closers below names the test; a
   * line given none says "the test".
   */
  | { kind: 'wait-header'; timeoutMinutes: number; testIndex?: number }
  /**
   * `✔ Finished Test 14       in 3m 5s` - the wait's own step, printed where its spinner was, above
   * the verdict. `seconds` is how long the wait took, given only when the wait saw the test start
   * (`sherlo test --wait`); `sherlo view <n> --wait` did not, and the line ends at the test.
   */
  | { kind: 'test-finished'; testIndex: number; seconds?: number }
  /** `   Running` - reprinted only when the wire's `runStatus` CHANGES. A log's line only. */
  | { kind: 'wait-progress'; runStatus: string }
  /**
   * `   still running... (5m elapsed)`.
   *
   * Both values arrive already computed because both come from the CLOCK, which
   * a renderer may not read: the label is `running` where the wire says
   * `inProgress`, and the elapsed minutes are measured against the loop's own
   * start time.
   */
  | { kind: 'wait-heartbeat'; statusLabel: string; elapsedMinutes: number }
  /** `   Network error, retrying... (<message>)` - a transient blip, not a verdict. */
  | { kind: 'wait-network-retry'; message: string }
  /** `   Test not found yet, retrying...`. */
  | { kind: 'wait-build-not-found' }
  /** `✖ <message>` - a credential refused mid-poll, which is not retryable. */
  | { kind: 'wait-auth-failed'; message: string }
  /** The deadline closer, both lines. */
  | { kind: 'wait-timed-out'; timeoutMinutes: number; testIndex?: number }
  /** The Ctrl-C closer: the waiting stopped, the run did not. */
  | { kind: 'wait-interrupted'; testIndex?: number }
  /** The green verdict, as a section: `✅ All stories passed`. */
  | { kind: 'verdict-passed' }
  /**
   * The compact closer for a build the server closed without a device run:
   * `✔ Finished Test 15       nothing to capture: no change on this branch reaches any story`.
   * `reason` is the server's own prose, printed verbatim after the colon.
   */
  | { kind: 'verdict-server-bypassed'; reason: string; testIndex?: number }
  /**
   * `⚠️ 3 stories need review`, as a section, then the screens that
   * need a person BY NAME when the wait learned them, and the build's own tally
   * when it did not. See ./verdictCloser's {@link renderVerdictReviewRequired}.
   */
  | {
      kind: 'verdict-review-required';
      /** Every screen the build has, in the order `sherlo view` lists them. Absent on an older API. */
      screens?: VerdictScreen[];
      /** The build's tally, printed when the screens name nobody. */
      counts: { unreviewed: number; reported: number };
    }
  /** `✖ Running Test 14 failed`, the state it ended in, the server's error blob if any, and help. */
  | { kind: 'verdict-run-errored'; runStatus: string; runError: unknown; testIndex?: number }
  /* ---------------------------------------------------------------------- *
   * GATED. The three kinds below are emitted by the shipped wait loop, but   *
   * ONLY for a build the server marked `showsOnlyBranchChanges` - a project  *
   * that opted into sparse builds. They are reachable only from             *
   * `decideSparseBuildVerdict` (helpers/sparseBuildVerdict.ts); a build with *
   * no gate on it never reaches any of them. See that module's header.       *
   * ---------------------------------------------------------------------- */
  /** `✅ No visual changes` / `All snapshots match their baselines.` (the check's own copy). */
  | { kind: 'verdict-no-changes' }
  /** `3 captured on this branch, 41 carried over unchanged.` - the sparse accounting. */
  | { kind: 'verdict-capture-accounting'; captured: number; inherited: number }
  /** The build recorded nothing at all, so it is evidence of nothing. Not green. */
  | { kind: 'verdict-nothing-recorded'; testIndex?: number }
  /* ---------------------------------------------------------------------- *
   * THE BUILD VIEW (F5) - what `sherlo view` prints about one build, and   *
   * its `--json` record. See ./buildView.                                  *
   * ---------------------------------------------------------------------- */
  /** `Test 7 · finished` - the line `sherlo view` opens with. */
  | { kind: 'build-view-header'; buildIndex: number; runStatus: string }
  /** `5 approved · 0 reported · 0 unreviewed · 39 no changes` - the review tally. */
  | {
      kind: 'build-view-tally';
      counts: { approved: number; noChanges: number; reported: number; unreviewed: number };
    }
  /**
   * The verdict section of a finished test, as `--wait` ends with it. A test still running ends
   * on the `👉 Next step` section instead (`results-url` with its `testIndex`).
   *
   * It carries the WIRE fields rather than a resolved state, because which verdict
   * they collapse to - and whether they collapse to one at all - is a rendering
   * decision ./buildView owns. A finished test whose review status the API did not
   * send renders NO line.
   */
  | {
      kind: 'build-view-status';
      runStatus: string;
      status?: 'approved' | 'noChanges' | 'reported' | 'unreviewed';
      counts?: { approved: number; noChanges: number; reported: number; unreviewed: number };
    }
  /**
   * The old `── details ──` block. It prints nothing: `--metadata` left `sherlo test` (operator
   * ruling 2026-10-12, Q4), and `sherlo view <n> --json` is the one read-back. Its only emitter,
   * the wait loop's `metadata` parameter (helpers/waitForBuildResult), is unreachable now; the build
   * task deletes both.
   */
  | { kind: 'build-details'; details: BuildDetails }
  /**
   * `sherlo view --json`'s WHOLE output (operator decision 2026-10-12): the
   * record, pretty-printed, and nothing around it - no header, no url line.
   * See ./buildView's ViewJson.
   */
  | { kind: 'build-view-json'; json: ViewJson }
  /**
   * The per-story table `sherlo view` prints (without `--json`): one row
   * per story with its status and baseline. See ./buildView.
   */
  | { kind: 'build-view-stories-table'; stories: ViewStory[] }
  /* ---------------------------------------------------------------------- *
   * PROJECT MANAGEMENT - what `sherlo project create` prints. See           *
   * ./projectCreated for why this segment carries three named fields rather *
   * than the api response it was built from.                                *
   * ---------------------------------------------------------------------- */
  /** The whole success output of `sherlo project create`, token line included. */
  | { kind: 'project-created'; project: ProjectCreated }
  /** The whole success output of `sherlo team create`. See ./teamCreated. */
  | { kind: 'team-created'; team: TeamCreated }
  /** The whole output of `sherlo project list`. See ./projectList. */
  | { kind: 'project-list'; list: ProjectList }
  /** The whole output of `sherlo team list`. See ./teamList. */
  | { kind: 'team-list'; list: TeamList }
  /** The whole output of `sherlo open`. See ./openedStory. */
  | { kind: 'opened-story'; state: OpenedStory }
  /** The whole screen output of `sherlo capture`. See ./capturedStory. */
  | { kind: 'captured-story'; state: CapturedStory }
  /** `sherlo capture --logs` - the app's own log lines, printed after the story. See ./capturedLog. */
  | { kind: 'captured-log'; logs: string[] }
  /* ---------------------------------------------------------------------- *
   * LOGGING IN - what `sherlo login` and `sherlo logout` print when they    *
   * end well. See ./login. No segment here carries a token.                 *
   * ---------------------------------------------------------------------- */
  /** The authorize link, alone on its line - printed before the browser is asked to open it. */
  | { kind: 'login-link'; authorizeUrl: string }
  /**
   * The wait for the person's answer, as the plain line printed anywhere but a terminal. On a
   * terminal the wait is a spinner instead, which the result replaces (../commands/login/login).
   */
  | { kind: 'login-waiting' }
  /**
   * `✔  Logged in as <email>`, then the next step. A login made inside setup (`insideSetup`) has
   * no next step to name: it is already on it.
   */
  | { kind: 'logged-in'; email: string; insideSetup?: true }
  /** `✔  Already logged in as <email>` - a saved login the service still accepts. */
  | { kind: 'already-logged-in'; email: string }
  /** `✔  Logged out <email>`. */
  | { kind: 'logged-out'; email: string }
  /** `◦  Not logged in` - a logout with no saved login. */
  | { kind: 'not-logged-in' };

/**
 * Where rendered segments go. The CLI installs a sink that writes to the
 * process's streams; a producer installs one that buffers.
 */
export type TranscriptSink = (segment: TranscriptSegment) => void;
