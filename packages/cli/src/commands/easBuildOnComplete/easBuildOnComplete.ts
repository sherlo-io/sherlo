import SDKApiClient from '@sherlo/sdk-client';
import {
  DOCS_LINK,
  EXPO_CLOUD_BUILDS_COMMAND,
  LOCAL_BUILDS_COMMAND,
  PROFILE_OPTION,
} from '../../constants';
import { getTokenParts, handleClientError, logInfo, printHeader, throwError } from '../../helpers';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';
import { asyncUploadBuildAndRunTests, getSherloTempData } from './helpers';

/**
 * Build lifecycle hooks: https://docs.expo.dev/build-reference/npm-hooks/
 * Environment variables: https://docs.expo.dev/build-reference/variables/#built-in-environment-variables
 * Secrets in environment variables: https://docs.expo.dev/build-reference/variables/#using-secrets-in-environment-variables
 */

async function easBuildOnComplete(passedOptions: Options<THIS_COMMAND>) {
  const wasAppBuiltLocally = process.env.EAS_BUILD_RUNNER !== 'eas-build';
  const passedProfile = passedOptions.profile;
  const easBuildProfile = process.env.EAS_BUILD_PROFILE;

  if (wasAppBuiltLocally) {
    logInfo({
      message:
        'EAS builds were created locally\n\n' +
        `The \`sherlo ${THIS_COMMAND}\` command works only with \`sherlo ${EXPO_CLOUD_BUILDS_COMMAND}\`\n` +
        `To test builds available locally, use \`sherlo ${LOCAL_BUILDS_COMMAND}\` instead\n`,
      // TODO: link do poprawy?
      learnMoreLink: DOCS_LINK.sherloScriptLocalBuilds,
    });

    return;
  }

  printHeader();

  if (!passedProfile) {
    throwError({
      message:
        `The \`--${PROFILE_OPTION}\` flag is required for \`sherlo ${THIS_COMMAND}\`\n\n` +
        'Please specify the EAS profile that will be used for testing your builds with Sherlo\n',
      // TODO: ?
      learnMoreLink: DOCS_LINK.remoteExpoBuilds,
    });
  }

  // Skip if EAS build profile doesn't match
  if (passedProfile !== easBuildProfile) {
    logInfo({
      message:
        'Sherlo tests skipped - EAS profiles mismatch\n\n' +
        `Current build used "${easBuildProfile}" profile while \`sherlo ${THIS_COMMAND}\` was called with "${passedProfile}"\n`,
      // TODO: ?
      learnMoreLink: DOCS_LINK.remoteExpoBuilds,
    });

    return;
  }

  const sherloTempData = getSherloTempData();

  if (!sherloTempData) {
    return;
  }

  const { buildIndex, token } = sherloTempData;

  // Build failed on Expo servers
  if (process.env.EAS_BUILD_STATUS === 'errored') {
    const { apiToken, projectIndex, teamId } = getTokenParts(token);
    const client = SDKApiClient(apiToken);

    await client
      .closeBuild({
        buildIndex,
        projectIndex,
        teamId,
        runError: 'user_expoBuildError',
      })
      .catch(handleClientError);

    throwError({
      message:
        "Sherlo test can't be executed - EAS build failed on Expo servers\n\n" +
        'The test has been marked as errored in Sherlo web app',
    });
  }

  await asyncUploadBuildAndRunTests({ buildIndex, easBuildProfile: passedProfile, token });
}

export default easBuildOnComplete;
