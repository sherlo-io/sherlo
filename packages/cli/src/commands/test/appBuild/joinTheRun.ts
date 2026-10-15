/**
 * ONE JOB OF A SPLIT CI RUN JOINS THE RUN - in place of opening a run of its own.
 *
 * `sherlo test --platform <p>` in CI builds and uploads one platform, and the server joins it with
 * the other job's platform into ONE test and ONE check on the commit (../appBuild/ciRun names the
 * key). The run starts when the last platform is in, so this job's test row either says it waits
 * for the other build or says the run is starting, under the platforms' rows - and both go out right
 * after the server answers, before the run's link, as every other line about the run does.
 *
 * Used on both roads a job can take: the standard road after it built its platform, and the staged
 * road when its platform needed no build at all.
 */
import type { Platform } from '@sherlo/api-types';
import { getPlatformsToTest, handleClientError, throwError } from '../../../helpers';
import { emit } from '../../../helpers/transcriptSink';
import type { PlatformRow } from '../../../render/runRows';
import type { Config } from '../../../types';
import {
  type OpenBuildRequest,
  type PushFactsPlatform,
  serverCalls,
} from '../../../seams/serverCalls';
import { rowsAbove, printPlatformRowInALog } from '../platformRows';

/** The service's refusal when this job built another commit than the run it joins. */
export const JOIN_MISMATCH_ERROR = 'resolvers:mutations:joinBuild:joinMismatch';

/** Join the run this job's CI run shares, and say what the run is waiting for. */
export async function joinTheRun({
  token,
  joinKey,
  platform,
  request,
  pushFacts,
  platformRows,
  testDevices,
}: {
  token: string;
  joinKey: string;
  platform: Platform;
  /** Everything an `openBuild` of this job would have been sent. */
  request: OpenBuildRequest;
  /** What only the push knows about this job's own platform (./pushFacts). */
  pushFacts?: PushFactsPlatform;
  /**
   * This job's own platform's row: built here, or reused from a stored app build. A sim world has
   * no app build, and passes none.
   */
  platformRows: PlatformRow[];
  /** The config's whole device list (`CommandParams.testDevices`), used when the answer carries none. */
  testDevices?: Config['devices'];
}): Promise<{ build: { index: number }; waitingFor: Platform[] }> {
  const { build, waitingFor, startedRun } = await serverCalls()
    // This job's own platform's facts, never the whole push's that an `openBuild` request carries.
    .joinBuild({ ...request, token, joinKey, platform, pushFacts })
    .catch((error) => {
      if (error.message === JOIN_MISMATCH_ERROR) refuseJoinMismatch();
      return handleClientError(error, token);
    });

  if (waitingFor.length > 0) {
    emit({
      kind: 'run-waits-for-builds',
      buildIndex: build.index,
      waitingFor: { otherJob: waitingFor[0] },
      rowsAbove: rowsAbove(platformRows),
    });
    return { build, waitingFor };
  }

  // The last job in starts the test with the ordinary Started row. This job knows only its own
  // platform, so the whole test's devices and capture come from the service's answer, and every
  // other platform of the test arrived from the other job.
  const arrivedRows = getPlatformsToTest(startedRun?.devices ?? testDevices ?? [])
    .filter((otherPlatform) => otherPlatform !== platform)
    .map((otherPlatform) =>
      printPlatformRowInALog({ platform: otherPlatform, appBuild: 'arrived-from-other-job' })
    );
  emit({
    kind: 'test-started',
    buildIndex: build.index,
    ...startedRun,
    rowsAbove: rowsAbove([...platformRows, ...arrivedRows]),
  });

  return { build, waitingFor };
}

/** The service refused the join: the run was opened on another commit than this job's. */
function refuseJoinMismatch(): never {
  return throwError({
    message:
      'Both jobs of one CI run must build the same commit\n\n' +
      'This job joined a run opened on another commit. Make sure both jobs check out the same commit.',
  });
}
