import throwError from '../../helpers/throwError';
import { emit } from '../../helpers/transcriptSink';
import type { ViewJson } from '../../render/buildView';
import type { BuildStatus } from '../../helpers/buildStatusRequest';
import { whatTheBuildHolds } from '../../helpers/waitForBuildResult';

/**
 * EVERYTHING `sherlo view` PRINTS about a build it has already read - and it
 * performs no read of its own.
 *
 * Split out of ./view for one reason: it makes the command's transcript
 * renderable. A `view` run does exactly one thing to the outside world - it asks
 * the backend for one build's status - so a producer that supplies that ONE
 * answer and calls this function is running the shipped print path, not a
 * re-implementation of it (see ./renderViewTranscript). Nothing here awaits,
 * fetches, or reads the process.
 *
 * TWO DISTINCT OUTPUTS, NOT ONE OUTPUT WITH AN OPTIONAL TAIL.
 *
 * `--json` prints ONLY the record (see render/buildView's ViewJson) - no
 * header, no colour, no url line - because it is meant to be piped and parsed,
 * the way `gh ... --json` is, and mixing it with the human header would make
 * every consumer re-find the JSON inside prose. Without `--json` the command
 * prints for a person: which test, the tally, the verdict section `--wait` ends
 * with, the per-story table (when the test has stories), then the link.
 */
export function printBuildView({
  build,
  buildIndex,
  url,
  printJson,
}: {
  build: BuildStatus;
  buildIndex: number;
  url: string;
  /** `--json`: print the record instead of the human view. */
  printJson: boolean;
}): void {
  if (printJson) {
    emit({ kind: 'build-view-json', json: viewJsonOf(build, buildIndex) });
    return;
  }

  emit({ kind: 'build-view-header', buildIndex, runStatus: build.runStatus });

  // A build that has not written its counts yet prints no tally rather than four
  // zeros, which would read as a finished build that recorded nothing.
  if (build.viewStatusesCount) {
    emit({ kind: 'build-view-tally', counts: build.viewStatusesCount });
  }

  // A test still running has no verdict yet: it ends on the next step, which carries the link and
  // the command that waits for the verdict - the same ending as a `sherlo test` that did not wait.
  if (isStillRunning(build.runStatus)) {
    emit({ kind: 'results-url', url, testIndex: buildIndex });
    return;
  }

  emit({
    kind: 'build-view-status',
    runStatus: build.runStatus,
    status: build.status,
    counts: build.viewStatusesCount,
    holds: whatTheBuildHolds(build),
  });

  // Absent, not empty: a build with no view rows yet (queued, or errored before
  // any capture) prints no table rather than a header with nothing under it.
  if (build.stories && build.stories.length > 0) {
    emit({ kind: 'blank-line' });
    emit({ kind: 'build-view-stories-table', stories: build.stories });
  }

  emit({ kind: 'blank-line' });
  emit({ kind: 'results-url', url });
}

/** A test that has not ended: queued, waiting for its app builds, or running. */
function isStillRunning(runStatus: string): boolean {
  return !['finished', 'error', 'canceled'].includes(runStatus);
}

/**
 * `sherlo view --json`'s record, lifted off the one build read - every value copied as it arrived,
 * nothing defaulted, derived or filled in, so an absent field stays absent and a `null` stays
 * `null`. Written out rather than spread so a reader sees exactly which of `getBuildStatus`'s
 * fields the record speaks about, in the order it prints them. The two renames are the record's
 * own plain words: `commit` from the frozen `gitInfo` (`sherlo view` opened nothing, so the build's
 * own git identity is the only one it can print), and `runError` with the platform it names.
 */
export function viewJsonOf(build: BuildStatus, buildIndex: number): ViewJson {
  return {
    runStatus: build.runStatus,
    buildIndex,
    commit: build.gitInfo
      ? {
          sha: build.gitInfo.commitHash,
          branch: build.gitInfo.branchName,
          dirty: build.gitInfo.isDirty,
        }
      : undefined,
    showsOnlyBranchChanges: build.showsOnlyBranchChanges,
    mainBranch: build.mainBranch,
    ciRun: build.ciRun,
    runError: build.runError
      ? { code: build.runError, platform: build.runErrorPlatform ?? undefined }
      : undefined,
    devices: build.devices,
    viewStatusesCount: build.viewStatusesCount,
    stories: build.stories,
    diffScope: build.diffScope,
    platforms: build.platforms,
  };
}

/**
 * What `sherlo view` says about a build index the backend does not know, and the
 * end of that run.
 *
 * It lives beside the print path rather than inside ./view for the same reason
 * the print path itself does: it is one of the two things the command can produce
 * from one read, so a producer that renders the command's transcripts has to be
 * able to reach it without dragging in token resolution and config validation.
 */
export function refuseBuildNotFound(buildIndex: number): never {
  throwError({
    message:
      `Test ${buildIndex} does not exist in this project. ` +
      'Check the number (it is the b= value of a Sherlo URL) and the token.',
  });
}

/**
 * The bytes {@link refuseBuildNotFound} puts on stderr, for a caller that wants
 * the refusal's TEXT rather than the refusal.
 *
 * It gets them by letting the refusal happen and reading the message off it, so
 * the label, the colour and the trailing newline all come from the CLI's own
 * error formatter. A second copy of that formatting here is exactly the drift
 * this whole layer exists to rule out.
 */
export function buildNotFoundRefusal(buildIndex: number): string {
  try {
    refuseBuildNotFound(buildIndex);
  } catch (error) {
    return (error as Error).message;
  }
}
