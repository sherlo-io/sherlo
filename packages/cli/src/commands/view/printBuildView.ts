import { buildViewMetadataJson } from '../../helpers/buildDetails';
import printResultsUrl from '../../helpers/printResultsUrl';
import throwError from '../../helpers/throwError';
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
 * TWO DISTINCT OUTPUTS, NOT ONE OUTPUT WITH AN OPTIONAL TAIL (view-metadata,
 * operator ruling 2026-09-03).
 *
 * `--metadata` prints ONLY the JSON contract (see render/buildView's
 * ViewMetadataJson) - no header, no colour, no url line - because it is meant
 * to be piped and parsed, and mixing it with the human header would make every
 * consumer re-find the JSON inside prose. Without `--metadata` the command
 * prints for a person: which build, the tally, the check's own sentence, the
 * per-story table (when the build has stories), then the link.
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
  /** `--metadata`: print the JSON contract instead of the human view. */
  showDetails: boolean;
}): void {
  if (showDetails) {
    emit({ kind: 'build-view-json', json: buildViewMetadataJson(build, buildIndex) });
    return;
  }

  emit({ kind: 'build-view-header', buildIndex, runStatus: build.runStatus });

  // A build that has not written its counts yet prints no tally rather than four
  // zeros, which would read as a finished build that recorded nothing.
  if (build.viewStatusesCount) {
    emit({ kind: 'build-view-tally', counts: build.viewStatusesCount });
  }

  emit({ kind: 'build-view-status', runStatus: build.runStatus, status: build.status });

  // Absent, not empty: a build with no view rows yet (queued, or errored before
  // any capture) prints no table rather than a header with nothing under it.
  if (build.stories && build.stories.length > 0) {
    emit({ kind: 'blank-line' });
    emit({ kind: 'build-view-stories-table', stories: build.stories });
  }

  emit({ kind: 'blank-line' });
  printResultsUrl(url);
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
      `Build #${buildIndex} does not exist in this project. ` +
      'Check the index (it is the `b=` value of a build URL) and the token.',
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
