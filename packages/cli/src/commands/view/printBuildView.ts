import { buildDetailsOf } from '../../helpers/buildDetails';
import printResultsUrl from '../../helpers/printResultsUrl';
import { emit } from '../../helpers/transcriptSink';
import type { BuildStatus } from '../../helpers/waitForBuildResult';

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
 * The order is the order a reader needs it in: WHICH build, then how its review
 * stands, then what that amounts to in the check's own words, then the link, and
 * last - only when asked - the details block.
 */
export function printBuildView({
  build,
  buildIndex,
  url,
  showDetails,
}: {
  build: BuildStatus;
  buildIndex: number;
  url: string;
  /** `--metadata`: append the `── details ──` block. */
  showDetails: boolean;
}): void {
  emit({ kind: 'build-view-header', buildIndex, runStatus: build.runStatus });

  // A build that has not written its counts yet prints no tally rather than four
  // zeros, which would read as a finished build that recorded nothing.
  if (build.viewStatusesCount) {
    emit({ kind: 'build-view-tally', counts: build.viewStatusesCount });
  }

  emit({ kind: 'build-view-status', runStatus: build.runStatus, status: build.status });

  emit({ kind: 'blank-line' });
  printResultsUrl(url);

  if (showDetails) {
    // NO GIT FACTS. `sherlo view` did not open this build, `getBuildStatus` does
    // not return the git info it was opened with, and this checkout's git
    // describes whatever commit happens to be sitting here - which is not the
    // one the build was made from. So the branch rows are absent rather than
    // wrong. See helpers/buildDetails.
    emit({ kind: 'build-details', details: buildDetailsOf(build) });
    emit({ kind: 'blank-line' });
  }
}
