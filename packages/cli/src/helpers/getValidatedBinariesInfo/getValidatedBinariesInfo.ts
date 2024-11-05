import SDKApiClient from '@sherlo/sdk-client';
import { Config } from '../../types';
import getBinariesUploadInfo from '../getBinariesUploadInfo';
import getPlatformsToTest from '../getPlatformsToTest';
import throwError from '../throwError';
import getBinaryHashes from './getBinaryHashes';
import getLocalBinariesInfo from './getLocalBinariesInfo';
import { BinariesInfo } from './types';
import validateBinariesInfo from './validateBinariesInfo';

async function getValidatedBinariesInfo({
  client,
  config,
  isExpoUpdate,
  projectIndex,
  teamId,
}: {
  client: ReturnType<typeof SDKApiClient>;
  config: Config;
  isExpoUpdate: boolean;
  projectIndex: number;
  teamId: string;
}): Promise<BinariesInfo> {
  const platformsToTest = getPlatformsToTest(config.devices);

  const binaryHashes = await getBinaryHashes({ platformsToTest, config });

  const binariesUploadInfo = await getBinariesUploadInfo(client, {
    binaryHashes,
    platforms: platformsToTest,
    projectIndex,
    teamId,
  });

  const localBinariesInfo = await getLocalBinariesInfo({
    paths: { android: config.android, ios: config.ios },
    platformsToTest,
  });

  let android;
  let ios;

  if (platformsToTest.includes('android')) {
    if (!binariesUploadInfo.android || !localBinariesInfo.android || !binaryHashes.android) {
      throwError({
        type: 'unexpected',
        message: 'Android binary info is missing',
      });
    }

    android = {
      ...binariesUploadInfo.android,
      ...localBinariesInfo.android,
      hash: binaryHashes.android,
    };
  }

  if (platformsToTest.includes('ios')) {
    if (!binariesUploadInfo.ios || !localBinariesInfo.ios || !binaryHashes.ios) {
      throwError({
        type: 'unexpected',
        message: 'iOS binary info is missing',
      });
    }

    ios = {
      ...binariesUploadInfo.ios,
      ...localBinariesInfo.ios,
      hash: binaryHashes.ios,
    };
  }

  validateBinariesInfo({ android, ios }, { isExpoUpdate });

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
