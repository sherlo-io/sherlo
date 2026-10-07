import {
  ANDROID_OPTION,
  DOCS_LINK,
  IOS_OPTION,
  PROFILE_OPTION,
  TEST_COMMAND,
} from '../../constants';
import {
  getTokenParts,
  handleClientError,
  logInfo,
  printSherloIntro,
  throwError,
} from '../../helpers';
import { serverCalls } from '../../seams/serverCalls';
import { Options } from '../../types';
import { THIS_COMMAND } from './constants';
import { asyncUploadBuildAndRunTests, getSherloTempData } from './helpers';

/**
 * `sherlo eas-build-on-complete` - the package.json hook every EAS build runs when it ends, in a
 * project that builds on EAS (`"build": { "tool": "eas" }` in sherlo.config.json). It uploads the
 * build into the run `sherlo test` opened for it.
 *
 * The profile it answers for is the one `sherlo test` wrote into `.sherlo/data.json`, so the
 * script is the same line in every project: `"eas-build-on-complete": "sherlo eas-build-on-complete"`.
 * `--profile` still overrides it, for the scripts older CLIs asked for.
 *
 * Build lifecycle hooks: https://docs.expo.dev/build-reference/npm-hooks/
 * Environment variables: https://docs.expo.dev/build-reference/variables/#built-in-environment-variables
 */
async function easBuildOnComplete(passedOptions: Options<THIS_COMMAND>) {
  const wasAppBuiltLocally = process.env.EAS_BUILD_RUNNER !== 'eas-build';
  const easBuildProfile = process.env.EAS_BUILD_PROFILE!;

  if (wasAppBuiltLocally) {
    console.log();

    logInfo({
      message:
        'EAS builds were created locally\n\n' +
        `The \`sherlo ${THIS_COMMAND}\` command uploads builds made on Expo's servers.\n` +
        `To test builds available locally, use \`sherlo ${TEST_COMMAND} --${ANDROID_OPTION} <path> --${IOS_OPTION} <path>\` instead\n`,
      learnMoreLink: DOCS_LINK.testing,
    });

    console.log();

    return;
  }

  printSherloIntro();

  const sherloTempData = getSherloTempData();

  if (!sherloTempData) {
    return;
  }

  const { buildIndex, token } = sherloTempData;

  // The profile `sherlo test` started the EAS builds with, unless the script names others.
  const passedProfiles = passedOptions.profile
    ? passedOptions.profile.split(',')
    : sherloTempData.profile
      ? [sherloTempData.profile]
      : undefined;

  if (!passedProfiles) {
    throwError({
      message:
        `Can't upload the EAS build: no EAS profile is named. .sherlo/data.json names none, and --${PROFILE_OPTION} was not passed.\n` +
        `Start the EAS builds with \`sherlo ${TEST_COMMAND}\`, which names the profile, or pass --${PROFILE_OPTION} <name>.`,
      learnMoreLink: DOCS_LINK.testEasCloudBuild,
    });
  }

  // Skip if EAS build profile doesn't match
  if (!passedProfiles.includes(easBuildProfile)) {
    logInfo({
      message:
        'Sherlo tests skipped - EAS profiles mismatch\n\n' +
        `Current build used "${easBuildProfile}" profile while Sherlo is waiting for "${passedProfiles.join(', ')}"\n`,
      learnMoreLink: DOCS_LINK.testEasCloudBuild,
    });

    console.log();

    return;
  }

  // Build failed on Expo servers
  if (process.env.EAS_BUILD_STATUS === 'errored') {
    const { projectIndex, teamId } = getTokenParts(token);

    await serverCalls()
      .closeBuild({
        token,
        buildIndex,
        projectIndex,
        teamId,
        runError: 'user_easCloudBuild',
      })
      .catch((error) => handleClientError(error, token));

    throwError({
      message:
        "Sherlo test can't be executed - EAS build failed on Expo servers\n\n" +
        'The test has been marked as errored in Sherlo web app',
    });
  }

  await asyncUploadBuildAndRunTests({ buildIndex, easBuildProfile, token });
}

export default easBuildOnComplete;
