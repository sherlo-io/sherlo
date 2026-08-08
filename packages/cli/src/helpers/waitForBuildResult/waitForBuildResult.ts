import sdkClient from '@sherlo/sdk-client';
import createPollingBuildStatusSource from './createPollingBuildStatusSource';
import runWaitLoop from './runWaitLoop';

async function waitForBuildResult({
  client,
  teamId,
  projectIndex,
  buildIndex,
  url,
}: {
  client: ReturnType<typeof sdkClient>;
  teamId: string;
  projectIndex: number;
  buildIndex: number;
  url: string;
}): Promise<void> {
  const statusSource = createPollingBuildStatusSource({ client, teamId, projectIndex, buildIndex });

  await runWaitLoop({ statusSource, url });
}

export default waitForBuildResult;
