import { REJECTED_LOGIN_MESSAGE } from '../commands/shared/refuseRejectedLogin';
import { printsToATerminal, whileShowing, type SayMore } from '../commands/shared/terminal';
import { runStatusWord } from '../render/buildView';
import { formatBuildDuration } from '../render/appBuild';
import { renderSegment } from '../render/renderSegment';
import { rowsAbove } from '../commands/test/platformRows';
import type { PlatformRow } from '../render/runRows';
import type { TranscriptSegment } from '../render/segments';
import { AuthError, type BuildStatus, type BuildStatusResponse } from './buildStatusRequest';
import { serverCalls } from '../seams/serverCalls';
import { surroundings } from '../seams/surroundings';
import getTokenParts from './getTokenParts';
import isPersonalToken from './isPersonalToken';
import { emit } from './transcriptSink';
import { EXIT_BLOCK, EXIT_ERROR, EXIT_GREEN, EXIT_SIGINT, EXIT_TIMEOUT } from './exitCodes';
import { decideSparseBuildVerdict, routesThroughSparseVerdict } from './sparseBuildVerdict';

/*
 * The exit-code contract this loop returns under - including the ONE input on
 * which it used to disagree with the GitHub check, and how the sparse verdict
 * repairs that - lives in ./exitCodes, next to the codes themselves.
 */

const DEFAULT_WAIT_TIMEOUT_MINUTES = 45;
const POLL_INTERVAL_MS = 15_000; // fixed interval, no API hammering
/**
 * THE STORIES MUST HAVE STOPPED MOVING BEFORE A VERDICT IS PRINTED (2026-09-09).
 *
 * `runStatus: finished` says the runner is done; it does not say the comparison
 * is. The per-story rows behind `stories[]` (names, statuses, the baseline each
 * was judged against) are written after the build closes, one at a time, so a
 * read taken the instant the build turns terminal can see a half-populated list
 * - and a `--metadata` read chained after `--wait` would print it as the truth.
 * The e2e harness used to paper over this with a private GraphQL poll of its
 * own; a user has no such poll, so the wait has to be right here.
 *
 * The rule: once finished, the verdict is held until two consecutive reads of
 * `stories[]` are identical. The confirming read comes a few seconds after the
 * first, not a whole poll interval later - a settled build pays seconds, an
 * unsettled one waits exactly as long as it takes.
 */
const SETTLE_CONFIRM_MS = 3_000;

/** The run statuses a test ends in - the ones {@link decideTerminalState} can close on. */
const RUN_STATUSES_THAT_END_A_TEST = new Set(['finished', 'error', 'canceled']);

/**
 * The `getBuildStatus` wire shape and its one read live in ./buildStatusRequest now - the seam
 * that lets a pose answer these reads has to import them without importing this loop. Re-exported
 * here because everything that types against a poll answer imports it from this module.
 */
export type { BuildStatus, BuildStatusResponse } from './buildStatusRequest';

/**
 * Wait for a test to end and say how it went; resolves to the exit code. The wait every command
 * runs - see {@link waitForTest} for the arguments, and for the read that decided it.
 */
async function waitForBuildResult(waitArguments: WaitArguments): Promise<number> {
  return (await waitForTest(waitArguments)).exitCode;
}

type WaitArguments = Parameters<typeof waitForTest>[0];

/** How a wait ended: the exit code, and the last read of the test (`null` if it never appeared). */
export type WaitResult = { exitCode: number; lastRead: BuildStatus | null };

/**
 * The wait itself. It returns its last read of the test with the exit code, so a command that
 * prints the test's record after the wait (`sherlo view --json --wait`) needs no read of its own.
 */
