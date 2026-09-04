import { GetNextBuildInfoReturn, Platform } from '@sherlo/api-types';
import { PLATFORM_LABEL } from '../../../constants';
import { BinaryInfo, BuildType } from '../../../types';
import throwError from '../../throwError';
import getLocalBinariesInfo from './getLocalBinariesInfo';

function getBinaryInfo({
  localBinariesInfo,
  platform,
  platforms,
  remoteBinariesInfoOrUploadInfo,
}: {
  localBinariesInfo: Awaited<ReturnType<typeof getLocalBinariesInfo>>;
  platform: Platform;
  platforms: Platform[];
  remoteBinariesInfoOrUploadInfo: GetNextBuildInfoReturn['binariesInfo'];
}): BinaryInfo | undefined {
  if (!platforms.includes(platform)) {
    return;
  }

  if (!remoteBinariesInfoOrUploadInfo[platform]) {
    throwError({
      type: 'unexpected',
      error: new Error(`${PLATFORM_LABEL[platform]} remote binary info or upload info is missing`),
    });
  }

  if (!localBinariesInfo[platform]) {
    throwError({
      type: 'unexpected',
      error: new Error(`${PLATFORM_LABEL[platform]} local binary info is missing`),
    });
  }

  // androidAbis is local-only validation data - strip it before building the upload payload
  const { androidAbis: _androidAbis, ...localInfo } = localBinariesInfo[platform] ?? {};
  let binaryInfo = {
    ...mapRemoteBinaryInfo(remoteBinariesInfoOrUploadInfo[platform]),
    ...localInfo,
  };

  if (checkIfBinaryInfoIsMissingRequiredFields(binaryInfo)) {
    throwError({
      type: 'unexpected',
      error: new Error(`${PLATFORM_LABEL[platform]} binary info is missing required fields`),
    });
  }

  if (!isValidBinaryInfo(binaryInfo)) {
    throwError({
      type: 'unexpected',
      error: new Error(`${PLATFORM_LABEL[platform]} binary info is invalid`),
    });
  }

  return binaryInfo;
}

export default getBinaryInfo;

/* ========================================================================== */

const REQUIRED_BINARY_INFO_FIELDS: (keyof BinaryInfo)[] = ['hash', 'buildType', 's3Key'];

function checkIfBinaryInfoIsMissingRequiredFields(binaryInfo: any): binaryInfo is BinaryInfo {
  return REQUIRED_BINARY_INFO_FIELDS.some((field) => {
    const value = binaryInfo[field];

    return value === undefined || value === null;
  });
}

function isValidBinaryInfo(binaryInfo: any): binaryInfo is BinaryInfo {
  return REQUIRED_BINARY_INFO_FIELDS.every((field) => field in binaryInfo);
}

function mapRemoteBinaryInfo(remote: any): Partial<BinaryInfo> | undefined {
  if (!remote) return undefined;

  // Map API's isExpoDev boolean to CLI's buildType
  const { isExpoDev, isDevelopmentBuild, ...rest } = remote;
  const isDev = isDevelopmentBuild ?? isExpoDev;

  return {
    ...rest,
    ...(isDev != null ? { buildType: (isDev ? 'development' : 'preview') as BuildType } : {}),
  };
}
