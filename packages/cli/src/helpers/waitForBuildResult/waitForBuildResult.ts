import sdkClient from '@sherlo/sdk-client';
import createPollingBuildStatusSource from './createPollingBuildStatusSource';
import runWaitLoop from './runWaitLoop';

async function waitForBuildResult({
  client,
  teamId,
  projectIndex,
  buildIndex,
  url,
  maxWaitTime,
}: {
  client: ReturnType<typeof sdkClient>;
  teamId: string;
  projectIndex: number;
  buildIndex: number;
  url: string;
  /** Overrides the default wait timeout (in minutes) for this run. */
  maxWaitTime?: number;
}): Promise<void> {
  const statusSource = createPollingBuildStatusSource({ client, teamId, projectIndex, buildIndex });

  await runWaitLoop({ statusSource, url, maxWaitTimeMinutes: maxWaitTime });
}

export default waitForBuildResult;
