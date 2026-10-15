import fs from 'fs';
import {
  DOCS_LINK,
  SHERLO_TEMP_DATA_FILENAME,
  SHERLO_TEMP_DIRECTORY,
  TEST_COMMAND,
} from '../../../constants';
import { getCwd, getErrorWithCustomMessage, logWarning, throwError } from '../../../helpers';
import type { HandOverFile } from '../../test/appBuild/createSherloTempDirectory';

/**
 * The hand-over file `sherlo test` wrote for this EAS build (../../test/appBuild/createSherloTempDirectory),
 * read from the folder the hook runs in, or undefined when there is none. A field that is not
 * what it should be is refused by name, never by repeating its value into the build log.
 */
function getSherloTempData(): HandOverFile | undefined {
  const SHERLO_TEMP_FILE_PATH = [getCwd(), SHERLO_TEMP_DIRECTORY, SHERLO_TEMP_DATA_FILENAME].join(
    '/'
  );

  if (!fs.existsSync(SHERLO_TEMP_FILE_PATH)) {
    logWarning({
      message:
        `Sherlo temporary file not found at "${SHERLO_TEMP_FILE_PATH}"\n\n` +
        'You can:\n' +
        '1. Ignore this message if you did not plan to run Sherlo tests\n' +
        '2. If you want to test your builds, make sure to:\n' +
        `   • Start the EAS builds with \`npx sherlo ${TEST_COMMAND}\`\n` +
        `   • Check if ${SHERLO_TEMP_DIRECTORY} directory is not ignored in .gitignore\n`,
      learnMoreLink: DOCS_LINK.testEasCloudBuild,
    });

    console.log();

    return;
  }

  let sherloTempData;
  try {
    sherloTempData = JSON.parse(fs.readFileSync(SHERLO_TEMP_FILE_PATH, 'utf8'));
  } catch (error) {
    throwError({
      type: 'unexpected',
      error: getErrorWithCustomMessage(error, `Invalid ${SHERLO_TEMP_FILE_PATH}`),
    });
  }

  const {
    buildIndex,
    ticket,
    teamId,
    projectIndex,
    profile,
    apiUrl,
    fingerprints,
    buildSettingsDigests,
  } = sherloTempData;

  const invalidField = [
    typeof buildIndex === 'number' ? undefined : 'buildIndex',
    typeof ticket === 'string' && ticket !== '' ? undefined : 'ticket',
    typeof teamId === 'string' && teamId !== '' ? undefined : 'teamId',
    typeof projectIndex === 'number' ? undefined : 'projectIndex',
  ].find((field) => field !== undefined);

  if (invalidField) {
    throwError({
      type: 'unexpected',
      error: new Error(
        `Field \`${invalidField}\` in temporary file "${SHERLO_TEMP_FILE_PATH}" is not valid`
      ),
    });
  }

  return {
    buildIndex,
    ticket,
    teamId,
    projectIndex,
    // The profile and the address may be absent: `--profile` may name the profile instead, and a
    // run opened on the tool's own address names none.
    ...(typeof profile === 'string' && profile !== '' ? { profile } : {}),
    ...(typeof apiUrl === 'string' && apiUrl !== '' ? { apiUrl } : {}),
    // A file from an older CLI carries no fingerprints, and the hook then takes its own.
    ...(fingerprints && typeof fingerprints === 'object' ? { fingerprints } : {}),
    // Likewise an older file carries no digests, and the base is then filed without one.
    ...(buildSettingsDigests && typeof buildSettingsDigests === 'object'
      ? { buildSettingsDigests }
      : {}),
  };
}

export default getSherloTempData;
