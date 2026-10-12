/**
 * HOW EVERY TEST THIS COMMAND STARTED ENDS ON SCREEN (epic sherlo-test-builds-apps, Direction C:
 * `sherlo test` in init's grammar). One place, so the staged road, the sim road and an EAS run end
 * the same way:
 *
 *   - with `--wait`, on the verdict (a section, see ../../render/verdictCloser) and the review link
 *     under it, LAST - the line the GitHub Action reads (actions/lib/cliOutputs.mjs) - and the
 *     wait's exit code;
 *   - without it, on init's `👉 Next step` section: review the test, with the command that waits
 *     for its verdict here, because an agent cannot click the link;
 *   - a test the server closed without a device run ends on its one finished step, with no link -
 *     there is nothing to review (SHERLO-1952).
 *
 * PLAN-LAYER DEBT, NAMED: the push spine (../../helpers/uploadOrReuseBuildsAndRunTests) ends the
 * build road its own way - the link before the wait, and no next step - because it is outside
 * what plan may edit. The build task ends it here too.
 */
import { reporting, waitForBuildResult } from '../../helpers';
import type { GitInfo } from '../../helpers/getGitInfo';
import parseWaitTimeout from '../../helpers/parseWaitTimeout';
import { emit } from '../../helpers/transcriptSink';
import {
  fetchServerBypassReason,
  printServerBypassCloser,
} from '../../helpers/waitForBuildResult';
import type { CommandParams } from '../../types';
import type { THIS_COMMAND } from './constants';

export async function closeTheRun({
  commandParams,
  buildIndex,
  url,
  serverBypassed = false,
  gitInfo,
  endsOnNextStep = true,
}: {
  commandParams: CommandParams<THIS_COMMAND>;
  buildIndex: number;
  url: string;
  /** The server closed the test without a device run: nothing to review, so no link. */
  serverBypassed?: boolean;
  /** The git identity this run sent at openBuild, for `--metadata`'s details block. */
  gitInfo?: GitInfo;
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
      // --metadata: the details block, carrying the git identity THIS run composed and sent at
      // openBuild - `getBuildStatus` does not return it, so the only honest source is the value
      // that created the build.
      metadata: commandParams.metadata === true && gitInfo ? { git: gitInfo } : undefined,
    });

    if (!serverBypassed) emit({ kind: 'results-url', url });

    // --wait mode: the exit code IS the contract. Flush telemetry then exit.
    await reporting.flush().finally(() => process.exit(exitCode));
    return;
  }

  if (serverBypassed) {
    await printBypassedCloser({ token, buildIndex, projectIndex, teamId, url });
    return;
  }

  emit(endsOnNextStep ? { kind: 'results-url', url, testIndex: buildIndex } : { kind: 'results-url', url });
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

  if (reason) {
    printServerBypassCloser(reason);
  } else {
    emit({ kind: 'results-url', url });
  }
}
