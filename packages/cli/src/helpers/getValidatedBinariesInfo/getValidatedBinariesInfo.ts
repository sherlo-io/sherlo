import { GetNextBuildInfoReturn, Platform } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import { EXPO_CLOUD_BUILDS_COMMAND, EXPO_UPDATES_COMMAND, PLATFORM_LABEL } from '../../constants';
import { Command, Config } from '../../types';
import getPlatformsToTest from '../getPlatformsToTest';
import throwError from '../throwError';
import getLocalBinariesInfo, { LocalBinariesInfo } from './getLocalBinariesInfo';
import { BinariesInfo, BinaryInfo } from './types';
import validateBinariesInfo from './validateBinariesInfo';
import handleClientError from '../handleClientError';

type Params = ExpoCloudBuildsParams | NonExpoCloudBuildsParams;

type ExpoCloudBuildsParams = BaseParams & {
  command: typeof EXPO_CLOUD_BUILDS_COMMAND;
  buildPath: string;
  platform: Platform;
};

type NonExpoCloudBuildsParams = BaseParams & {
  command: Exclude<Command, typeof EXPO_CLOUD_BUILDS_COMMAND>;
  config: Config<'withBuildPaths'>;
};

type BaseParams = {
  client: ReturnType<typeof SDKApiClient>;
  command: Command;
  projectIndex: number;
  teamId: string;
};

async function getValidatedBinariesInfo(
  params: Params
): Promise<BinariesInfo & { sdkVersion: string }> {
  let platforms: Platform[];
  let androidPath: string | undefined;
  let iosPath: string | undefined;

  const { client, command, projectIndex, teamId } = params;

  if (command === EXPO_CLOUD_BUILDS_COMMAND) {
    platforms = [params.platform];
    androidPath = params.platform === 'android' ? params.buildPath : undefined;
    iosPath = params.platform === 'ios' ? params.buildPath : undefined;
  } else {
    platforms = getPlatformsToTest(params.config.devices);
    androidPath = params.config.android;
    iosPath = params.config.ios;
  }

  const localBinariesInfo = await getLocalBinariesInfo({
    paths: { android: androidPath, ios: iosPath },
    platforms,
  });

  const { binariesInfo: remoteBinariesInfoOrUploadInfo } = await client
    .getNextBuildInfo({
      binaryHashes: { android: localBinariesInfo.android?.hash, ios: localBinariesInfo.ios?.hash },
      platforms,
      projectIndex,
      teamId,
      binaryReuseMode:
        command === EXPO_UPDATES_COMMAND ? 'requireHashMatchOrLatestIfMissing' : 'requireHashMatch',
    })
    .catch(handleClientError);

  const android = getBinaryInfo({
    platform: 'android',
    platforms,
    localBinariesInfo,
    remoteBinariesInfoOrUploadInfo,
    command,
  });

  const ios = getBinaryInfo({
    platform: 'ios',
    platforms,
    localBinariesInfo,
    remoteBinariesInfoOrUploadInfo,
    command,
  });

  validateBinariesInfo({ android, ios, command });

  const sdkVersion = android?.sdkVersion || ios?.sdkVersion;
  if (!sdkVersion) {
    throwError({
      type: 'unexpected',
      message: 'SDK version is missing after validation',
    });
  }

  return { android, ios, sdkVersion };
}

export default getValidatedBinariesInfo;

/* ========================================================================== */

function getBinaryInfo({
  platform,
  platforms,
  localBinariesInfo,
  remoteBinariesInfoOrUploadInfo,
  command,
}: {
  platform: Platform;
  platforms: Platform[];
  localBinariesInfo: LocalBinariesInfo;
  remoteBinariesInfoOrUploadInfo: GetNextBuildInfoReturn['binariesInfo'];
  command: Command;
}): BinaryInfo | undefined {
  if (!platforms.includes(platform)) {
    return;
  }

  if (!remoteBinariesInfoOrUploadInfo[platform]) {
    throwError({
      type: 'unexpected',
      message: `${PLATFORM_LABEL[platform]} remote binary info is missing`,
    });
  }

  if (command !== EXPO_UPDATES_COMMAND && !localBinariesInfo[platform]) {
    throwError({
      type: 'unexpected',
      message: `${PLATFORM_LABEL[platform]} local binary info or upload info is missing`,
    });
  }

  const binaryInfo = {
    ...remoteBinariesInfoOrUploadInfo[platform],
    ...localBinariesInfo[platform],
  };

  console.log('\n\nlocalBinariesInfo', localBinariesInfo[platform]);

  console.log('\n\nremoteBinariesInfoOrUploadInfo', remoteBinariesInfoOrUploadInfo[platform]);

  console.log('\n\nbinaryInfo', binaryInfo);

  // TODO: tutaj powinnismy rzucac error dla ExpoUpdates ze musi zauploadowac binarke
  // TODO: potrzeba null i undefined?
  if (!binaryInfo.hash || binaryInfo.isExpoDev === undefined || binaryInfo.isExpoDev === null) {
    throwError({
      type: 'unexpected',
      message: `${PLATFORM_LABEL[platform]} binary info is missing required fields`,
    });
  }

  return { ...binaryInfo, hash: binaryInfo.hash!, isExpoDev: binaryInfo.isExpoDev! };
}
