import { Platform } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import {
  DEFAULT_PROJECT_ROOT,
  EXPO_UPDATE_COMMAND,
  EAS_BUILD_ON_COMPLETE_COMMAND,
} from '../../../constants';
import { Command, CommandParams } from '../../../types';
import handleClientError from '../../handleClientError';
import getBinaryInfo from './getBinaryInfo';
import getLocalBinariesInfo from './getLocalBinariesInfo';

type Params = EasBuildOnCompleteCommandParams | OtherCommandParams;

type BaseParams = {
  client: ReturnType<typeof SDKApiClient>;
  platforms: Platform[];
  projectIndex: number;
  teamId: string;
  android?: string;
  ios?: string;
};

type EasBuildOnCompleteCommandParams = BaseParams & {
  command: EAS_BUILD_ON_COMPLETE_COMMAND;
};
type OtherCommandParams = BaseParams & {
  command: OTHER_COMMAND;
  commandParams: CommandParams<OTHER_COMMAND>;
};

type EAS_BUILD_ON_COMPLETE_COMMAND = typeof EAS_BUILD_ON_COMPLETE_COMMAND;
type OTHER_COMMAND = Exclude<Command, EAS_BUILD_ON_COMPLETE_COMMAND>;

async function getBinariesInfoAndNextBuildIndex(params: Params) {
  const { command, client, platforms, projectIndex, teamId, android, ios } = params;

  const localBinariesInfo = await getLocalBinariesInfo({
    paths: { android, ios },
    platforms,
    projectRoot:
      command === EAS_BUILD_ON_COMPLETE_COMMAND
        ? DEFAULT_PROJECT_ROOT
        : params.commandParams.projectRoot,
    command,
  });

  let { binariesInfo: remoteBinariesInfoOrUploadInfo, nextBuildIndex } = await client
    .getNextBuildInfo({
      binaryHashes: { android: localBinariesInfo.android?.hash, ios: localBinariesInfo.ios?.hash },
      platforms,
      projectIndex,
      teamId,
      binaryReuseMode:
        command === EXPO_UPDATE_COMMAND ? 'requireHashMatchOrLatestExpoDev' : 'requireHashMatch',
    })
    .catch(handleClientError);

  const binariesInfo = {
    android: getBinaryInfo({
      platform: 'android',
      localBinariesInfo,
      remoteBinariesInfoOrUploadInfo,
      ...params,
    }),
    ios: getBinaryInfo({
      platform: 'ios',
      localBinariesInfo,
      remoteBinariesInfoOrUploadInfo,
      ...params,
    }),
  };

  return { binariesInfo, nextBuildIndex };
}

export default getBinariesInfoAndNextBuildIndex;
