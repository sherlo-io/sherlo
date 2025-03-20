import fs from 'fs';
import {
  DOCS_LINK,
  EXPO_CLOUD_BUILDS_COMMAND,
  SHERLO_TEMP_DATA_FILENAME,
  SHERLO_TEMP_DIRECTORY,
} from '../../../constants';
import { getEnhancedError, logWarning, throwError } from '../../../helpers';

function getSherloTempData(): { buildIndex: number; token: string } | undefined {
  const SHERLO_TEMP_FILE_PATH = [SHERLO_TEMP_DIRECTORY, SHERLO_TEMP_DATA_FILENAME].join('/');

  if (!fs.existsSync(SHERLO_TEMP_FILE_PATH)) {
    logWarning({
      message:
        `Sherlo temporary file not found at "${SHERLO_TEMP_FILE_PATH}"\n\n` +
        'You can:\n' +
        '1. Ignore this message if you did not plan to run Sherlo tests\n' +
        '2. If you want to test your builds, make sure to:\n' +
        `   • Run \`sherlo ${EXPO_CLOUD_BUILDS_COMMAND}\` before starting EAS build\n` +
        `   • Check if ${SHERLO_TEMP_DIRECTORY} directory is not ignored in .gitignore\n`,
      learnMoreLink: DOCS_LINK.commandExpoCloudBuilds,
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
      error: getEnhancedError(`Invalid ${SHERLO_TEMP_FILE_PATH}`, error),
    });
  }

  const { buildIndex, token } = sherloTempData;

  if (typeof buildIndex !== 'number') {
    throwError({
      type: 'unexpected',
      error: new Error(
        `Field \`buildIndex\` in temporary file "${SHERLO_TEMP_FILE_PATH}" is not valid`
      ),
    });
  }

  const tokenRegex = /^[A-Za-z0-9_-]{40}[0-9]{1,4}$/;
  if (!tokenRegex.test(token)) {
    throwError({
      type: 'unexpected',
      error: new Error(
        `Passed \`token\` ("${token}") in temporary file "${SHERLO_TEMP_FILE_PATH}" is not valid`
      ),
    });
  }

  return { buildIndex, token };
}

export default getSherloTempData;
