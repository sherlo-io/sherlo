import sdkClient from '@sherlo/sdk-client';
import chalk from 'chalk';
import { EXPO_UPDATE_COMMAND, LOCAL_BUILDS_COMMAND } from '../constants';
import { CommandParams, ExpoUpdateData } from '../types';
import getAppBuildUrl from './getAppBuildUrl';
import getBuildRunConfig from './getBuildRunConfig';
import getGitInfo from './getGitInfo';
import getTokenParts from './getTokenParts';
import getValidatedBinariesInfoAndNextBuildIndex from './getValidatedBinariesInfoAndNextBuildIndex';
import handleClientError from './handleClientError';
import printBuildIntroMessage from './printBuildIntroMessage';
import printResultsUrl from './printResultsUrl';
import uploadOrPrintBinaryReuse from './uploadOrPrintBinaryReuse';

async function uploadOrReuseBuildsAndRunTests({
  commandParams,
  expoUpdateData,
}: {
  commandParams: CommandParams;
  expoUpdateData?: ExpoUpdateData;
}): Promise<{ url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  const { binariesInfo, nextBuildIndex } = await getValidatedBinariesInfoAndNextBuildIndex({
    client,
    command: expoUpdateData ? EXPO_UPDATE_COMMAND : LOCAL_BUILDS_COMMAND,
    commandParams,
    projectIndex,
    teamId,
  });

  printBuildIntroMessage({ commandParams, nextBuildIndex });

  await uploadOrPrintBinaryReuse({
    binariesInfo,
    projectRoot: commandParams.projectRoot,
    android: commandParams.android,
    ios: commandParams.ios,
  });

  if (expoUpdateData) {
    printExpoUpdateData(expoUpdateData);
  }

  const { build } = await client
    .openBuild({
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
      gitInfo: await getGitInfo(commandParams.projectRoot),
      sdkVersion: binariesInfo.sdkVersion,
      message: commandParams.message,
    })
    .catch(handleClientError);

  const buildIndex = build.index;

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  printResultsUrl(url);

  return { url };
}

export default uploadOrReuseBuildsAndRunTests;

/* ========================================================================== */

function printExpoUpdateData(expoUpdateData: ExpoUpdateData) {
  console.log(
    `🔄 ${chalk.bold('Expo Update')}\n` +
      `└─ message: ${expoUpdateData.message}\n` +
      `└─ created: ${chalk.blue(expoUpdateData.timeAgo)}\n` +
      `└─ author: ${chalk.blue(expoUpdateData.author)}\n` +
      `└─ branch: ${chalk.blue(expoUpdateData.branch)}\n`
  );
}
