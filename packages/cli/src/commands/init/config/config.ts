import { DOCS_LINK } from '../../../constants';
import { logWarning } from '../../../helpers';
import { printTitle, waitForKeyPress, trackProgress } from '../helpers';
import { EVENT, TOKEN_PLACEHOLDER } from './constants';
import createConfig from './createConfig';
import hasConfigFile from './hasConfigFile';
import printDevicesInfo from './printDevicesInfo';
import updateConfig from './updateConfig';

async function config({ sessionId, token }: { sessionId: string; token?: string }): Promise<void> {
  printTitle('📋 Config');

  let configValue, hasAddedDefaultDevices, action;

  if (!hasConfigFile()) {
    ({ createdConfig: configValue, hasAddedDefaultDevices } = await createConfig(token));

    action = 'created';
  } else {
    ({ updatedConfig: configValue, hasAddedDefaultDevices } = await updateConfig(token));

    action = 'updated';
  }

  const { token: configToken, ...configWithoutToken } = configValue;

  await trackProgress({
    event: EVENT,
    params: { action, configWithoutToken },
    sessionId,
  });

  if (hasAddedDefaultDevices) {
    console.log();

    printDevicesInfo();
  }

  if (configToken === TOKEN_PLACEHOLDER) {
    console.log();

    logWarning({
      message: `Replace ${TOKEN_PLACEHOLDER} with a valid token`,
      learnMoreLink: DOCS_LINK.configToken,
    });

    await waitForKeyPress();
  }
}

export default config;
