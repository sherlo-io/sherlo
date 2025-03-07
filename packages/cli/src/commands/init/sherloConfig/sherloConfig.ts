import { DOCS_LINK } from '../../../constants';
import { logWarning } from '../../../helpers';
import { printTitle, waitForKeyPress, trackProgress } from '../helpers';
import { EVENT, TOKEN_PLACEHOLDER } from './constants';
import createConfig from './createConfig';
import hasConfigFile from './hasConfigFile';
import updateConfig from './updateConfig';

async function sherloConfig({
  sessionId,
  token,
}: {
  sessionId: string;
  token?: string;
}): Promise<void> {
  printTitle('⚙️ Sherlo Config');

  let action, config;

  if (!hasConfigFile()) {
    config = await createConfig(token);
    action = 'created';
  } else {
    config = await updateConfig(token);
    action = 'updated';
  }

  const { token: configToken, ...configWithoutToken } = config;

  await trackProgress({
    event: EVENT,
    params: { action, configWithoutToken },
    sessionId,
  });

  if (configToken === TOKEN_PLACEHOLDER) {
    console.log();

    logWarning({
      message: `Replace ${TOKEN_PLACEHOLDER} with a valid token`,
      learnMoreLink: DOCS_LINK.configToken,
    });

    await waitForKeyPress();
  }
}

export default sherloConfig;
