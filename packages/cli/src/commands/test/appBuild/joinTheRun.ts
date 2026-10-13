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
import { getPlatformsToTest, handleClientError } from '../../../helpers';
import { emit } from '../../../helpers/transcriptSink';
import { type OpenBuildRequest, serverCalls } from '../../../seams/serverCalls';
import { recordPlatformRow, takeRowsAbove } from '../platformRows';

/** Join the run this job's CI run shares, and say what the run is waiting for. */
export async function joinTheRun({
  token,
  joinKey,
  platform,
  request,
}: {
  token: string;
  joinKey: string;
  platform: Platform;
  /** Everything an `openBuild` of this job would have been sent. */
  request: OpenBuildRequest;
}): Promise<{ build: { index: number }; waitingFor: Platform[] }> {
  const { build, waitingFor, startedRun } = await serverCalls()
    .joinBuild({ token, joinKey, platform, ...request })
    .catch((error) => handleClientError(error, token));

  if (waitingFor.length > 0) {
    emit({
      kind: 'run-waits-for-builds',
      buildIndex: build.index,
      waitingFor: { otherJob: waitingFor[0] },
      rowsAbove: takeRowsAbove(),
    });
    return { build, waitingFor };
  }

  // The last job in starts the test with the ordinary Started row. This job knows only its own
  // platform, so the whole test's devices and capture come from the service's answer, and every
  // other platform of the test arrived from the other job.
  const otherPlatforms = getPlatformsToTest(startedRun?.devices ?? []).filter(
    (otherPlatform) => otherPlatform !== platform
  );
  for (const otherPlatform of otherPlatforms) {
    recordPlatformRow({ platform: otherPlatform, appBuild: 'arrived-from-other-job' });
  }
  emit({ kind: 'test-started', buildIndex: build.index, ...startedRun, rowsAbove: takeRowsAbove() });

  return { build, waitingFor };
}
