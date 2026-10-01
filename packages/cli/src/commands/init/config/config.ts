import { printTitle, trackProgress } from '../helpers';
import { EVENT } from './constants';
import createConfig from './createConfig';
import hasConfigFile from './hasConfigFile';
import printDevicesInfo from './printDevicesInfo';
import updateConfig from './updateConfig';

/** Writes `sherlo.config.json` with the project the project step settled, and never a token. */
async function config({
  sessionId,
  project,
}: {
  sessionId: string | null;
  /** The team id, a slash and the project's number. */
  project: string;
}): Promise<void> {
  printTitle('📋 Config');

  let configValue, hasAddedDefaultDevices, action;

  try {
    if (!hasConfigFile()) {
      ({ createdConfig: configValue, hasAddedDefaultDevices } = await createConfig(project));

      action = 'created';
    } else {
      ({ updatedConfig: configValue, hasAddedDefaultDevices } = await updateConfig(project));

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
    console.log();

    printDevicesInfo();
  }
}

export default config;
