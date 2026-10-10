/**
 * STEP 7 - `sherlo.config.json`: the project setup settled, and one device. Never a token: the file
 * is committed.
 *
 * One Android phone, so the first test needs one build, on any machine: an iPhone needs a Mac.
 * A file that already names this project and has devices is left as it is.
 *
 * BUILD DEBT (init-for-agents): the field becomes `projectId`, in every reader of the config.
 */
import { DEVICES } from '@sherlo/shared';
import { DEFAULT_CONFIG_FILENAME } from '../../../constants';
import { renderStepLine } from '../../../render/initSteps';
import { InvalidatedConfig } from '../../../types';
import { printLines, trackProgress } from '../helpers';
import { DEFAULT_DEVICES, EVENT } from './constants';
import hasConfigFile from './hasConfigFile';
import readConfig from './readConfig';
import writeConfig from './writeConfig';

async function config({
  sessionId,
  project,
}: {
  sessionId: string | null;
  /** The team id, a slash and the project's number. */
  project: string;
}): Promise<void> {
  try {
    const existingConfig: InvalidatedConfig | null = hasConfigFile() ? await readConfig() : null;
    const hasDevices = Array.isArray(existingConfig?.devices) && existingConfig!.devices.length > 0;

    if (existingConfig && existingConfig.project === project && hasDevices) {
      // No project id (operator, 2026-10-09): the team and project lines above already name them.
      printLines([
        renderStepLine({
          outcome: 'already',
          name: 'Created config',
          detail: DEFAULT_CONFIG_FILENAME,
        }),
      ]);
      await trackProgress({ event: EVENT, params: { action: 'already_created' }, sessionId });
      return;
    }

    const newConfig = {
      ...existingConfig,
      project,
      devices: hasDevices ? existingConfig!.devices : DEFAULT_DEVICES,
    };
    await writeConfig(newConfig);

    const addedDevices = hasDevices
      ? ''
      : `, one device: ${DEFAULT_DEVICES.map(({ id }) => DEVICES[id].displayName).join(', ')}`;

    printLines([
      renderStepLine({
        outcome: 'done',
        name: existingConfig ? 'Updated config' : 'Created config',
        detail: `${DEFAULT_CONFIG_FILENAME}${addedDevices}`,
      }),
    ]);

    const configWithoutToken = { ...newConfig };
    delete configWithoutToken.token;
    await trackProgress({
      event: EVENT,
      params: { action: existingConfig ? 'updated' : 'created', configWithoutToken },
      sessionId,
    });
  } catch (error) {
    await trackProgress({ event: EVENT, params: { status: 'failed', error }, sessionId });
    throw error;
  }
}

export default config;
