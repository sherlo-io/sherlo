import SDKApiClient from '@sherlo/sdk-client';
import process from 'process';
import { DOCS_LINK } from '../../constants';
import {
  getTokenParts,
  handleClientError,
  logInfoMessage,
  printHeader,
  throwError,
} from '../../helpers';
import asyncUploadPlatformBuild from './asyncUploadPlatformBuild';
import getSherloData from './getSherloData';

/**
 * Build lifecycle hooks: https://docs.expo.dev/build-reference/npm-hooks/
 * Environment variables: https://docs.expo.dev/build-reference/variables/#built-in-environment-variables
 * Secrets in environment variables: https://docs.expo.dev/build-reference/variables/#using-secrets-in-environment-variables
 */

async function easBuildOnComplete(options: { profile?: string }) {
  // Skip if the app was built locally
  if (process.env.EAS_BUILD_RUNNER !== 'eas-build') {
    logInfoMessage({
      message:
        '`sherlo eas-build-on-complete` command works only with `sherlo expo-cloud`; to test builds available locally, use `sherlo local-builds`',
      // TODO: link do poprawy?
      learnMoreLink: DOCS_LINK.sherloScriptLocalBuilds,
      startWithNewLine: true,
    });

    return;
  }

  const optionProfile = options.profile;
  const easBuildProfile = process.env.EAS_BUILD_PROFILE;

  if (!optionProfile) {
    throwError({
      message:
        'you must use the same EAS `--profile` in the `eas-build-on-complete` command as the one configured for Sherlo test builds',
      // TODO: poprawic link?
      learnMoreLink: DOCS_LINK.remoteExpoBuilds,
    });
  }

  // Skip if EAS build profile doesn't match
  if (optionProfile !== easBuildProfile) {
    logInfoMessage({
      message: `Sherlo skipped testing - current EAS build profile "${easBuildProfile}" doesn't match the profile "${optionProfile}" specified in \`sherlo eas-build-on-complete\` command`,
      learnMoreLink: DOCS_LINK.remoteExpoBuilds,
      startWithNewLine: true,
    });

    return;
  }

  printHeader();

  const { buildIndex, token } = getSherloData();

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

    throwError({ message: 'canceled due to error on Expo servers' });
  }

  // Upload the platform build
  await asyncUploadPlatformBuild({ buildIndex, sherloBuildProfile: optionProfile, token });
}

export default easBuildOnComplete;
