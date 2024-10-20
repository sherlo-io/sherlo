import fs from 'fs';
import { DOCS_LINK } from '../../constants';
import { throwError } from '../../helpers';

function getSherloData(): { buildIndex: number; token: string } {
  const SHERLO_TEMP_FILE_PATH = './.sherlo/data.json';

  if (!fs.existsSync(SHERLO_TEMP_FILE_PATH)) {
    throwError({
      // TODO: zastapic wszystkie wystapienia "remoteExpoBuildScript" itp. itd.
      message: `temp file "${SHERLO_TEMP_FILE_PATH}" not found - run tests with \`sherlo --remoteExpoBuildScript\`, or check \`.gitignore\``,
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

export default getSherloData;
