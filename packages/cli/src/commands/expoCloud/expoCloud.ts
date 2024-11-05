import SDKApiClient from '@sherlo/sdk-client';
import { DOCS_LINK } from '../../constants';
import {
  getAppBuildUrl,
  getBuildRunConfig,
  getValidatedConfig,
  getGitInfo,
  getOptionsWithDefaults,
  getTokenParts,
  handleClientError,
  printHeader,
  throwError,
} from '../../helpers';
import { Options } from '../../types';
import createSherloTempDirectory from './createSherloTempDirectory';
import removeSherloTempDirectory from './removeSherloTempDirectory';
import runBuildScript from './runBuildScript';
import validatePackageJsonScript from './validatePackageJsonScript';

async function expoCloud(passedOptions: Options<'expo-cloud', 'withoutDefaults'>) {
  if (!passedOptions.buildScript && !passedOptions.manual) {
    throwError({
      message: 'either `--buildScript` or `--manual` must be provided',
      learnMoreLink: 'TODO: dodac link do docsow',
    });
  }

  printHeader();

  const options = getOptionsWithDefaults(passedOptions);
  const config = getValidatedConfig(options, { validatePlatformPaths: false });

  const { buildScript, gitInfo, projectRoot, token } = { ...options, ...config };

  const easBuildOnCompleteScriptName = 'eas-build-on-complete';
  validatePackageJsonScript({
    projectRoot,
    scriptName: easBuildOnCompleteScriptName,
    errorMessage: `script "${easBuildOnCompleteScriptName}" is not defined in package.json`,
    learnMoreLink: DOCS_LINK.remoteExpoBuilds,
  });

  if (buildScript) {
    validatePackageJsonScript({
      projectRoot,
      scriptName: buildScript,
      // TODO: poprawic wszystkie wystapienia remoteExpoBuildScript
      errorMessage: `script "${buildScript}" passed by \`--remoteExpoBuildScript\` is not defined in package.json`,
      learnMoreLink: DOCS_LINK.sherloScriptExpoRemoteBuilds,
    });
  }

  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = SDKApiClient(apiToken);

  // TODO: getSdkVersion()

  const { build } = await client
    .openBuild({
      teamId,
      projectIndex,
      gitInfo: gitInfo ?? getGitInfo(),
      asyncUpload: true,
      buildRunConfig: getBuildRunConfig({ config }),
      // TODO: sdkVersion
    })
    .catch(handleClientError);

  const buildIndex = build.index;

  createSherloTempDirectory({ buildIndex, projectRoot, token });

  console.log('Sherlo is waiting for your app to be built on Expo servers.\n');

  if (buildScript) {
    runBuildScript({
      projectRoot,
      scriptName: buildScript,
      onExit: () => removeSherloTempDirectory(projectRoot),
    });
  }

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  // TODO: czy powinnismy zwracac buildIndex i url?
  return { buildIndex, url };
}

export default expoCloud;
