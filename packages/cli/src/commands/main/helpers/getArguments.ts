import { Build, Platform } from '@sherlo/api-types';
import { defaultDeviceOsLanguage, defaultDeviceOsTheme } from '@sherlo/shared';
import nodePath from 'path';
import { Command } from 'commander';
import { getErrorMessage } from '../../../utils';
import { Config, InvalidatedConfig, Mode } from '../types';
import {
  getGitInfo,
  parseConfigFile,
  validateConfigDevices,
  validateConfigPlatformPath,
  validateConfigPlatforms,
  validateConfigToken,
} from './utils';
import { DEFAULT_CONFIG_PATH, DEFAULT_PROJECT_ROOT } from '../../../constants';
import chalk from 'chalk';

type ParameterDefaults = { config: string; projectRoot: string };
type Parameters<T extends 'default' | 'withDefaults' = 'default'> = {
  token?: string; // only CLI
  android?: string;
  ios?: string;
  remoteExpo?: boolean;
  remoteExpoBuildScript?: string;
  async?: boolean;
  asyncBuildIndex?: number;
  gitInfo?: Build['gitInfo']; // Can be passed only in GitHub Action
} & (T extends 'withDefaults' ? ParameterDefaults : Partial<ParameterDefaults>);

type Arguments = SyncArguments | AsyncInitArguments | AsyncUploadArguments;
type SyncArguments = {
  mode: 'sync';
  token: string;
  config: Config<'withBuildPaths'>;
  gitInfo: Build['gitInfo'];
};
type AsyncInitArguments = {
  mode: 'asyncInit';
  token: string;
  config: Config<'withoutBuildPaths'>;
  gitInfo: Build['gitInfo'];
  projectRoot: string;
  remoteExpo: boolean | undefined;
  remoteExpoBuildScript: string | undefined;
};
type AsyncUploadArguments = {
  mode: 'asyncUpload';
  token: string;
  asyncBuildIndex: number;
  path: string;
  platform: Platform;
};

function getArguments(githubActionParameters?: Parameters): Arguments {
  const params = githubActionParameters ?? command.parse(process.argv).opts();
  const parameters = applyParameterDefaults(params);

  const configPath = nodePath.resolve(parameters.projectRoot, parameters.config);
  const configFile = parseConfigFile(configPath);
  const config = getConfig(configFile, parameters);

  let mode: Mode = 'sync';
  if (
    parameters.remoteExpo ||
    parameters.remoteExpoBuildScript ||
    (parameters.async && !parameters.asyncBuildIndex) // Allows to pass `asyncBuildIndex` along with `async` -> "asyncUpload" mode
  ) {
    mode = 'asyncInit';
  } else if (parameters.asyncBuildIndex) {
    mode = 'asyncUpload';
  }

  validateConfigToken(config);
  const { token } = config;

  switch (mode) {
    case 'sync': {
      validateConfigPlatforms(config, 'withBuildPaths');
      validateConfigDevices(config);
      // validateFilters(updatedConfig);

      return {
        mode,
        token,
        config: config as Config<'withBuildPaths'>,
        gitInfo: githubActionParameters?.gitInfo ?? getGitInfo(),
      } satisfies SyncArguments;
    }

    case 'asyncInit': {
      // validateConfigPlatforms(config, 'withoutBuildPaths');
      validateConfigDevices(config);
      // validateFilters(updatedConfig);

      return {
        mode,
        token,
        config: config as Config<'withoutBuildPaths'>,
        gitInfo: githubActionParameters?.gitInfo ?? getGitInfo(),
        projectRoot: parameters.projectRoot,
        remoteExpo: parameters.remoteExpo,
        remoteExpoBuildScript: parameters.remoteExpoBuildScript,
      } satisfies AsyncInitArguments;
    }

    case 'asyncUpload': {
      const { path, platform } = getAsyncUploadArguments(parameters);
      const { asyncBuildIndex } = parameters;

      if (!asyncBuildIndex) {
        throw new Error(
          getErrorMessage({
            type: 'unexpected',
            message: 'asyncBuildIndex is undefined',
          })
        );
      }

      return {
        mode,
        token,
        asyncBuildIndex,
        path,
        platform,
      } satisfies AsyncUploadArguments;
    }
  }
}

export default getArguments;

