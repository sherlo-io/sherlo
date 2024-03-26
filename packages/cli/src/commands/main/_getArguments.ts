import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Build } from '@sherlo/api-types';
import { getErrorMessage, getGitInfo } from '../../utils';
import { Config, Mode } from '../../types';
import path from 'path';
import parse from '../../utils/getConfig/parse';
import {
  validateFilters,
  validatePlatformPath,
  validatePlatforms,
  validateProjectToken,
} from '../../utils/getConfig/validate';

const DEFAULT_CONFIG_PATH = 'sherlo.config.json';
const DEFAULT_PROJECT_ROOT = '.';

export type CLIArgs = {
  config?: string;
  asyncUpload?: boolean;
  projectRoot?: string;
  asyncUploadBuildIndex?: number;
  token?: string;
  android?: string;
  ios?: string;
};

export type GHActionArgs = CLIArgs & {
  gitInfo?: Build['gitInfo'];
};

export type Arguments =
  | {
      mode: 'sync';
      config: Config<'withPaths'>;
      gitInfo: Build['gitInfo'];
      token: string;
    }
  | {
      mode: 'asyncInit';
      projectRoot: string;
      config: Config<'withoutPaths'>;
      gitInfo: Build['gitInfo'];
      token: string;
    }
  | {
      mode: 'asyncUpload';
      asyncUploadBuildIndex: number;
      path: string;
      platform: 'android' | 'ios';
      token: string;
    };

function getArguments(ghActionArgs?: GHActionArgs): Arguments {
  // get arguments from github action or yargs
  const cliArgs = yargs(hideBin(process.argv))
    .option('config', {
      default: DEFAULT_CONFIG_PATH,
      description: 'Path to Sherlo config',
      type: 'string',
    })
    .option('asyncUpload', {
      description:
        'Run Sherlo in lazy upload mode, meaning you don’t have to provide builds immidiately. You can send them with the same command later on',
      type: 'boolean',
    })
    .option('asyncUploadBuildIndex', {
      description:
        'if you want to upload android or ios build to existing sherlo build in async upload mode, you need to provide index of build you want to update',
      type: 'number',
    })
    .option('projectRoot', {
      default: '.',
      description:
        'use this option to specify the root of the react native project when working with monorepo',
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
    }).argv;

  const args = ghActionArgs || (cliArgs as CLIArgs);

  // set defaults
  if (!args.config) args.config = DEFAULT_CONFIG_PATH;
  if (!args.projectRoot) args.projectRoot = DEFAULT_PROJECT_ROOT;

  // set mode based on async upload
  let mode: Mode = 'sync';
  if (args.asyncUploadBuildIndex) {
    mode = 'asyncUpload';
  } else if (args.asyncUpload) {
    mode = 'asyncInit';
  }

  // adjust paths for projectRoot path
  if (args.android) args.android = path.join(args.projectRoot, args.android);
  if (args.ios) args.ios = path.join(args.projectRoot, args.ios);
  if (args.config) args.config = path.join(args.projectRoot, args.config);

  const gitInfo = ghActionArgs?.gitInfo || getGitInfo();

  // parse config
  const config = parse(args.config);

  // adjust config paths for projectRoot path
  if (config.android?.path) config.android.path = path.join(args.projectRoot, config.android?.path);
  if (config.ios?.path) config.ios.path = path.join(args.projectRoot, config.ios?.path);

  const token = args.token || config.token;
  validateProjectToken(token);

  if (mode === 'asyncUpload') {
    const asyncUploadArgs = getAsyncUploadArgs(args);

    return {
      mode,
      token: token!,
      path: asyncUploadArgs.path,
      platform: asyncUploadArgs.platform,
      asyncUploadBuildIndex: args.asyncUploadBuildIndex!, // it's impossible for asyncUploadBuildIndex to be undefined in 'asyncUpload' mode
    };
  } else {
    const android = config.android;
    const ios = config.ios;
    validatePlatforms({ android, ios }, mode !== 'sync');

    const include = config.include;
    const exclude = config.exclude;
    validateFilters({ include, exclude });

    if (mode === 'asyncInit') {
      return {
        mode,
        config: config as Config<'withoutPaths'>,
        gitInfo,
        projectRoot: args.projectRoot,
        token: token!,
      };
    } else {
      return {
        mode,
        config: config as Config<'withPaths'>,
        gitInfo,
        token: token!,
      };
    }
  }
}

function getAsyncUploadArgs(args: { android?: string; ios?: string }): {
  path: string;
  platform: 'android' | 'ios';
} {
  if (args.android && args.ios) {
    throw new Error(
      getErrorMessage({
        type: 'default',
        message:
          "Don't use 'asyncUploadBuildIndex' if you're providing android and ios at the same time",
      })
    );
  } else if (!args.android && !args.ios) {
    throw new Error(
      getErrorMessage({
        type: 'default',
        message:
          "When using 'asyncUploadBuildIndex' you need to provide one build path, ios or android",
      })
    );
  } else if (args.android) {
    validatePlatformPath(args.android, 'android');

    return { path: args.android, platform: 'android' };
  } else {
    validatePlatformPath(args.ios, 'ios');

    return { path: args.ios!, platform: 'ios' };
  }
}

export default getArguments;
