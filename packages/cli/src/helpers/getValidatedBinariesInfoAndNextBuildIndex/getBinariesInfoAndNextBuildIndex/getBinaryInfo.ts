import { GetNextBuildInfoReturn, Platform } from '@sherlo/api-types';
import {
  EXPO_UPDATE_COMMAND,
  PLATFORM_LABEL,
  EAS_BUILD_ON_COMPLETE_COMMAND,
} from '../../../constants';
import { Command, CommandParams } from '../../../types';
import { validatePlatformPaths } from '../../shared';
import throwError from '../../throwError';
import { BinaryInfo } from '../types';
import getLocalBinariesInfo from './getLocalBinariesInfo';

type Params = EasBuildOnCompleteCommandParams | OtherCommandParams;

type BaseParams = {
  localBinariesInfo: Awaited<ReturnType<typeof getLocalBinariesInfo>>;
  platform: Platform;
  platforms: Platform[];
  remoteBinariesInfoOrUploadInfo: GetNextBuildInfoReturn['binariesInfo'];
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

function getBinaryInfo(params: Params): BinaryInfo | undefined {
  const { command, localBinariesInfo, platform, platforms, remoteBinariesInfoOrUploadInfo } =
    params;

  console.log('[DEBUG] getBinaryInfo - Processing:', {
    platform,
    includeInPlatforms: platforms.includes(platform),
    hasRemoteInfo: !!remoteBinariesInfoOrUploadInfo[platform],
    hasLocalInfo: !!localBinariesInfo[platform],
  });

  if (!platforms.includes(platform)) {
    return;
  }

  if (!remoteBinariesInfoOrUploadInfo[platform]) {
    throwError({
      type: 'unexpected',
      error: new Error(`${PLATFORM_LABEL[platform]} remote binary info or upload info is missing`),
    });
  }

  // Local binary info is always required for every non EXPO_UPDATE_COMMAND
  if (!localBinariesInfo[platform] && command !== EXPO_UPDATE_COMMAND) {
    throwError({
      type: 'unexpected',
      error: new Error(`${PLATFORM_LABEL[platform]} local binary info is missing`),
    });
  }

  let binaryInfo = {
    ...remoteBinariesInfoOrUploadInfo[platform],
    ...localBinariesInfo[platform],
  };

  console.log('[DEBUG] getBinaryInfo for', platform, '- Combined info:', {
    fromRemote: {
      hash: remoteBinariesInfoOrUploadInfo[platform]?.hash?.substring(0, 8) + '...',
      sdkVersion: remoteBinariesInfoOrUploadInfo[platform]?.sdkVersion,
    },
    fromLocal: {
      hash: localBinariesInfo[platform]?.hash?.substring(0, 8) + '...',
      sdkVersion: localBinariesInfo[platform]?.sdkVersion,
    },
    final: {
      hash: binaryInfo?.hash?.substring(0, 8) + '...',
      sdkVersion: binaryInfo?.sdkVersion,
    },
  });

  if (checkIfBinaryInfoIsMissingRequiredFields(binaryInfo)) {
    if (command === EXPO_UPDATE_COMMAND) {
      /**
       * For EXPO_UPDATE_COMMAND, we delay platform paths validation until this stage
       * to first check if we can reuse previously uploaded builds (from remoteBinariesInfo)
       */

      validatePlatformPaths({
        platformsToValidate: [platform],
        android: params.commandParams.android,
        ios: params.commandParams.ios,
        command,
      });
    } else {
      throwError({
        type: 'unexpected',
        error: new Error(`${PLATFORM_LABEL[platform]} binary info is missing required fields`),
      });
    }
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

const REQUIRED_BINARY_INFO_FIELDS = ['hash', 'isExpoDev', 's3Key'];

function checkIfBinaryInfoIsMissingRequiredFields(binaryInfo: any): binaryInfo is BinaryInfo {
  return REQUIRED_BINARY_INFO_FIELDS.some((field) => {
    const value = binaryInfo[field];

    return value === undefined || value === null;
  });
}

function isValidBinaryInfo(binaryInfo: any): binaryInfo is BinaryInfo {
  return REQUIRED_BINARY_INFO_FIELDS.every((field) => field in binaryInfo);
}
