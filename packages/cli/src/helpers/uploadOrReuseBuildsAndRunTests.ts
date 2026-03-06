import sdkClient from '@sherlo/sdk-client';
import chalk from 'chalk';
import { TEST_EAS_UPDATE_COMMAND, TEST_STANDARD_COMMAND } from '../constants';
import { CommandParams, EasUpdateData } from '../types';
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
  easUpdateData,
}: {
  commandParams: CommandParams;
  easUpdateData?: EasUpdateData;
}): Promise<{ url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  const { binariesInfo, nextBuildIndex } = await getValidatedBinariesInfoAndNextBuildIndex({
    client,
    command: easUpdateData ? TEST_EAS_UPDATE_COMMAND : TEST_STANDARD_COMMAND,
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

  if (easUpdateData) {
    printEasUpdateData(easUpdateData);
  }

  const { build } = await client
    .openBuild({
      teamId,
      projectIndex,
      binaryHashes: {
        android: binariesInfo.android?.hash,
        ios: binariesInfo.ios?.hash,
      },
      binaryFileNames: {
        android: binariesInfo.android?.fileName,
        ios: binariesInfo.ios?.fileName,
      },
      buildRunConfig: getBuildRunConfig({
        commandParams,
        binaryS3Keys: {
          android: binariesInfo.android?.s3Key,
          ios: binariesInfo.ios?.s3Key,
        },
        easUpdateData,
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

function printEasUpdateData(easUpdateData: EasUpdateData) {
  console.log(
    `🔄 ${chalk.bold('EAS Update')}\n` +
      `└─ message: ${chalk.blue(easUpdateData.message)}\n` +
      `└─ created: ${chalk.blue(easUpdateData.timeAgo)}\n` +
      `└─ author: ${chalk.blue(easUpdateData.author)}\n` +
      `└─ branch: ${chalk.blue(easUpdateData.branch)}\n`
  );
}
