import fs from 'fs';
import {
  DOCS_LINK,
  EXPO_CLOUD_BUILDS_COMMAND,
  SHERLO_TEMP_DATA_FILE,
  SHERLO_TEMP_DIRECTORY,
} from '../../../constants';
import { logWarning, throwError } from '../../../helpers';

function getSherloTempData(): { buildIndex: number; token: string } | undefined {
  const SHERLO_TEMP_FILE_PATH = [SHERLO_TEMP_DIRECTORY, SHERLO_TEMP_DATA_FILE].join('/');

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

    return;
  }

  console.log(`[DEBUG JSON] Reading temp file from: ${SHERLO_TEMP_FILE_PATH}`);
  try {
    const fileContent = fs.readFileSync(SHERLO_TEMP_FILE_PATH, 'utf8');
    console.log(`[DEBUG JSON] Temp file content: ${fileContent}`);

    try {
      const tempData = JSON.parse(fileContent);
      console.log(`[DEBUG JSON] Successfully parsed temp file: ${SHERLO_TEMP_FILE_PATH}`);

      const { buildIndex, token } = tempData;

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
    } catch (parseError) {
      console.error(`[DEBUG JSON] Error parsing temp file: ${parseError.message}`);
      throwError({
        type: 'unexpected',
        error: parseError,
      });
    }
  } catch (readError) {
    console.error(`[DEBUG JSON] Error reading temp file: ${readError.message}`);
    throwError({
      type: 'unexpected',
      error: readError,
    });
  }
}

export default getSherloTempData;
