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
import type { BuildDetails } from './buildView';
import type { DryRunPlatformPreview } from './dryRunPlan';

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
  /** `📦 Bundling for dry-run preview...`, wrapped in its own blank lines. */
  | { kind: 'dry-run-bundling-header' }
  /** `🤖 Building android bundle...` - printed BEFORE the bundler runs. */
  | { kind: 'platform-bundle-start'; platform: Platform }
  /** `  ✓ Bundle: bundle.android.js (4.29 MB, plain-js, expo)`. */
  | {
      kind: 'platform-bundle-built';
      bundlePath: string;
      bundleSizeMb: number;
      bundleFormat: BundleFormat;
      bundler: 'expo' | 'rn';
    }
  /** `  ✓ Assets: 6 files` - emitted only when the bundler produced an assets dir. */
  | { kind: 'platform-bundle-assets'; assetCount: number }
  /**
   * `  ✓ Bundle supplied: bundle.android.js (4.29 MB, plain-js, expo)`.
   *
   * The honest line for `--bundle-dir`. It deliberately does NOT reuse
   * `platform-bundle-built`: a run that skipped bundling must SAY it skipped
   * bundling, or a caller whose supply road silently broke would read a transcript
   * claiming work that never happened.
   */
  | {
      kind: 'platform-bundle-supplied';
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
  /** The whole `📸 Capture plan (dry run)` block plus the `◦ Dry run` closer. */
  | { kind: 'dry-run-capture-plan'; previews: DryRunPlatformPreview[] }
  /** `Couldn't get git info <error>` - on stderr, the one degrade the family shows. */
  | { kind: 'git-info-unavailable'; error: unknown }
  /* ---------------------------------------------------------------------- *
   * THE PUSH SPINE (F1). The order below is the order a push prints them.   *
   * ---------------------------------------------------------------------- */
  /**
   * `Test 3 will run on 2 devices (1 Android, 1 iOS)`, plus its trailing blank.
   *
   * It carries the DEVICE LIST, not the counts: counting is a rendering
   * decision (which platforms appear, in which order, singular or plural), and
   * a scenario that could hand over "2 devices" could claim a count its own
   * device list contradicts.
   */
  | { kind: 'run-header'; nextBuildIndex: number; devices: Config['devices'] }
  /** `📦 Android` / `📦 iOS` - the header of one platform's binary block. */
  | { kind: 'binary-platform-label'; platform: Platform }
  /** `➜  uploading build... (41.2 MB)` - printed BEFORE the bytes go up. */
  | { kind: 'binary-uploading'; sizeMb: string }
  /** `✔  upload complete`, plus its trailing blank. */
  | { kind: 'binary-uploaded' }
  /** `➜  Upload failed (attempt 1/3), retrying...` - the per-attempt notice. */
  | { kind: 'binary-upload-retry'; attempt: number; maxRetries: number }
  /**
   * `✔  reusing unchanged build (Test 1, 7 minutes ago)`, plus its trailing
   * blank. `timeAgo` arrives already phrased because computing it reads the
   * WALL CLOCK, which a renderer may not do - see helpers/.../getTimeAgo.
   */
  | { kind: 'binary-reused'; buildIndex: number; timeAgo: string }
  /**
   * `WARNING: ...` / `INFO: ...`, optionally with a `↳ Learn more:` line.
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
   * The closer of a run that reached a build: the machine-readable `url=` line
   * a CI republishes, then the human `🔗` link, then a blank.
   */
  | { kind: 'results-url'; url: string }
  /** Machine-readable `key=value` answer lines. A key with no value is not printed. */
  | { kind: 'output-keys'; entries: Record<string, string | number | boolean | undefined> }
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
  /** `⏳ Waiting for build results (timeout: 45min)...`, printed before the first poll. */
  | { kind: 'wait-header'; timeoutMinutes: number }
  /** `   🔵 Running` - reprinted only when the wire's `runStatus` CHANGES. */
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
  /** `   Build not found, retrying...`. */
  | { kind: 'wait-build-not-found' }
  /** `🔒 <message>` - a credential refused mid-poll, which is not retryable. */
  | { kind: 'wait-auth-failed'; message: string }
  /** The deadline closer, both lines. */
  | { kind: 'wait-timed-out'; timeoutMinutes: number }
  /** The Ctrl-C closer: the waiting stopped, the run did not. */
  | { kind: 'wait-interrupted' }
  /** Today's generic green: `✅ All stories passed - no visual changes require review.` */
  | { kind: 'verdict-passed' }
  /**
   * The compact closer for a build the server closed without a device run. The
   * reason is the SERVER's prose, printed verbatim - which is why it is a value
   * here and not a branch.
   */
  | { kind: 'verdict-server-bypassed'; reason: string }
  /** `⚠️  Build finished with changes requiring review.` plus whichever counts are non-zero. */
  | { kind: 'verdict-review-required'; unreviewed: number; reported: number }
  /** `❌ Build ended in "error" state.` plus the server's error blob, if any. */
  | { kind: 'verdict-run-errored'; runStatus: string; runError: unknown }
  /* ---------------------------------------------------------------------- *
   * GATED. The three kinds below are emitted by the shipped wait loop, but   *
   * ONLY for a build the server marked `showsOnlyBranchChanges` - a project  *
   * that opted into sparse builds. They are reachable only from             *
   * `decideSparseBuildVerdict` (helpers/sparseBuildVerdict.ts); a build with *
   * no gate on it never reaches any of them. See that module's header.       *
   * ---------------------------------------------------------------------- */
  /** `✅ No visual changes - all snapshots match their baselines.` (the check's own copy). */
  | { kind: 'verdict-no-changes' }
  /** `   3 captured on this branch, 41 inherited unchanged` - the sparse accounting. */
  | { kind: 'verdict-capture-accounting'; captured: number; inherited: number }
  /** The build recorded nothing at all, so it is evidence of nothing. Not green. */
  | { kind: 'verdict-nothing-recorded' }
  /* ---------------------------------------------------------------------- *
   * THE BUILD VIEW (F5) - what `sherlo view` prints about one build, and    *
   * the `── details ──` block `--metadata` adds to it and to the `--wait`   *
   * roads of `sherlo test`. See ./buildView.                               *
   * ---------------------------------------------------------------------- */
  /** `Build #7 · finished` - the line `sherlo view` opens with. */
  | { kind: 'build-view-header'; buildIndex: number; runStatus: string }
  /** `approved 5 · reported 0 · unreviewed 0 · noChanges 39` - the review tally. */
  | {
      kind: 'build-view-tally';
      counts: { approved: number; noChanges: number; reported: number; unreviewed: number };
    }
  /**
   * The check-style status sentence.
   *
   * It carries the two WIRE fields rather than a resolved state, because which
   * state they collapse to - and whether they collapse to one at all - is a
   * rendering decision the catalog in ./buildView owns. A finished build whose
   * review status the API did not send renders NO line.
   */
  | {
      kind: 'build-view-status';
      runStatus: string;
      status?: 'approved' | 'noChanges' | 'reported' | 'unreviewed';
    }
  /**
   * The whole `── details ──` block: plain, aligned, colourless, deterministic.
   * Carries the build's facts, never their formatting - see ./buildView.
   */
  | { kind: 'build-details'; details: BuildDetails };

/**
 * Where rendered segments go. The CLI installs a sink that writes to the
 * process's streams; a producer installs one that buffers.
 */
export type TranscriptSink = (segment: TranscriptSegment) => void;
