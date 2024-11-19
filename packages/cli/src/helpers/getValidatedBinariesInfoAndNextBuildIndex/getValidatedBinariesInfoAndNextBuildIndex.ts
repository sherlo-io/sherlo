import { GetNextBuildInfoReturn, Platform } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import {
  ANDROID_OPTION,
  EXPO_CLOUD_BUILDS_COMMAND,
  EXPO_UPDATES_COMMAND,
  IOS_OPTION,
  PLATFORM_LABEL,
} from '../../constants';
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

async function getValidatedBinariesInfoAndNextBuildIndex(
  params: Params
): Promise<{ binariesInfo: BinariesInfo & { sdkVersion: string }; nextBuildIndex: number }> {
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

  const { binariesInfo: remoteBinariesInfoOrUploadInfo, nextBuildIndex } = await client
    .getNextBuildInfo({
      binaryHashes: { android: localBinariesInfo.android?.hash, ios: localBinariesInfo.ios?.hash },
      platforms,
      projectIndex,
      teamId,
      binaryReuseMode:
        command === EXPO_UPDATES_COMMAND ? 'requireHashMatchOrLatestExpoDev' : 'requireHashMatch',
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

  return { binariesInfo: { android, ios, sdkVersion }, nextBuildIndex };
}

export default getValidatedBinariesInfoAndNextBuildIndex;

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
      message: `${PLATFORM_LABEL[platform]} remote binary info or upload info is missing`,
    });
  }

  // Local binary info is always required for every non Expo Updates command
  if (!localBinariesInfo[platform] && command !== EXPO_UPDATES_COMMAND) {
    throwError({
      type: 'unexpected',
      message: `${PLATFORM_LABEL[platform]} local binary info is missing`,
    });
  }

  const binaryInfo = {
    ...remoteBinariesInfoOrUploadInfo[platform],
    ...localBinariesInfo[platform],
  };

  if (!binaryInfo.hash) {
    if (command === EXPO_UPDATES_COMMAND) {
      const pathFlag = `--${platform === 'android' ? ANDROID_OPTION : IOS_OPTION}`;

      throwError({
        message:
          `Missing path to development ${PLATFORM_LABEL[platform]} build (based on devices defined in config)` +
          '\n\n' +
          'You can provide it:\n' +
          `• Using \`${pathFlag}\` flag\n` +
          `• In Sherlo config file under "${platform}" key`,
      });
    } else {
      throwError({
        type: 'unexpected',
        message: `${PLATFORM_LABEL[platform]} binary info is missing required fields`,
      });
    }
  }

  return { ...binaryInfo, hash: binaryInfo.hash!, isExpoDev: binaryInfo.isExpoDev! };
}