/* ========================================================================== */

const command = new Command();
command
  .name('sherlo')
  .option('--token <token>', 'Project token')
  .option('--android <path>', 'Path to the Android build in .apk format')
  .option('--ios <path>', 'Path to the iOS build in .app (or compressed .tar.gz / .tar) format')
  .option('--config <path>', 'Config file path', DEFAULT_CONFIG_PATH)
  .option('--projectRoot <path>', 'Root of the React Native project', DEFAULT_PROJECT_ROOT)
  .option(
    '--remoteExpo',
    'Run Sherlo in remote Expo mode, waiting for you to manually build the app on the Expo server. Temporary files will not be auto-deleted.'
  )
  .option(
    '--remoteExpoBuildScript <scriptName>',
    'Run Sherlo in remote Expo mode, using the script from package.json to build the app on the Expo server. Temporary files will be auto-deleted.'
  )
  .option(
    '--async',
    "Run Sherlo in async mode, meaning you don't have to provide builds immediately"
  )
  .option(
    '--asyncBuildIndex <number>',
    'Index of build you want to update in async mode',
    parseInt
  );

function applyParameterDefaults(params: Parameters): Parameters<'withDefaults'> {
  const projectRoot = params.projectRoot ?? DEFAULT_PROJECT_ROOT;
  const config = params.config ?? DEFAULT_CONFIG_PATH;

  return {
    ...params,
    projectRoot,
    config,
  };
}

function getConfig(
  configFile: InvalidatedConfig,
  parameters: Parameters<'withDefaults'>
): InvalidatedConfig {
  const { projectRoot } = parameters;

  // Take token from parameters or config file
  const token = parameters.token ?? configFile.token;

  // Set a proper android path
  let android = parameters.android ?? configFile.android;
  android = android ? nodePath.resolve(projectRoot, android) : undefined;

  // Set a proper ios path
  let ios = parameters.ios ?? configFile.ios;
  ios = ios ? nodePath.resolve(projectRoot, ios) : undefined;

  // Set defaults for devices and remove duplicates
  const devices = removeDuplicateDevices(
    configFile.devices?.map((device) => ({
      ...device,
      osLanguage: device?.osLanguage ?? defaultDeviceOsLanguage,
      osTheme: device?.osTheme ?? defaultDeviceOsTheme,
    }))
  );

  return {
    ...configFile,
    token,
    android,
    ios,
    devices,
  };
}

/**
 * Removes duplicate devices while keeping all entries, including incomplete ones.
 * Validation of devices will be performed at a later stage.
 */
function removeDuplicateDevices(
  devices: InvalidatedConfig['devices']
): InvalidatedConfig['devices'] {
  if (!devices || !Array.isArray(devices)) {
    return devices;
  }

  const uniqueDevices = new Set<string>();

  return devices.filter((device) => {
    if (!device) return true; // Keep even undefined devices

    const { id, osVersion, osTheme, osLanguage } = device;
    const key = JSON.stringify({ id, osVersion, osTheme, osLanguage }, null, 1)
      .replace(/\n/g, '')
      .replace(/}$/, ' }');

    if (uniqueDevices.has(key)) {
      console.log(chalk.yellow('Config Warning: duplicated device', key, '\n'));

      return false;
    }

    uniqueDevices.add(key);

    return true;
  });
}

function getAsyncUploadArguments(parameters: Parameters): { path: string; platform: Platform } {
  if (parameters.android && parameters.ios) {
    throw new Error(
      getErrorMessage({
        message:
          'If you are providing both Android and iOS at the same time, use Sherlo in regular mode (without the `--async` flag)',
      })
    );
  }

  if (!parameters.android && !parameters.ios) {
    throw new Error(
      getErrorMessage({
        message: 'When using "asyncBuildIndex" you need to provide one build path, ios or android',
      })
    );
  }

  if (parameters.android) {
    validateConfigPlatformPath(parameters.android, 'android');

    return { path: parameters.android, platform: 'android' };
  }

  if (parameters.ios) {
    validateConfigPlatformPath(parameters.ios, 'ios');

    return { path: parameters.ios, platform: 'ios' };
  }

  throw new Error(
    getErrorMessage({
      type: 'unexpected',
      message: 'Unexpected error in getAsyncUploadArguments function',
    })
  );
}
