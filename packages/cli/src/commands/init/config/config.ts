import { printTitle, trackProgress } from '../helpers';
import { EVENT } from './constants';
import createConfig from './createConfig';
import hasConfigFile from './hasConfigFile';
import printDevicesInfo from './printDevicesInfo';
import updateConfig from './updateConfig';

async function config({ sessionId, token }: { sessionId: string | null; token?: string }): Promise<void> {
  printTitle('📋 Config');

  let configValue, hasAddedDefaultDevices, action;

  if (!hasConfigFile()) {
    ({ createdConfig: configValue, hasAddedDefaultDevices } = await createConfig(token));

    action = 'created';
  } else {
    ({ updatedConfig: configValue, hasAddedDefaultDevices } = await updateConfig(token));

    action = 'updated';
  }

  const configWithoutToken = { ...configValue };
  delete configWithoutToken.token;

  await trackProgress({
    event: EVENT,
    params: { action, configWithoutToken },
    sessionId,
  });

  if (hasAddedDefaultDevices) {
    console.log();

    printDevicesInfo();
  }
}

export default config;
