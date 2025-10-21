import { Platform } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import { EAS_BUILD_ON_COMPLETE_COMMAND } from '../../constants';
import { BinariesInfo, Command, CommandParams } from '../../types';
import getPlatformsToTest from '../getPlatformsToTest';
import throwError from '../throwError';
import getBinariesInfoAndNextBuildIndex from './getBinariesInfoAndNextBuildIndex';
import validateBinariesInfo from './validateBinariesInfo';

type Params = EasBuildOnCompleteCommandParams | OtherCommandParams;

type BaseParams = {
  client: ReturnType<typeof sdkClient>;
  projectIndex: number;
  teamId: string;
};

type EasBuildOnCompleteCommandParams = BaseParams & {
  command: EAS_BUILD_ON_COMPLETE_COMMAND;
  buildPath: string;
  platform: Platform;
};
type OtherCommandParams = BaseParams & {
  command: OTHER_COMMAND;
  commandParams: CommandParams<OTHER_COMMAND>;
};

type EAS_BUILD_ON_COMPLETE_COMMAND = typeof EAS_BUILD_ON_COMPLETE_COMMAND;
type OTHER_COMMAND = Exclude<Command, EAS_BUILD_ON_COMPLETE_COMMAND>;

async function getValidatedBinariesInfoAndNextBuildIndex(
  params: Params
): Promise<{ binariesInfo: BinariesInfo & { sdkVersion: string }; nextBuildIndex: number }> {
  const { command } = params;

  let platforms: Platform[];
  let android: string | undefined;
  let ios: string | undefined;

  if (command === EAS_BUILD_ON_COMPLETE_COMMAND) {
    platforms = [params.platform];
    android = params.platform === 'android' ? params.buildPath : undefined;
    ios = params.platform === 'ios' ? params.buildPath : undefined;
  } else {
    platforms = getPlatformsToTest(params.commandParams.devices);
    android = params.commandParams.android;
    ios = params.commandParams.ios;
  }

  const { binariesInfo, nextBuildIndex } = await getBinariesInfoAndNextBuildIndex({
    ...params,
    android,
    ios,
    platforms,
  });

  validateBinariesInfo({ binariesInfo, command });

  const sdkVersion = binariesInfo.android?.sdkVersion || binariesInfo.ios?.sdkVersion;
  if (!sdkVersion) {
    throwError({
      type: 'unexpected',
      error: new Error('SDK version is missing after validation'),
    });
  }

  return { binariesInfo: { ...binariesInfo, sdkVersion }, nextBuildIndex };
}

export default getValidatedBinariesInfoAndNextBuildIndex;
