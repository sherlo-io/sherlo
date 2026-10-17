/**
 * What `sherlo feedback` sends beside the report: the facts needed to act on it. Never a token,
 * never the saved login, never an environment value, and nothing from sherlo.config.json beyond
 * the project and its devices. A fact that cannot be read is left out, never guessed.
 */
import os from 'os';
import { detect } from 'package-manager-detector';
import { version as cliVersion } from '../../../package.json';
import getCwd from '../../helpers/getCwd';
import getTokenParts from '../../helpers/getTokenParts';
import { readLastCommand } from '../../helpers/lastCommandRecord';
import isPersonalToken from '../../helpers/isPersonalToken';
import type { FeedbackContext } from '../../seams/serverCalls';
import type { InvalidatedConfig } from '../../types';
import hasConfigFile from '../init/config/hasConfigFile';
import readConfig from '../init/config/readConfig';
import getPackageVersion from '../init/requirements/getPackageVersion';
import { runningAgent } from './runningAgent';

export async function collectContext(): Promise<FeedbackContext> {
  const config = await readConfigIfThereIsOne();

  return {
    agent: runningAgent(),
    lastCommand: readLastCommand(),
    cliVersion,
    sdkVersion: installedVersion('@sherlo/react-native-storybook'),
    reactNativeVersion: installedVersion('react-native'),
    expoVersion: installedVersion('expo'),
    storybookVersion: installedVersion('@storybook/react-native'),
    packageManager: (await detect({ cwd: getCwd() }))?.name,
    operatingSystem: `${os.type()} ${os.release()}`,
    project: projectNamedBy(config),
    devices: config?.devices as FeedbackContext['devices'],
  };
}

/** A package that is missing, or has a broken package.json, has no version to send. */
function installedVersion(packageName: string): string | undefined {
  try {
    return getPackageVersion(packageName) ?? undefined;
  } catch {
    return undefined;
  }
}

async function readConfigIfThereIsOne(): Promise<InvalidatedConfig | undefined> {
  if (!hasConfigFile()) return undefined;

  try {
    return await readConfig();
  } catch {
    return undefined;
  }
}

/** The team and project number the config's project token names; the token itself stays behind. */
function projectNamedBy(config: InvalidatedConfig | undefined): FeedbackContext['project'] {
  const token = (config as { token?: unknown } | undefined)?.token;
  if (typeof token !== 'string' || isPersonalToken(token)) return undefined;

  const { teamId, projectIndex } = getTokenParts(token);
  return Number.isInteger(projectIndex) ? { teamId, projectIndex } : undefined;
}
