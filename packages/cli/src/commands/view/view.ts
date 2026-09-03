/**
 * `sherlo view [build]` - a read-only window onto a build.
 *
 * It opens nothing, uploads nothing and changes nothing. One read of one build's
 * status, printed: which build, what the runner did, how the review stands, the
 * check's own sentence about it, and the link. With `--wait` it hands over to
 * the SHIPPED wait loop (helpers/waitForBuildResult) and exits under that loop's
 * exit-code contract, so watching a build somebody else opened is the same
 * experience - and the same exit codes - as watching your own.
 *
 * AUTH AND CONFIG ARE RESOLVED EXACTLY AS `sherlo test` RESOLVES THEM: the same
 * `getValidatedCommandParams`, the same config file, the same token rules. One
 * consequence rides along and is worth stating rather than discovering - that
 * path also validates the config's `devices` list, so a project whose config is
 * broken in that way is refused here too. Sharing the road beats forking it: a
 * second token/config resolution is a second set of rules to keep in step.
 *
 * ------------------------------------------------------------------------
 * WHY THE BUILD IS AN ARGUMENT AND NOT A DEFAULT.
 *
 * `sherlo view` with no index should mean "the latest build", and `--branch
 * <name>` should mean "the newest build on that branch". NEITHER IS BUILT, and
 * not for want of trying: a project token authorizes exactly one build read -
 * `getBuildStatus`, which answers about the one index it is given. Nothing it
 * can reach names a project's latest build, and nothing indexes builds by
 * branch. The one operation that does carry a `nextBuildIndex` is
 * `getNextBuildInfo`, and it is not an option here: it is the mutation a run
 * calls when it is ABOUT TO UPLOAD - it mints presigned upload urls and is
 * refused outright for a team that may not start another test. A read-only
 * command built on it would fail for exactly the people most likely to be
 * looking at old builds instead of making new ones.
 *
 * So the command asks for the index and says why, rather than guessing one or
 * borrowing a write path to find it. When a read that names a project's latest
 * build exists, the default is a few lines here and no change anywhere else.
 */
import {
  getAppBuildUrl,
  getTokenParts,
  getValidatedCommandParams,
  printResultsUrl,
  printSherloIntro,
  reporting,
  throwError,
  waitForBuildResult,
} from '../../helpers';
import parseWaitTimeout from '../../helpers/parseWaitTimeout';
import { emit } from '../../helpers/transcriptSink';
import { readBuildStatus } from '../../helpers/waitForBuildResult';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';
import { printBuildView } from './printBuildView';

async function view(
  buildArgument: string | undefined,
  passedOptions: Options<THIS_COMMAND>
): Promise<void> {
  printSherloIntro();

  const buildIndex = resolveBuildIndex(buildArgument);

  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: false }
  );

  const { projectIndex, teamId } = getTokenParts(commandParams.token);

  reporting.setTag('build_index', String(buildIndex));

  // ONE read before anything is printed, even on the `--wait` road. The loop
  // would answer "Build not found, retrying..." for the whole timeout on a
  // mistyped index; reading first turns that into an immediate refusal, and the
  // second read the loop then makes is one poll of a build that exists.
  const build = await readBuildStatus({
    token: commandParams.token,
    buildIndex,
    projectIndex,
    teamId,
  });

  if (!build) {
    throwError({
      message:
        `Build #${buildIndex} does not exist in this project. ` +
        'Check the index (it is the `b=` value of a build URL) and the token.',
    });
  }

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });
  const showDetails = commandParams.metadata === true;

  if (commandParams.wait) {
    // The verdict belongs to the wait loop from here on, so the tally and the
    // status sentence are NOT printed first: they would describe a build that is
    // still moving, and be contradicted by the closer a minute later.
    emit({ kind: 'build-view-header', buildIndex, runStatus: build.runStatus });
    emit({ kind: 'blank-line' });
    printResultsUrl(url);

    const exitCode = await waitForBuildResult({
      token: commandParams.token,
      buildIndex,
      projectIndex,
      teamId,
      waitTimeoutMinutes: parseWaitTimeout(commandParams.waitTimeout),
      metadata: showDetails ? {} : undefined,
    });

    // --wait mode: the exit code IS the contract. Flush telemetry then exit.
    await reporting.flush().finally(() => {
      process.exit(exitCode);
    });

    // Unreachable - the line above ends the process. Written out so a reader
    // never has to prove that to know the block below is not printed too.
    return;
  }

  printBuildView({ build, buildIndex, url, showDetails });
}

export default view;

/* ========================================================================== */

/**
 * The build to look at, or a refusal that says what to pass and why there is no
 * default - see this file's header for the read that does not exist.
 */
function resolveBuildIndex(buildArgument: string | undefined): number {
  if (buildArgument === undefined) {
    throwError({
      message:
        '`sherlo view` needs the build to look at, e.g. `sherlo view 7`.\n' +
        '  A build index is the `b=` value of its URL, which `sherlo test` prints when it\n' +
        '  opens a build. Looking one up by "latest" or by branch is not something this\n' +
        '  command can do yet.',
    });
  }

  const buildIndex = Number(buildArgument);

  if (!Number.isInteger(buildIndex) || buildIndex < 1) {
    throwError({
      message: `\`${buildArgument}\` is not a build index. Pass the build's number, e.g. \`sherlo view 7\`.`,
    });
  }

  return buildIndex;
}
