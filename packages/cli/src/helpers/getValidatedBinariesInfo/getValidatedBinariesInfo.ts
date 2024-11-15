import { Platform } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import { EXPO_CLOUD_BUILDS_COMMAND, PLATFORM_LABEL } from '../../constants';
import { Command, Config } from '../../types';
import getBinariesUploadInfo from '../getBinariesUploadInfo';
import getPlatformsToTest from '../getPlatformsToTest';
import throwError from '../throwError';
import getBinaryHashes from './getBinaryHashes';
import getLocalBinariesInfo from './getLocalBinariesInfo';
import { BinariesInfo, BinaryInfo } from './types';
import validateBinariesInfo from './validateBinariesInfo';

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

  if (params.command === EXPO_CLOUD_BUILDS_COMMAND) {
    platforms = [params.platform];
    androidPath = params.platform === 'android' ? params.buildPath : undefined;
    iosPath = params.platform === 'ios' ? params.buildPath : undefined;
  } else {
    platforms = getPlatformsToTest(params.config.devices);
    androidPath = params.config.android;
    iosPath = params.config.ios;
  }

  const binaryHashes = await getBinaryHashes({ platforms, androidPath, iosPath });

  const binariesUploadInfo = await getBinariesUploadInfo(params.client, {
    binaryHashes,
    platforms,
    projectIndex: params.projectIndex,
    teamId: params.teamId,
  });

  const localBinariesInfo = await getLocalBinariesInfo({
    paths: { android: androidPath, ios: iosPath },
    platforms,
  });

  let android: BinaryInfo | undefined;
  let ios: BinaryInfo | undefined;

  if (platforms.includes('android')) {
    if (!binaryHashes.android || !binariesUploadInfo.android || !localBinariesInfo.android) {
      throwError({
        type: 'unexpected',
        message: `${PLATFORM_LABEL.android} binary info is missing`,
      });
    }

    android = {
      ...binariesUploadInfo.android,
      ...localBinariesInfo.android,
      hash: binaryHashes.android,
    };
  }

  if (platforms.includes('ios')) {
    if (!binaryHashes.ios || !binariesUploadInfo.ios || !localBinariesInfo.ios) {
      throwError({
        type: 'unexpected',
        message: `${PLATFORM_LABEL.ios} binary info is missing`,
      });
    }

    ios = {
      ...binariesUploadInfo.ios,
      ...localBinariesInfo.ios,
      hash: binaryHashes.ios,
    };
  }

  validateBinariesInfo({ android, ios, command: params.command });

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