export async function waitForTest({
  token,
  fromSavedLogin = false,
  buildIndex,
  projectIndex,
  teamId,
  waitTimeoutMinutes,
  serverBypassed = false,
  sawTheTestStart = false,
  rowsNotYetShown = [],
  // THE CLOCK IS THE SURROUNDINGS' - the wall clock on a live run, the pose's instants on a posed
  // one (../seams/surroundings) - and it is read lazily so a seam installed after this module
  // loaded is still the one consulted.
  now = () => surroundings().now(),
  pollBuildStatus,
  json = false,
}: {
  token: string;
  /**
   * The token is the login saved on this computer (`credential.fromSavedLogin`). A refusal of it
   * then says to log in again, as every command answers a refused login; a token somebody gave
   * keeps "check your token".
   */
  fromSavedLogin?: boolean;
  buildIndex: number;
  projectIndex: number;
  teamId: string;
  waitTimeoutMinutes?: number;
  /**
   * Injectable clock so the deadline tests can stub time deterministically
   * instead of spying on the global `Date.now` - keeps them immune to any
   * other `Date.now` caller in the process (e.g. a test reporter timestamping
   * console output) under any test reporter.
   */
  now?: () => number;
  /**
   * The build was already closed server-side without ever running on a device
   * (SHERLO-1959/1952), detected off the openBuild counts by the caller. When
   * set we keep the poll and the exit-code contract EXACTLY as they are - the
   * build is already terminal, so the first poll returns immediately - but we
   * suppress the output that implies device work happened: the "waiting" line
   * below and the "🟢 Finished" progress line. The compact bypassed closer is
   * printed by printTerminalCloser off the poll's verbatim reason.
   */
  serverBypassed?: boolean;
  /**
   * The caller started this test just before the wait (`sherlo test --wait`), so the time the wait
   * took is how long the test ran, and the finished step says it under the test's row:
   * `            ✔ Finished in 3m 5s`. `sherlo view <n> --wait` did not see the test start, and its
   * finished step names the test and says no time: `✔ Finished Test 14`.
   */
  sawTheTestStart?: boolean;
  /**
   * The platforms' rows no test row has shown yet (../commands/test/closeTheRun decides which),
   * printed above the row that says the server closed the test. `sherlo view <n> --wait` has none.
   */
  rowsNotYetShown?: PlatformRow[];
  /**
   * The ONE effect this loop performs, injectable so a caller can supply the
   * answers instead of the network.
   *
   * It exists for the transcript producer (commands/test/renderVerdictTranscript.ts),
   * which renders this family's expectations by running THIS function - the
   * shipped one - over a scripted sequence of poll answers. Substituting the
   * poll and nothing else is what keeps a rendered transcript evidence about the
   * CLI rather than about the producer: every branch, every dedupe and every
   * literal below is still the shipped one.
   *
   * Absent (the shipped path) it is the real GraphQL read, and both the token
   * parsing and the endpoint resolution happen inside it - so an injected poll
   * needs neither a real token nor a resolvable SDK env file.
   */
  pollBuildStatus?: () => Promise<BuildStatus | null>;
  /**
   * stdout is one JSON record and nothing else (`sherlo view --json --wait`, as `eas build --json
   * --wait` does): the wait prints nothing on stdout, shows its progress as a spinner on stderr
   * only when stderr is a terminal, and says a refused login once on stderr.
   */
  json?: boolean;
}): Promise<WaitResult> {
  const timeoutMs = (waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES) * 60 * 1000;
  const startTime = now();
  const deadline = startTime + timeoutMs;

  // Resolved ONCE, before the loop, exactly where the token parse and the
  // endpoint read happened before this parameter existed - so a malformed token
  // still throws out of the call rather than inside the loop's retry catch,
  // where it would be mistaken for a transient network blip and retried forever.
  const poll = pollBuildStatus ?? realPoll();

  function realPoll(): () => Promise<BuildStatus | null> {
    // A project token is parsed HERE rather than inside the call, so a malformed one still throws
    // out of the call rather than inside the loop's retry catch (see the note above). A personal
    // token has no parts to parse: it is sent whole.
    if (!isPersonalToken(token)) getTokenParts(token);
    return () => serverCalls().getBuildStatus({ token, buildIndex, projectIndex, teamId });
  }

  const timeoutMinutes = waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES;
  const testIndex = buildIndex;

  // A server-bypassed build is already closed, so there is nothing to show a wait for: the one
  // read below returns at once. Every other wait is a step in progress - a spinner in a person's
  // terminal, one plain line in a log (../commands/shared/terminal) - and how it ended prints after
  // the spinner has gone.
  const lastRead: { build: BuildStatus | null } = { build: null };
  const pollTheTest = (sayMore: SayMore) =>
    pollUntilTheWaitEnds({
      poll,
      now,
      startTime,
      deadline,
      serverBypassed,
      fromSavedLogin,
      json,
      sayMore,
      lastRead,
    });
  const ending = serverBypassed
    ? await pollTheTest(() => {})
    : await whileShowing({ kind: 'wait-header', timeoutMinutes, testIndex }, pollTheTest, {
        forJson: json,
      });

  // A JSON wait prints nothing on stdout: how it ended is the exit code, and the record is the
  // caller's to print.
  const endWith = (exitCode: number): WaitResult => ({ exitCode, lastRead: lastRead.build });

  switch (ending.kind) {
    case 'interrupted':
      if (!json) emit({ kind: 'wait-interrupted', testIndex });
      return endWith(EXIT_SIGINT);

    case 'timed-out':
      if (!json) emit({ kind: 'wait-timed-out', timeoutMinutes, testIndex });
      return endWith(EXIT_TIMEOUT);

    case 'login-refused':
      if (json) {
        // Once, on stderr: stdout stays a record a program can parse, and the refusal is not lost.
        for (const args of renderSegment({ kind: 'wait-auth-failed', message: ending.message })
          .prints) {
          console.warn(...args);
        }
      } else {
        emit({ kind: 'blank-line' });
        emit({ kind: 'wait-auth-failed', message: ending.message });
        emit({ kind: 'blank-line' });
      }
      return endWith(EXIT_ERROR);

    case 'closed':
      // THE ONE PLACE THE CLOSER PRINTS, at most once per build: every earlier read of a finished
      // build still settling its stories[] decided and moved on without printing anything.
      if (!json) {
        printTerminalCloser(
          ending.build,
          {
            testIndex,
            secondsItRan: sawTheTestStart ? ending.secondsItRan : undefined,
          },
          rowsNotYetShown
        );
      }
      return endWith(ending.exitCode);
  }
}

