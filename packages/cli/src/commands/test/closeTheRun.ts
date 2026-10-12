/**
 * HOW EVERY TEST THIS COMMAND STARTED ENDS ON SCREEN (epic sherlo-test-builds-apps: `sherlo test`
 * in init's grammar). One place, so the staged road, the build road (the push spine,
 * ../../helpers/uploadOrReuseBuildsAndRunTests), the sim road and an EAS run end the same way, and
 * on ONE section, with the review link printed once, last:
 *
 *   - with `--wait`, on the verdict (a section, see ../../render/verdictCloser) and the review link
 *     under it - the line the GitHub Action reads (actions/lib/cliOutputs.mjs) - and the wait's exit
 *     code. A wait that stopped before the verdict (it ran out, or Ctrl-C) ends like a run that did
 *     not wait; a test that failed ends on its failure and the help block, with no link;
 *   - without it, on init's `👉 Next step` section: review the test, with the command that waits
 *     for its verdict, because an agent cannot click the link - and, on a person's terminal while
 *     the project has no CI token, a second step: run Sherlo on every pull request;
 *   - a test the server closed without a device run ends on its one finished step, with no link -
 *     there is nothing to review (SHERLO-1952).
 *
 * Every road passes the `openBuild` answer's `hasCiToken`, so a project's very first test - which
 * builds the app - suggests pull request tests too.
 */
import { reporting, waitForBuildResult } from '../../helpers';
import { EXIT_ERROR, EXIT_SIGINT, EXIT_TIMEOUT } from '../../helpers/exitCodes';
import parseWaitTimeout from '../../helpers/parseWaitTimeout';
import { emit } from '../../helpers/transcriptSink';
import { fetchServerBypassReason, printServerBypassCloser } from '../../helpers/waitForBuildResult';
import type { CommandParams } from '../../types';
import { printsToATerminal } from '../shared/terminal';
import type { THIS_COMMAND } from './constants';

export async function closeTheRun({
  commandParams,
  buildIndex,
  url,
  serverBypassed = false,
  endsOnNextStep = true,
  hasCiToken,
}: {
  commandParams: CommandParams<THIS_COMMAND>;
  buildIndex: number;
  url: string;
  /**
   * Whether the project has a CI token, as the server's `openBuild` answer said: false, and a
   * person's run suggests running Sherlo on every pull request. Absent means unknown: nothing is
   * suggested.
   */
  hasCiToken?: boolean;
  /** The server closed the test without a device run: nothing to review, so no link. */
  serverBypassed?: boolean;
  /**
   * False for a split job whose test starts in the other job: its link stands alone, and the
   * next step is the other job's to print.
   */
  endsOnNextStep?: boolean;
}): Promise<void> {
  const { token, projectIndex, teamId, fromSavedLogin } = commandParams.credential;

  if (commandParams.wait) {
    const exitCode = await waitForBuildResult({
      token,
      fromSavedLogin,
      buildIndex,
      projectIndex,
      teamId,
      waitTimeoutMinutes: parseWaitTimeout(commandParams.waitTimeout),
      serverBypassed,
      // This run started the test just now, so the wait's own time is how long the test ran.
      sawTheTestStart: true,
    });

    if (!serverBypassed) endAfterTheWait({ exitCode, testIndex: buildIndex, url });

    // --wait mode: the exit code IS the contract. Flush telemetry then exit.
    await reporting.flush().finally(() => process.exit(exitCode));
    return;
  }

  if (serverBypassed) {
    await printBypassedCloser({ token, buildIndex, projectIndex, teamId, url });
    return;
  }

  if (!endsOnNextStep) {
    emit({ kind: 'results-url', url });
    return;
  }

  // A PERSON WHOSE PROJECT HAS NO CI TOKEN hears about pull request tests here (operator, 2026-10-12,
  // with epic init-for-agents: setup no longer asks for CI). A log never does: a CI job already
  // runs on CI, and an agent's shell is told by setup.
  const suggestsPullRequests = hasCiToken === false && printsToATerminal();
  emit({
    kind: 'results-url',
    url,
    testIndex: buildIndex,
    ...(suggestsPullRequests ? { projectWithNoCiToken: { teamId, projectIndex } } : {}),
  });
}

/**
 * The link a wait ends on, by how the wait ended - shared by `sherlo test --wait` and
 * `sherlo view <n> --wait`, so both end the same way:
 *
 *   - a verdict (exit 0 or 1): the link alone, under the verdict section;
 *   - the waiting stopped while the test runs on (exit 3, or 130 on Ctrl-C): the `👉 Next step`
 *     section, with the command that goes on waiting;
 *   - the test failed (exit 2): nothing - the run ends on its failure and the help block.
 */
export function endAfterTheWait({
  exitCode,
  testIndex,
  url,
}: {
  exitCode: number;
  testIndex: number;
  url: string;
}): void {
  if (exitCode === EXIT_ERROR) return;

  const waitingStopped = exitCode === EXIT_TIMEOUT || exitCode === EXIT_SIGINT;
  emit(waitingStopped ? { kind: 'results-url', url, testIndex } : { kind: 'results-url', url });
}

/**
 * Non-wait closer for a server-bypassed build (SHERLO-1952). Sources the server's
 * verbatim reason with a single getBuildStatus read (the build is already closed,
 * so it returns immediately - a read, not a wait) and prints the finished step.
 *
 * Best-effort by ruling: if the reason cannot be fetched (network, auth, timeout,
 * older API with no per-platform prose), fall back to the review link rather than
 * a step with nothing after the colon. A working link beats silence, and a build
 * that succeeded is never reported failed over this cosmetic query
 * (fetchServerBypassReason swallows every error).
 */
async function printBypassedCloser({
  token,
  buildIndex,
  projectIndex,
  teamId,
  url,
}: {
  token: string;
  buildIndex: number;
  projectIndex: number;
  teamId: string;
  url: string;
}): Promise<void> {
  const reason = await fetchServerBypassReason({ token, buildIndex, projectIndex, teamId });

  // The same finished step the wait loop ends a bypassed test on, naming the test.
  if (reason) {
    printServerBypassCloser(reason, buildIndex);
  } else {
    emit({ kind: 'results-url', url });
  }
}
