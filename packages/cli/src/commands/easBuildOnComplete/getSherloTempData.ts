import fs from 'fs';
import {
  DOCS_LINK,
  EXPO_UPDATES_COMMAND,
  SHERLO_TEMP_DIRECTORY,
  SHERLO_TEMP_DATA_FILE,
} from '../../constants';
import { throwError } from '../../helpers';

function getSherloTempData(): { buildIndex: number; token: string } {
  const SHERLO_TEMP_FILE_PATH = ['.', SHERLO_TEMP_DIRECTORY, SHERLO_TEMP_DATA_FILE].join('/');

  console.log('[DEBUG] Attempting to read temp file:', {
    path: SHERLO_TEMP_FILE_PATH,
    cwd: process.cwd(),
    exists: fs.existsSync(SHERLO_TEMP_FILE_PATH),
    stats: fs.existsSync(SHERLO_TEMP_FILE_PATH) ? fs.statSync(SHERLO_TEMP_FILE_PATH) : null,
  });

  if (!fs.existsSync(SHERLO_TEMP_FILE_PATH)) {
    throwError({
      // TODO: tekst do poprawy?
      message: `temp file "${SHERLO_TEMP_FILE_PATH}" not found - run tests with \`sherlo ${EXPO_UPDATES_COMMAND}\`, or check \`.gitignore\``,
      learnMoreLink: DOCS_LINK.sherloScriptExpoRemoteBuilds,
    });
  }

  const { buildIndex, token } = JSON.parse(fs.readFileSync(SHERLO_TEMP_FILE_PATH, 'utf8'));

  if (typeof buildIndex !== 'number') {
    throwError({
      type: 'unexpected',
      message: `field \`buildIndex\` in temporary file "${SHERLO_TEMP_FILE_PATH}" is not valid`,
    });
  }

  const tokenRegex = /^[A-Za-z0-9_-]{40}[0-9]{1,4}$/;
  if (!tokenRegex.test(token)) {
    throwError({
      message: `passed \`token\` ("${token}") is not valid`,
      learnMoreLink: DOCS_LINK.configToken,
    });
  }

  return { buildIndex, token };
}

export default getSherloTempData;
