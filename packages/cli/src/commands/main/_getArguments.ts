import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Build } from '@sherlo/api-types';
import { getGitInfo } from '../../utils';
import { Mode } from '../../types';

const DEFAULT_CONFIG_PATH = 'sherlo.config.json';

export type Arguments = {
  mode: Mode;
  config: string;
  asyncUpload: boolean;
  projectRoot: string;
  gitInfo: Build['gitInfo'];
  // Optional
  asyncUploadBuildIndex?: number;
  token?: string;
  android?: string;
  ios?: string;
};

export type OverrideArguments = Partial<Arguments>;

async function getArguments(overrideArguments?: OverrideArguments): Promise<Arguments> {
  const args = await yargs(hideBin(process.argv))
    .option('config', {
      default: DEFAULT_CONFIG_PATH,
      description: 'Path to Sherlo config',
      type: 'string',
    })
    .option('asyncUpload', {
      default: false,
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

  const asyncUpload = overrideArguments?.asyncUpload || args.asyncUpload;
  const asyncUploadBuildIndex =
    overrideArguments?.asyncUploadBuildIndex || args.asyncUploadBuildIndex;

  return {
    mode: asyncUpload ? (asyncUploadBuildIndex ? 'asyncUpload' : 'asyncInit') : 'sync',
    config: overrideArguments?.config || args.config,
    asyncUpload,
    asyncUploadBuildIndex,
    projectRoot: overrideArguments?.projectRoot || args.projectRoot,
    token: overrideArguments?.token || args.token,
    android: overrideArguments?.android || args.android,
    ios: overrideArguments?.ios || args.ios,
    gitInfo: overrideArguments?.gitInfo || getGitInfo(),
  };
}

export default getArguments;
