import { renderConfigTitle, renderDevicesCanBeAdjusted } from '../../../render/initConfig';
import { printLines, trackProgress } from '../helpers';
import { EVENT } from './constants';
import createConfig from './createConfig';
import hasConfigFile from './hasConfigFile';
import updateConfig from './updateConfig';

async function config({
  sessionId,
  token,
}: {
  sessionId: string | null;
  token?: string;
}): Promise<void> {
  printLines(renderConfigTitle());

  let configValue, hasAddedDefaultDevices, action;

  try {
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
  } catch (error) {
    await trackProgress({
      event: EVENT,
      params: { status: 'failed', error },
      sessionId,
    });
    throw error;
  }

  if (hasAddedDefaultDevices) {
    printLines(renderDevicesCanBeAdjusted());
  }
}

export default config;
