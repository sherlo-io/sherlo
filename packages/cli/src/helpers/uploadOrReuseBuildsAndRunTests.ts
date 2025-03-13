import SDKApiClient from '@sherlo/sdk-client';
import chalk from 'chalk';
import { EXPO_UPDATE_COMMAND, LOCAL_BUILDS_COMMAND } from '../constants';
import { CommandParams, ExpoUpdateData } from '../types';
import getAppBuildUrl from './getAppBuildUrl';
import getTokenParts from './getTokenParts';
import getValidatedBinariesInfoAndNextBuildIndex from './getValidatedBinariesInfoAndNextBuildIndex';
import logBuildIntroMessage from './logBuildIntroMessage';
import logResultsUrl from './logResultsUrl';
import handleClientError from './handleClientError';
import getBuildRunConfig from './getBuildRunConfig';
import getGitInfo from './getGitInfo';
import uploadOrLogBinaryReuse from './uploadOrLogBinaryReuse';

async function uploadOrReuseBuildsAndRunTests({
  commandParams,
  expoUpdateData,
}: {
  commandParams: CommandParams;
  expoUpdateData?: ExpoUpdateData;
}): Promise<{ url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = SDKApiClient({ authToken: apiToken });

  const { binariesInfo, nextBuildIndex } = await getValidatedBinariesInfoAndNextBuildIndex({
    client,
    command: expoUpdateData ? EXPO_UPDATE_COMMAND : LOCAL_BUILDS_COMMAND,
    commandParams,
    projectIndex,
    teamId,
  });

  logBuildIntroMessage({ commandParams, nextBuildIndex });

  await uploadOrLogBinaryReuse({
    binariesInfo,
    projectRoot: commandParams.projectRoot,
    android: commandParams.android,
    ios: commandParams.ios,
  });

  if (expoUpdateData) {
    logExpoUpdateData(expoUpdateData);
  }

  const { build } = await client
    .openBuild({
      sdkVersion: binariesInfo.sdkVersion,
      teamId,
      projectIndex,
      binaryHashes: {
        android: binariesInfo.android?.hash,
        ios: binariesInfo.ios?.hash,
      },
      buildRunConfig: getBuildRunConfig({
        commandParams,
        binaryS3Keys: {
          android: binariesInfo.android?.s3Key,
          ios: binariesInfo.ios?.s3Key,
        },
        expoUpdateData,
      }),
      gitInfo: commandParams.gitInfo ?? getGitInfo(commandParams.projectRoot),
    })
    .catch(handleClientError);

  const buildIndex = build.index;

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  logResultsUrl(url);

  return { url };
}

export default uploadOrReuseBuildsAndRunTests;

/* ========================================================================== */

function logExpoUpdateData(expoUpdateData: ExpoUpdateData) {
  console.log(
    `🔄 ${chalk.bold('Expo Update')}\n` +
      `└─ message: ${expoUpdateData.message}\n` +
      `└─ created: ${chalk.blue(expoUpdateData.timeAgo)}\n` +
      `└─ author: ${chalk.blue(expoUpdateData.author)}\n` +
      `└─ branch: ${chalk.blue(expoUpdateData.branch)}\n`
  );
}
