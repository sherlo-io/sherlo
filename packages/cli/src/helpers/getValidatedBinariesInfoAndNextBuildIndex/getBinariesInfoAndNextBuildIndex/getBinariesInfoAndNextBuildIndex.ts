import { Platform } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import {
  DEFAULT_PROJECT_ROOT,
  EAS_BUILD_ON_COMPLETE_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
} from '../../../constants';
import { Command, CommandParams } from '../../../types';
import handleClientError from '../../handleClientError';
import getBinaryInfo from './getBinaryInfo';
import getLocalBinariesInfo from './getLocalBinariesInfo';

type Params = EasBuildOnCompleteCommandParams | OtherCommandParams;

type BaseParams = {
  client: ReturnType<typeof sdkClient>;
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
        command === TEST_EAS_UPDATE_COMMAND
          ? 'requireHashMatchOrLatestExpoDev'
          : 'requireHashMatch',
    })
    .catch(handleClientError);

  const binariesInfo = {
    android: getBinaryInfo({
      ...params,
      platform: 'android',
      localBinariesInfo,
      remoteBinariesInfoOrUploadInfo,
    }),
    ios: getBinaryInfo({
      ...params,
      platform: 'ios',
      localBinariesInfo,
      remoteBinariesInfoOrUploadInfo,
    }),
  };

  return { binariesInfo, nextBuildIndex };
}

export default getBinariesInfoAndNextBuildIndex;
