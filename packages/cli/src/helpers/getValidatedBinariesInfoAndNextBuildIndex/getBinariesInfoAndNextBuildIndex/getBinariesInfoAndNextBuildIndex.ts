import { Platform } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import { DEFAULT_PROJECT_ROOT, EAS_BUILD_ON_COMPLETE_COMMAND } from '../../../constants';
import { BinariesInfo, Command, CommandParams } from '../../../types';
import handleClientError from '../../handleClientError';
import reporting from '../../reporting';
import validateBinariesInfo from '../validateBinariesInfo';
import getBinaryInfo from './getBinaryInfo';
import getLocalBinariesInfo from './getLocalBinariesInfo';

type Params = EasBuildOnCompleteCommandParams | OtherCommandParams;

type EasBuildOnCompleteCommandParams = BaseParams & {
  command: EAS_BUILD_ON_COMPLETE_COMMAND;
};
type OtherCommandParams = BaseParams & {
  command: OTHER_COMMAND;
  commandParams: CommandParams<OTHER_COMMAND>;
};

type BaseParams = {
  client: ReturnType<typeof sdkClient>;
  platforms: Platform[];
  projectIndex: number;
  teamId: string;
  android?: string;
  ios?: string;
};

type EAS_BUILD_ON_COMPLETE_COMMAND = typeof EAS_BUILD_ON_COMPLETE_COMMAND;
type OTHER_COMMAND = Exclude<Command, EAS_BUILD_ON_COMPLETE_COMMAND>;

async function getBinariesInfoAndNextBuildIndex(
  params: Params
): Promise<{ binariesInfo: BinariesInfo; nextBuildIndex: number }> {
  const { command, client, platforms, projectIndex, teamId, android, ios } = params;

  const localBinariesInfo = await getLocalBinariesInfo({
    paths: { android, ios },
    platforms,
    projectRoot:
      command === EAS_BUILD_ON_COMPLETE_COMMAND
        ? DEFAULT_PROJECT_ROOT
        : params.commandParams.projectRoot,
  });

  // Validate local binary data before making API call - fail fast on wrong build type,
  // missing Sherlo, outdated SDK, etc. without wasting time on a network round-trip
  validateBinariesInfo({
    binariesInfo: {
      android: localBinariesInfo.android ? { ...localBinariesInfo.android, s3Key: '' } : undefined,
      ios: localBinariesInfo.ios ? { ...localBinariesInfo.ios, s3Key: '' } : undefined,
    },
    command,
  });

  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling getNextBuildInfo API',
    data: { command, teamId, projectIndex, platforms },
    level: 'info',
  });

  let { binariesInfo: remoteBinariesInfoOrUploadInfo, nextBuildIndex } = await client
    .getNextBuildInfo({
      binaryHashes: { android: localBinariesInfo.android?.hash, ios: localBinariesInfo.ios?.hash },
      platforms,
      projectIndex,
      teamId,
      binaryReuseMode: 'requireHashMatch',
    })
    .catch(handleClientError);

  const binariesInfo = {
    android: getBinaryInfo({
      platform: 'android',
      platforms,
      localBinariesInfo,
      remoteBinariesInfoOrUploadInfo,
    }),
    ios: getBinaryInfo({
      platform: 'ios',
      platforms,
      localBinariesInfo,
      remoteBinariesInfoOrUploadInfo,
    }),
  };

  return { binariesInfo, nextBuildIndex };
}

export default getBinariesInfoAndNextBuildIndex;