/**
 * Poll until the wait ends - the build closed, the deadline passed, Ctrl-C, or a refused
 * credential - and say how, printing nothing but the progress lines a log keeps. In a person's
 * terminal those lines would break the spinner, and the spinner's own words carry the wait; a log
 * keeps them because nothing there can be redrawn, and a CI service that stops a job which has
 * been silent too long needs the heartbeat.
 */
async function pollUntilTheWaitEnds({
  poll,
  now,
  startTime,
  deadline,
  serverBypassed,
  fromSavedLogin,
  json,
  sayMore,
  lastRead,
}: {
  poll: () => Promise<BuildStatus | null>;
  now: () => number;
  startTime: number;
  deadline: number;
  serverBypassed: boolean;
  fromSavedLogin: boolean;
  /** stdout is a JSON record: no line of a log is printed, whatever the terminal. */
  json: boolean;
  /** Says what the test is doing beside the wait's spinner (a no-op where there is none). */
  sayMore: SayMore;
  /** Filled with every read of the test that found it, so the caller has the last one. */
  lastRead: { build: BuildStatus | null };
}): Promise<WaitEnding> {
  const inATerminal = printsToATerminal();
  const printInALog = (segment: TranscriptSegment): void => {
    if (!inATerminal && !json) emit(segment);
  };

  let lastStatus = '';
  let pollCount = 0;
  // The `stories[]` the previous read of a FINISHED build carried (see
  // SETTLE_CONFIRM_MS); `undefined` until a finished build has been read once.
  let storiesLastRead: string | undefined;

  // Overrides Node's default "exit immediately" SIGINT behavior so the wait
  // loop can stop cleanly and exit(130) itself instead of killing the process
  // mid-print. The run keeps going in Sherlo.
  const sigint = createSigintSignal();

  // Every sleep in the loop is bounded to the remaining time until the
  // deadline, so a timeout fires on time instead of overshooting by up to one
  // poll interval - and is raced against SIGINT so Ctrl-C never has to wait
  // out a sleep.
  const sleepUnlessInterrupted = async (
    intervalMs = POLL_INTERVAL_MS
  ): Promise<'elapsed' | 'sigint'> => {
    const remainingMs = Math.max(deadline - now(), 0);
    return Promise.race([
      sleep(Math.min(intervalMs, remainingMs)).then(() => 'elapsed' as const),
      sigint.promise.then(() => 'sigint' as const),
    ]);
  };

  const interrupted: WaitEnding = { kind: 'interrupted' };

  try {
    while (true) {
      // Check timeout before each poll
      if (now() >= deadline) {
        return { kind: 'timed-out' };
      }

      let build: NonNullable<BuildStatusResponse['getBuildStatus']> | null = null;

      try {
        const polled = await Promise.race([
          poll().then((result) => ({ type: 'result' as const, result })),
          sigint.promise.then(() => ({ type: 'sigint' as const })),
        ]);

        if (polled.type === 'sigint') {
          return interrupted;
        }

        build = polled.result;
      } catch (error) {
        // Auth failures are not retryable - stop immediately
        if (error instanceof AuthError) {
          return {
            kind: 'login-refused',
            message: fromSavedLogin ? REJECTED_LOGIN_MESSAGE : error.message,
          };
        }

        // Transient network blips are retried.
        //
        // ⚠ AND SO IS EVERY OTHER NON-AUTH ERROR, INCLUDING A PERMANENT ONE.
        // This branch cannot tell a dropped packet from a GraphQL
        // `Cannot query field` - so a CLI that selects a field its API does not
        // know does not fail fast, it retries every 15s until --wait-timeout and
        // exits 3 after 45 minutes of nothing.
        //
        // THE RULE THAT FALLS OUT, for anyone adding to the query below: an
        // additive selection is only safe once the schema carrying it is
        // DEPLOYED. That is not specific to the sparse-verdict fields
        // (`status`, `showsOnlyBranchChanges`) - it is true of every future
        // field, which is why it is written here at the hazard rather than in
        // the commit that happened to hit it first.
        printInALog({ kind: 'wait-network-retry', message: (error as Error).message });
        sayMore('Network error, retrying');
        if ((await sleepUnlessInterrupted()) === 'sigint') {
          return interrupted;
        }
        continue;
      }

      if (!build) {
        printInALog({ kind: 'wait-build-not-found' });
        sayMore('Test not found yet, retrying');
        if ((await sleepUnlessInterrupted()) === 'sigint') {
          return interrupted;
        }
        continue;
      }

      lastRead.build = build;
      sayMore(
        `${capitalized(runStatusWord(build.runStatus))}, ${formatBuildDuration(
          Math.round((now() - startTime) / 1000)
        )}`
      );

      // Print progress when status changes. Suppressed for a server-bypassed build
      // (SHERLO-1952): its only progress line would be "🟢 Finished", which implies
      // a device run that never happened.
      // Deduped on the wire's `runStatus` rather than on the rendered line. The
      // two are equivalent - each status renders to its own distinct label - and
      // deduping on STATE keeps the loop from having to hold a rendered string.
      // A status that ends the test gets no progress line: the step or the failure the wait
      // closes on says it.
      const endsTheTest = RUN_STATUSES_THAT_END_A_TEST.has(build.runStatus);
      if (!serverBypassed && !endsTheTest && build.runStatus !== lastStatus) {
        printInALog({ kind: 'wait-progress', runStatus: build.runStatus });
        lastStatus = build.runStatus;
      }

      const exitCode = decideTerminalState(build);

      if (exitCode !== null) {
        // A FINISHED BUILD IS CLOSED ON ONLY ONCE ITS STORIES HAVE STOPPED MOVING
        // (SETTLE_CONFIRM_MS). An errored or canceled build has no comparison to
        // wait for, and a wire that carries no `stories` at all has nothing to
        // settle; both close at once, as before.
        const storiesNow = build.runStatus === 'finished' ? storiesFingerprint(build) : null;
        if (storiesNow !== null && storiesNow !== storiesLastRead) {
          storiesLastRead = storiesNow;
          if ((await sleepUnlessInterrupted(SETTLE_CONFIRM_MS)) === 'sigint') {
            return interrupted;
          }
          continue;
        }
        return {
          kind: 'closed',
          build,
          exitCode,
          secondsItRan: Math.round((now() - startTime) / 1000),
        };
      }

      // Periodic heartbeat so CI systems never see 5+ min of silence
      pollCount++;
      if (pollCount % 20 === 0) {
        printInALog({
          kind: 'wait-heartbeat',
          statusLabel: build.runStatus === 'inProgress' ? 'running' : build.runStatus,
          elapsedMinutes: Math.round((now() - startTime) / 60_000),
        });
      }

      if ((await sleepUnlessInterrupted()) === 'sigint') {
        return interrupted;
      }
    }
  } finally {
    sigint.cleanup();
  }
}

