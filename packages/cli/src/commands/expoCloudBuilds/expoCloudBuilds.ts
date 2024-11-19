import SDKApiClient from '@sherlo/sdk-client';
import chalk from 'chalk';
import {
  DOCS_LINK,
  EXPO_CLOUD_BUILDS_COMMAND,
  EAS_BUILD_SCRIPT_NAME_OPTION,
  WAIT_FOR_EAS_BUILD_OPTION,
} from '../../constants';
import {
  getAppBuildUrl,
  getBuildRunConfig,
  getGitInfo,
  getOptionsWithDefaults,
  getTokenParts,
  getValidatedConfig,
  handleClientError,
  logBuildIntroMessage,
  logBuildResultsMessage,
  logPlatformMessage,
  printHeader,
  throwError,
  validatePackages,
  getPlatformsToTest,
} from '../../helpers';
import { Options } from '../../types';
import assertPackageJsonScriptExists from './assertPackageJsonScriptExists';
import createSherloTempDirectory from './createSherloTempDirectory';
import removeSherloTempDirectory from './removeSherloTempDirectory';
import runScript from './runScript';

const EAS_BUILD_SCRIPT_NAME_FLAG = `--${EAS_BUILD_SCRIPT_NAME_OPTION}`;
const WAIT_FOR_EAS_BUILD_FLAG = `--${WAIT_FOR_EAS_BUILD_OPTION}`;

async function expoCloudBuilds(
  passedOptions: Options<typeof EXPO_CLOUD_BUILDS_COMMAND, 'withoutDefaults'>
) {
  printHeader();

  if (!passedOptions[EAS_BUILD_SCRIPT_NAME_OPTION] && !passedOptions[WAIT_FOR_EAS_BUILD_OPTION]) {
    throwError({
      message: `either \`${EAS_BUILD_SCRIPT_NAME_FLAG}\` or \`${WAIT_FOR_EAS_BUILD_FLAG}\` must be provided`,
      learnMoreLink: 'TODO: dodac link do docsow',
    });
  } else if (
    passedOptions[EAS_BUILD_SCRIPT_NAME_OPTION] &&
    passedOptions[WAIT_FOR_EAS_BUILD_OPTION]
  ) {
    throwError({
      message: `\`${EAS_BUILD_SCRIPT_NAME_FLAG}\` and \`${WAIT_FOR_EAS_BUILD_FLAG}\` cannot be used together`,
      learnMoreLink: 'TODO: dodac link do docsow',
    });
  }

  validatePackages(EXPO_CLOUD_BUILDS_COMMAND);

  const options = getOptionsWithDefaults(passedOptions);
  const config = getValidatedConfig(options, { requirePlatformPaths: false });

  const { easBuildScriptName, gitInfo, projectRoot, token } = { ...options, ...config };

  const easBuildOnCompleteScriptName = 'eas-build-on-complete';
  assertPackageJsonScriptExists({
    projectRoot,
    scriptName: easBuildOnCompleteScriptName,
    errorMessage: `script "${easBuildOnCompleteScriptName}" is not defined in package.json`,
    learnMoreLink: DOCS_LINK.remoteExpoBuilds,
  });

  if (easBuildScriptName) {
    assertPackageJsonScriptExists({
      projectRoot,
      scriptName: easBuildScriptName,
      errorMessage: `script "${easBuildScriptName}" passed by \`${EAS_BUILD_SCRIPT_NAME_FLAG}\` is not defined in package.json`,
      learnMoreLink: DOCS_LINK.sherloScriptExpoRemoteBuilds,
    });
  }

  // TODO: nextBuildIndex
  logBuildIntroMessage({ config, nextBuildIndex: 42069 });

  const platformsToTest = getPlatformsToTest(config.devices);
  platformsToTest.forEach((platform) => {
    logPlatformMessage({
      platform,
      message: 'EAS build pending...',
      type: 'info',
      endsWithNewLine: true,
    });
  });

  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = SDKApiClient(apiToken);

  const { build } = await client
    .openBuild({
      teamId,
      projectIndex,
      gitInfo: gitInfo ?? getGitInfo(projectRoot),
      asyncUpload: true,
      buildRunConfig: getBuildRunConfig({ config }),
    })
    .catch(handleClientError);

  const buildIndex = build.index;

  createSherloTempDirectory({ buildIndex, projectRoot, token });

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  logBuildResultsMessage(url);

  if (easBuildScriptName) {
    console.log(chalk.gray(`Starting EAS build script "${easBuildScriptName}":\n`));

    runScript({
      projectRoot,
      scriptName: easBuildScriptName,
      onExit: () => removeSherloTempDirectory(projectRoot),
    });
  } else {
    console.log(chalk.gray('Please run `eas build` to start the cloud build process...\n'));
  }

  return { buildIndex, url };
}

export default expoCloudBuilds;
