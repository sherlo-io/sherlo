import { DEFAULT_CONFIG_FILENAME, DOCS_LINK } from '../../../constants';
import { logWarning } from '../../../helpers';

function printNoTokenWarning(): void {
  logWarning({
    message:
      `\`npx sherlo test\` needs a project token, and ${DEFAULT_CONFIG_FILENAME} has none yet\n` +
      `Get one at https://app.sherlo.io, then run \`npx sherlo init --token <token>\` or add it as "token" in ${DEFAULT_CONFIG_FILENAME}`,
    learnMoreLink: DOCS_LINK.configToken,
  });
}

export default printNoTokenWarning;
