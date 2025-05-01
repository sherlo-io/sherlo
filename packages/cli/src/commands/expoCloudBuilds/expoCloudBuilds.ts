import sdkClient from '@sherlo/sdk-client';
import { EXPO_CLOUD_BUILDS_COMMAND } from '../../constants';
import {
  getAppBuildUrl,
  getBuildRunConfig,
  getGitInfo,
  getPlatformsToTest,
  getTokenParts,
  getValidatedCommandParams,
  handleClientError,
  printBuildIntroMessage,
  printBuildMessage,
  printBuildPlatformLabel,
  printResultsUrl,
  printSherloIntro,
  validatePackages,
} from '../../helpers';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';
import {
  createSherloTempDirectory,
  removeSherloTempDirectory,
  runScript,
  validatePackageJsonScripts,
} from './helpers';

async function expoCloudBuilds(passedOptions: Options<THIS_COMMAND>) {
  printSherloIntro();

  validatePackages(EXPO_CLOUD_BUILDS_COMMAND);

  const commandParams = getValidatedCommandParams(
    { command: EXPO_CLOUD_BUILDS_COMMAND, passedOptions },
    {
      /*
       * We don't require platform paths here because builds are uploaded later
       * from Expo servers using the easBuildOnComplete command
       */
      requirePlatformPaths: false,
    }
  );

  validatePackageJsonScripts(commandParams);

  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  const { build } = await client
    .openBuild({
      teamId,
      projectIndex,
      asyncUpload: true,
      buildRunConfig: getBuildRunConfig({ commandParams }),
      gitInfo: await getGitInfo(commandParams.projectRoot),
      message: commandParams.message,
    })
    .catch(handleClientError);

  const buildIndex = build.index;

  printBuildIntroMessage({ commandParams, nextBuildIndex: buildIndex });

  const platformsToTest = getPlatformsToTest(commandParams.devices);
  platformsToTest.forEach((platform) => {
    printBuildPlatformLabel(platform);

    printBuildMessage({
      message: 'EAS build pending...',
      type: 'info',
      endsWithNewLine: true,
    });
  });

  if (commandParams.easBuildScriptName) {
    console.log(`🚀 Initiating EAS build via script "${commandParams.easBuildScriptName}"...\n`);
  } else {
    console.log('⏳ Waiting for EAS build initiation...\n');
  }

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  printResultsUrl(url);

  createSherloTempDirectory({
    buildIndex,
    projectRoot: commandParams.projectRoot,
    token: commandParams.token,
  });

  if (commandParams.easBuildScriptName) {
    runScript({
      projectRoot: commandParams.projectRoot,
      scriptName: commandParams.easBuildScriptName,
      onExit: () => removeSherloTempDirectory(commandParams.projectRoot),
    });
  }

  return { url };
}

export default expoCloudBuilds;
