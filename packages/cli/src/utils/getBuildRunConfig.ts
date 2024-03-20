import { BuildRunConfig, InitBuildReturn } from '@sherlo/api-types';
import { Config } from '../types';

function getBuildRunConfig({
  buildPresignedUploadUrls,
  config,
}: {
  buildPresignedUploadUrls: InitBuildReturn['buildPresignedUploadUrls'];
  config: Config;
}): BuildRunConfig {
  const { android, exclude, include, ios } = config;

  return {
    include,
    exclude,
    android:
      android && buildPresignedUploadUrls.android
        ? {
            devices: android.devices,
            packageName: android.packageName,
            activity: android.activity,
            s3Key: buildPresignedUploadUrls.android.s3Key,
          }
        : undefined,
    ios:
      ios && buildPresignedUploadUrls.ios
        ? {
            devices: ios.devices,
            bundleIdentifier: ios.bundleIdentifier,
            s3Key: buildPresignedUploadUrls.ios.s3Key,
          }
        : undefined,
  };
}

export default getBuildRunConfig;