function capitalized(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** How a wait ended, decided by the poll and printed once the wait's spinner has gone. */
type WaitEnding =
  /** Ctrl-C: the waiting stopped, the test did not. */
  | { kind: 'interrupted' }
  /** The deadline passed before the test closed. */
  | { kind: 'timed-out' }
  /** The service refused the credential mid-wait, which no retry fixes. */
  | { kind: 'login-refused'; message: string }
  /** The test reached a terminal state: the read it closed on, its exit code, and how long the wait took. */
  | {
      kind: 'closed';
      build: NonNullable<BuildStatusResponse['getBuildStatus']>;
      exitCode: number;
      secondsItRan: number;
    };

/* ========================================================================== */
/* INTERNALS                                                                   */
/* ========================================================================== */

/**
 * One line per story - name, status, baseline build, review reason - so two reads
 * compare as strings. `null` when the wire carried no `stories` at all.
 */
function storiesFingerprint(build: BuildStatus): string | null {
  if (!build.stories) return null;
  return build.stories
    .map(
      (story) =>
        `${story.name}|${story.status}|${story.baseline?.buildIndex ?? 'none'}|${
          story.reason ?? ''
        }`
    )
    .join('\n');
}

/**
 * DECIDING, not printing. Reads a poll answer and returns the exit code the
 * build has reached, or `null` when it has not reached one yet (still running,
 * or a finished poll whose counts have not landed). This is the ONLY thing
 * called on every read of a settling build - see {@link printTerminalCloser}
 * for the closer this decision earns, which the loop calls at most once.
 */
function decideTerminalState(
  build: NonNullable<BuildStatusResponse['getBuildStatus']>
): number | null {
  const { runStatus, viewStatusesCount } = build;

  switch (runStatus) {
    case 'finished': {
      // `viewStatusesCount` can arrive null/undefined on a just-finished poll
      // (a race with the counts not being written yet). Treat that as
      // not-yet-terminal so the next poll picks it up - defaulting the counts
      // to 0 here would declare a false GREEN.
      if (!viewStatusesCount) {
        return null;
      }

      // THE GATE. A build the server did not mark - which is every build of
      // every project that has not opted in, and every build answered by an API
      // that predates the field - skips this entirely and falls through to the
      // block below, which is unchanged to the byte.
      if (routesThroughSparseVerdict(build)) {
        return decideSparseBuildVerdict(build)?.exitCode ?? null;
      }

      const { unreviewed, reported } = viewStatusesCount;
      return unreviewed === 0 && reported === 0 ? EXIT_GREEN : EXIT_BLOCK;
    }

    case 'error':
    case 'canceled':
      return EXIT_ERROR;

    default:
      // queued, waiting, inProgress - still running
      return null;
  }
}

/**
 * PRINTING, not deciding. Emits the closer for a build {@link decideTerminalState}
 * has already declared terminal - called from exactly one place in the wait
 * loop, on the single read that actually closes (after the settle-confirm has
 * passed for a finished build; immediately for an errored or canceled one,
 * which has no settle to wait for). Re-reads the same `build` the decision was
 * made from rather than taking a flag, so there is nothing here that can print
 * the wrong words for the exit code just decided.
 */
function printTerminalCloser(
  build: NonNullable<BuildStatusResponse['getBuildStatus']>,
  howItRan: HowTheTestRan,
  rowsNotYetShown: PlatformRow[]
): void {
  const { runStatus, viewStatusesCount, diffScopeInfo } = build;
  const { testIndex } = howItRan;

  if (runStatus === 'error' || runStatus === 'canceled') {
    // A failed step, like any other: directly under the steps, the help block closing the run.
    emit({ kind: 'verdict-run-errored', runStatus, runError: build.runError, testIndex });
    emit({ kind: 'blank-line' });
    return;
  }

  if (routesThroughSparseVerdict(build)) {
    printSparseCloser(build, howItRan, rowsNotYetShown);
    return;
  }

  // runStatus is 'finished' here (the only other caller-guaranteed terminal
  // state), with viewStatusesCount already confirmed present by the decision.
  const { unreviewed, reported } = viewStatusesCount!;

  const serverBypassReason =
    unreviewed === 0 && reported === 0 ? getServerBypassReason(diffScopeInfo) : undefined;
  if (serverBypassReason) {
    // Server-bypassed build (SHERLO-1952): there is nothing to review (zero new screenshots) and
    // the review page cannot render this build shape yet (SHERLO-1974), so the run ends on its one
    // finished step and points at no URL.
    printServerBypassCloser(serverBypassReason, testIndex, rowsNotYetShown);
    return;
  }

  printTestFinished(howItRan);
  emit({ kind: 'blank-line' });
  if (unreviewed === 0 && reported === 0) {
    // No verbatim reason: the generic green. Covers the forward-compat degrade of a
    // counts-bypassed build whose poll carries no prose, and every ordinary green build.
    emit({ kind: 'verdict-passed' });
  } else {
    emit({
      kind: 'verdict-review-required',
      screens: build.stories ?? undefined,
      counts: { unreviewed, reported },
    });
  }
  emit({ kind: 'blank-line' });
}

/** Which test the wait closed on, and how long it ran when the wait saw it start. */
type HowTheTestRan = { testIndex: number; secondsItRan?: number };

/** The wait's own finished step, printed where its spinner was (../render/segments `test-finished`). */
function printTestFinished({ testIndex, secondsItRan }: HowTheTestRan): void {
  emit({ kind: 'test-finished', testIndex, seconds: secondsItRan });
}

/**
 * PRINTING half of the finished branch for a build the server marked
 * `showsOnlyBranchChanges` - the sparse-build redesign's CLI half, and the
 * ONLY new closing path in this file. The DECIDING half lives inline in
 * {@link decideTerminalState}, which calls {@link decideSparseBuildVerdict}
 * directly for just its exit code; this function re-derives the same verdict
 * to emit its words, called only once {@link decideTerminalState} has already
 * confirmed the build terminal.
 *
 * It emits the same frame every closer in this loop has always sat inside (one
 * blank line above, one below), and inside it either the sparse verdict's
 * segments or - when the build is one the SERVER closed without a device run -
 * that build's existing compact closer, carrying the server's own prose. The
 * bypass keeps precedence deliberately: it is a MORE specific green than
 * `noChanges`, it already ships, and a project that opted into sparse builds
 * must not lose the one sentence the CLI has that explains why nothing ran.
 * Its exit code is `EXIT_GREEN` on both paths, so precedence changes the words
 * and never the verdict.
 *
 * A `null` verdict here (the counts race the ungated branch also guards
 * against) is unreachable in practice - the caller only ever reaches this
 * function after {@link decideTerminalState} decided the SAME build terminal
 * off the SAME check - and is treated as "print nothing" rather than assumed
 * impossible, because a false closer is the one answer that must never be
 * reachable by accident.
 */
function printSparseCloser(
  build: NonNullable<BuildStatusResponse['getBuildStatus']>,
  howItRan: HowTheTestRan,
  rowsNotYetShown: PlatformRow[]
): void {
  const verdict = decideSparseBuildVerdict(build);
  if (!verdict) {
    return;
  }

  const serverBypassReason = getServerBypassReason(build.diffScopeInfo);
  if (verdict.exitCode === EXIT_GREEN && serverBypassReason) {
    printServerBypassCloser(serverBypassReason, howItRan.testIndex, rowsNotYetShown);
    return;
  }

  printTestFinished(howItRan);
  emit({ kind: 'blank-line' });
  for (const segment of verdict.segments) {
    emit(namingTheTest(segment, howItRan.testIndex));
  }
  emit({ kind: 'blank-line' });
}

/** The sparse verdict's "nothing was recorded" section names the test it is about. */
function namingTheTest(segment: TranscriptSegment, testIndex: number): TranscriptSegment {
  return segment.kind === 'verdict-nothing-recorded' ? { ...segment, testIndex } : segment;
}

/**
 * Platforms consulted in this fixed order when picking the reason line for a
 * server-bypassed build. The order is explicit (not JSON key order) so the
 * output is deterministic; android is first only to match the field-declaration
 * order of DiffScopePlatformsInfo in the API schema. A server-bypassed build is
 * bypassed for the suite as a whole, so every present platform's reason
 * describes the same "nothing changed" verdict - we surface the first one that
 * carries prose and never merge or reformat it.
 */
const PLATFORM_REASON_ORDER = ['android', 'ios'] as const;

/**
 * The counts-only signature of a server-bypassed build (SHERLO-1959): zero
 * captures with at least one inherited snapshot. This is the SINGLE detection of
 * the bypass shape - it needs only the two counts, which are present both on the
 * poll response here AND on the openBuild response (BuildFragment selects
 * `capturedSnapshotCount`/`inheritedSnapshotCount` but NOT the per-platform
 * `reason`). testBundled calls this at openBuild time to decide whether to
 * withhold the review URL (both modes) and suppress the "waiting"/"finished"
 * lines (--wait only) for a build that never ran on a device (SHERLO-1952). The
 * prose reason is not needed for that decision and is not available at openBuild
 * anyway; it is read from a getBuildStatus response - the --wait poll's, or the
 * single non-wait call in {@link fetchServerBypassReason} - by
 * {@link getServerBypassReason}.
 */
export function isServerBypassed(
  diffScopeInfo:
    | { capturedSnapshotCount?: number; inheritedSnapshotCount?: number }
    | null
    | undefined
): boolean {
  return (
    diffScopeInfo?.capturedSnapshotCount === 0 && (diffScopeInfo?.inheritedSnapshotCount ?? 0) > 0
  );
}

/**
 * When the API server-bypassed the build (SHERLO-1959) - it already knew every
 * story's screenshot could be inherited from the previous build, so it closed
 * the build without ever handing it to the runner - return the plain-prose
 * reason line to print in the closing message; otherwise return undefined so the
 * caller falls back to the generic "All stories passed" line.
 *
 * Recognized off the SAME shape closeBuild persists (see the API unit test
 * closeAsZeroCaptureNoOp.unit.test.ts): the {@link isServerBypassed} counts plus
 * a per-platform prose `reason`. The reason is taken from
 * `platforms.<platform>.reason` - the reviewed prose the CLI prints
 * verbatim - never from `fullCaptureTriggerReason`, which is a machine enum
 * code and is always absent on a bypassed (partial-capture) build anyway
 * (SHERLO-1963). An older API response with no `diffScopeInfo` (or no
 * `platforms.<platform>.reason`) yields undefined and degrades gracefully.
 */
function getServerBypassReason(
  diffScopeInfo: NonNullable<BuildStatusResponse['getBuildStatus']>['diffScopeInfo']
): string | undefined {
  if (!isServerBypassed(diffScopeInfo)) {
    return undefined;
  }

  for (const platform of PLATFORM_REASON_ORDER) {
    const reason = diffScopeInfo?.platforms?.[platform]?.reason;
    if (reason) {
      return reason;
    }
  }

  return undefined;
}

/**
 * The compact closer for a server-bypassed build (SHERLO-1952): the test's row, finished, with the
 * server's verbatim reason, under the platforms' rows no test row has shown yet (none for `sherlo
 * view`). No URL - the build has nothing to review and the review page cannot render this shape yet
 * (SHERLO-1974). One definition, used by BOTH the --wait terminal path here and the non-wait closer
 * (../commands/test/closeTheRun), so the two modes print identical text.
 */
export function printServerBypassCloser(
  reason: string,
  testIndex: number,
  rowsNotYetShown: PlatformRow[]
): void {
  emit({
    kind: 'verdict-server-bypassed',
    reason,
    testIndex,
    rowsAbove: rowsAbove(rowsNotYetShown),
  });
}

/**
 * Read a build's status ONCE - the read `sherlo view` is built on, and the same
 * query the `--wait` loop polls (`fetchBuildStatus`), so there is one wire shape
 * and one document to keep in step.
 *
 * `null` means the build does not exist, which is a real answer a caller acts
 * on. EVERY OTHER FAILURE THROWS, unlike {@link fetchServerBypassReason}: that
 * one is a cosmetic closing query on a run that already succeeded, while this
 * one IS the command's answer - a `view` that swallowed a refused credential
 * would print nothing and exit as though all was well.
 */
export async function readBuildStatus({
  token,
  buildIndex,
  projectIndex,
  teamId,
}: {
  token: string;
  buildIndex: number;
  projectIndex: number;
  teamId: string;
}): Promise<BuildStatus | null> {
  return serverCalls().getBuildStatus({
    token,
    buildIndex,
    projectIndex,
    teamId,
    boundedRead: true,
  });
}

/**
 * Fetch the server's verbatim bypass reason with ONE getBuildStatus call against
 * the already-closed build - the non-wait counterpart to the --wait poll, using
 * the SAME query/wire shape (`fetchBuildStatus`) so there is one place to change
 * if the shape moves. The build is already terminal server-side, so this returns
 * immediately; it is a single read, not a wait.
 *
 * Best-effort by contract (SHERLO-1952 guard rail): any failure - network, auth,
 * timeout, malformed response, or simply no per-platform reason - degrades to
 * `undefined`, and the caller falls back to today's review URL. A build that
 * succeeded must never be reported failed over this cosmetic closing query, so
 * nothing here is allowed to throw.
 */
export async function fetchServerBypassReason({
  token,
  buildIndex,
  projectIndex,
  teamId,
}: {
  token: string;
  buildIndex: number;
  projectIndex: number;
  teamId: string;
}): Promise<string | undefined> {
  try {
    const build = await serverCalls().getBuildStatus({
      token,
      buildIndex,
      projectIndex,
      teamId,
      boundedRead: true,
    });
    return getServerBypassReason(build?.diffScopeInfo);
  } catch {
    return undefined;
  }
}

/** Let time pass between polls - a real timer on a live run, nothing at all on a posed one (the pose's clock is the time). */
function sleep(ms: number): Promise<void> {
  return surroundings().sleep(ms);
}

/**
 * Replaces Node's default "exit immediately" SIGINT behavior for the duration
 * of the wait: the returned promise resolves on the first Ctrl-C, letting the
 * poll loop stop cleanly and exit with {@link EXIT_SIGINT}. `cleanup` restores
 * the default by removing the listener.
 */
function createSigintSignal(): { promise: Promise<void>; cleanup: () => void } {
  let resolveSignal: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveSignal = resolve;
  });

  const handler = () => resolveSignal();
  process.once('SIGINT', handler);

  return { promise, cleanup: () => process.off('SIGINT', handler) };
}

export default waitForBuildResult;
