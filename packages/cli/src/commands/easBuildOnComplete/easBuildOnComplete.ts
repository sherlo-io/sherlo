import { Platform } from '@sherlo/api-types';
import {
  DOCS_LINK,
  EAS_BUILD_ON_CANCEL_SCRIPT,
  PROFILE_OPTION,
  TEST_COMMAND,
} from '../../constants';
import { handleClientError, logInfo, throwError } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { printTheLogoInATerminal } from '../shared/terminal';
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
 * script is the same line in every project: `"eas-build-on-complete": "sherlo eas-build-on-complete"`,
 * and `"eas-build-on-cancel"` runs the same line, so a cancelled EAS build closes its run.
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
        `The \`npx sherlo ${THIS_COMMAND}\` command uploads builds made on Expo's servers.\n` +
        `To test on this machine, run \`npx sherlo ${TEST_COMMAND}\`, which builds the app itself.\n`,
      learnMoreLink: DOCS_LINK.testing,
    });

    console.log();

    return;
  }

  // Expo's build log is a log: it starts at the line that says what the hook does.
  printTheLogoInATerminal();
  emit({ kind: 'command-intro', command: 'eas-build-on-complete' });

  const sherloTempData = getSherloTempData();

  if (!sherloTempData) {
    return;
  }

  const { buildIndex, ticket, teamId, projectIndex, fingerprints } = sherloTempData;

  // EXPO'S MACHINE KNOWS NO SHERLO ADDRESS OF ITS OWN: the run's ticket goes back to the service
  // that issued it, so the address the hand-over file names wins over SHERLO_API_URL and the
  // tool's own. Every request reads its address from SHERLO_API_URL, so that is where it goes.
  if (sherloTempData.apiUrl) process.env.SHERLO_API_URL = sherloTempData.apiUrl;

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
        `Start the EAS builds with \`npx sherlo ${TEST_COMMAND}\`, which names the profile, or pass --${PROFILE_OPTION} <name>.`,
      learnMoreLink: DOCS_LINK.testEasCloudBuild,
    });
  }

  // Skip if EAS build profile doesn't match
  if (!passedProfiles.includes(easBuildProfile)) {
    logInfo({
      message:
        'Sherlo tests skipped - EAS profiles mismatch\n\n' +
        `Current build used "${easBuildProfile}" profile while Sherlo is waiting for "${passedProfiles.join(
          ', '
        )}"\n`,
      learnMoreLink: DOCS_LINK.testEasCloudBuild,
    });

    console.log();

    return;
  }

  // THE BUILD FAILED OR WAS CANCELLED ON EXPO'S SERVERS: either way no app build is coming, so the
  // run is closed now rather than left waiting until its deadline. Expo runs the
  // `eas-build-on-cancel` script on a cancel, and it runs this same command; every package manager
  // names the script it runs in `npm_lifecycle_event`, which is how this command tells a cancel
  // from an ending.
  const wasCancelled = process.env.npm_lifecycle_event === EAS_BUILD_ON_CANCEL_SCRIPT;
  const failed = process.env.EAS_BUILD_STATUS === 'errored';

  if (wasCancelled || failed) {
    await serverCalls()
      .closeBuild({
        token: ticket,
        buildIndex,
        projectIndex,
        teamId,
        runError: 'user_easCloudBuild',
        runErrorPlatform: process.env.EAS_BUILD_PLATFORM as Platform,
      })
      .catch((error) => handleClientError(error, ticket));

    throwError({
      message:
        `${
          wasCancelled ? 'The EAS build was canceled' : "The EAS build failed on Expo's servers"
        }, so Test ${buildIndex} can't run.\n` +
        `Test ${buildIndex} is marked as failed in the Sherlo web app.`,
    });
  }

  await asyncUploadBuildAndRunTests({
    buildIndex,
    easBuildProfile,
    ticket,
    teamId,
    projectIndex,
    ...(fingerprints ? { fingerprints } : {}),
  });
}

export default easBuildOnComplete;
