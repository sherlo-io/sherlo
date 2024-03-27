import { BuildRunConfig, GetBuildUploadUrlsReturn } from '@sherlo/api-types';
import { BaseConfig } from '../types';

function getBuildRunConfig({
  buildPresignedUploadUrls,
  config,
}: {
  buildPresignedUploadUrls?: GetBuildUploadUrlsReturn['buildPresignedUploadUrls'];
  config: BaseConfig;
}): BuildRunConfig {
  const { android, exclude, include, ios } = config;

  return {
    include,
    exclude,
    android: android
      ? {
          devices: android.devices,
          packageName: android.packageName,
          activity: android.activity,
          s3Key: buildPresignedUploadUrls?.android?.s3Key || '',
        }
      : undefined,
    ios: ios
      ? {
          devices: ios.devices,
          bundleIdentifier: ios.bundleIdentifier,
          s3Key: buildPresignedUploadUrls?.ios?.s3Key || '',
        }
      : undefined,
  };
}

export default getBuildRunConfig;
