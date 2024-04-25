import { Build, Platform } from '@sherlo/api-types';
import { defaultDeviceOsLanguage, defaultDeviceOsTheme } from '@sherlo/shared';
import nodePath from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getErrorMessage } from '../utils';
import { Config, InvalidatedConfig, Mode } from '../types';
import {
  getGitInfo,
  parseConfigFile,
  validateConfigDevices,
  validateConfigPlatformPath,
  validateConfigPlatforms,
  validateConfigToken,
} from './utils';

type Parameters<T extends 'default' | 'withDefaults' = 'default'> = {
  async?: boolean;
  asyncBuildIndex?: number;
  token?: string;
  android?: string;
  ios?: string;
  gitInfo?: Build['gitInfo']; // Can be passed only in GitHub Action
} & (T extends 'withDefaults'
  ? {
      config: string;
      projectRoot: string;
    }
  : {
      config?: string;
      projectRoot?: string;
    });

type Arguments = SyncArguments | AsyncInitArguments | AsyncUploadArguments;
type SyncArguments = {
  mode: 'sync';
  token: string;
  config: Config;
  gitInfo: Build['gitInfo'];
};
type AsyncInitArguments = {
  mode: 'asyncInit';
  token: string;
  config: Config<'withoutPaths'>;
  gitInfo: Build['gitInfo'];
  projectRoot: string;
};
type AsyncUploadArguments = {
  mode: 'asyncUpload';
  token: string;
  asyncBuildIndex: number;
  path: string;
  platform: Platform;
};

function getArguments(githubActionParameters?: Parameters): Arguments {
  const parameters = githubActionParameters ?? cliParameters;
  const updatedParameters = updateParameters(parameters);

  const config = parseConfigFile(updatedParameters.config);
  const updatedConfig = updateConfig(config, updatedParameters);

  let mode: Mode = 'sync';
  if (updatedParameters.async && !updatedParameters.asyncBuildIndex) {
    mode = 'asyncInit';
  } else if (updatedParameters.asyncBuildIndex) {
    mode = 'asyncUpload';
  }

  validateConfigToken(updatedConfig);
  const { token } = updatedConfig;

  switch (mode) {
    case 'sync': {
      validateConfigPlatforms(updatedConfig, 'withPaths');
      validateConfigDevices(updatedConfig);
      // validateFilters(updatedConfig);

      return {
        mode,
        token,
        config: updatedConfig as Config,
        gitInfo: githubActionParameters?.gitInfo ?? getGitInfo(),
      } satisfies SyncArguments;
    }

    case 'asyncInit': {
      validateConfigPlatforms(updatedConfig, 'withoutPaths');
      validateConfigDevices(updatedConfig);
      // validateFilters(updatedConfig);

      return {
        mode,
        token,
        config: updatedConfig as Config<'withoutPaths'>,
        gitInfo: githubActionParameters?.gitInfo ?? getGitInfo(),
        projectRoot: updatedParameters.projectRoot,
      } satisfies AsyncInitArguments;
    }

    case 'asyncUpload': {
      const { path, platform } = getAsyncUploadArguments(updatedParameters);
      const { asyncBuildIndex } = updatedParameters;

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

const DEFAULT_CONFIG_PATH = 'sherlo.config.json';
const DEFAULT_PROJECT_ROOT = '.';

const cliParameters = yargs(hideBin(process.argv))
  .option('config', {
    default: DEFAULT_CONFIG_PATH,
    description: 'Path to Sherlo config',
    type: 'string',
  })
  .option('async', {
    description: 'Run Sherlo in async mode, meaning you don’t have to provide builds immediately',
    type: 'boolean',
  })
  .option('asyncBuildIndex', {
    description:
      'If you want to upload android or ios build to existing sherlo build in async mode, you need to provide index of build you want to update',
    type: 'number',
  })
  .option('projectRoot', {
    default: DEFAULT_PROJECT_ROOT,
    description:
      'Use this option to specify the root of the react native project when working with monorepo',
    type: 'string',
  })
  .option('token', {
    description: 'Sherlo project token',
    type: 'string',
  })
  .option('android', {
    description: 'Path to Android build in .apk format',
    type: 'string',
  })
  .option('ios', {
    description: 'Path to iOS simulator build in .app or .tar.gz file format',
    type: 'string',
  }).argv as Parameters;

function updateParameters(parameters: Parameters): Parameters<'withDefaults'> {
  // Set defaults if are not defined (can happen in GitHub action case)
  const projectRoot = parameters.projectRoot ?? DEFAULT_PROJECT_ROOT;
  const config = parameters.config ?? DEFAULT_CONFIG_PATH;

  // Update paths based on project root
  return {
    ...parameters,
    projectRoot,
    config: nodePath.join(projectRoot, config),
    android: parameters.android ? nodePath.join(projectRoot, parameters.android) : undefined,
    ios: parameters.ios ? nodePath.join(projectRoot, parameters.ios) : undefined,
  };
}

function updateConfig(
  config: InvalidatedConfig,
  updatedParameters: Parameters<'withDefaults'>
): InvalidatedConfig {
  // Take token from parameters or config file
  const token = updatedParameters.token ?? config.token;

  // Set a proper android path
  let androidPath: string | undefined;
  if (updatedParameters.android) {
    androidPath = updatedParameters.android;
  } else if (config.apps?.android?.path) {
    androidPath = nodePath.join(updatedParameters.projectRoot, config.apps.android.path);
  }
  const android = config.apps?.android
    ? {
        ...config.apps.android,
        path: androidPath,
      }
    : undefined;

  // Set a proper ios path
  let iosPath: string | undefined;
  if (updatedParameters.ios) {
    iosPath = updatedParameters.ios;
  } else if (config.apps?.ios?.path) {
    iosPath = nodePath.join(updatedParameters.projectRoot, config.apps.ios.path);
  }
  const ios = config.apps?.ios
    ? {
        ...config.apps.ios,
        path: iosPath,
      }
    : undefined;

  // Set defaults for devices
  let { devices } = config;
  devices = devices?.map((device) => ({
    ...device,
    osLanguage: device?.osLanguage ?? defaultDeviceOsLanguage,
    osTheme: device?.osTheme ?? defaultDeviceOsTheme,
  }));

  return {
    ...config,
    token,
    apps: {
      ...config.apps,
      android,
      ios,
    },
    devices,
  };
}

function getAsyncUploadArguments(parameters: Parameters): { path: string; platform: Platform } {
  if (parameters.android && parameters.ios) {
    throw new Error(
      getErrorMessage({
        type: 'default',
        message:
          'Don\'t use "asyncBuildIndex" if you\'re providing android and ios at the same time',
      })
    );
  }

  if (!parameters.android && !parameters.ios) {
    throw new Error(
      getErrorMessage({
        type: 'default',
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

export default getArguments;
