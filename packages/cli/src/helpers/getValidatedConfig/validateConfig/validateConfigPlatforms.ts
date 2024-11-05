import { Platform } from '@sherlo/api-types';
import fs from 'fs';
import { DOCS_LINK, IOS_FILE_TYPES } from '../../../constants';
import { Config, InvalidatedConfig } from '../../../types';
import getPlatformsToTest from '../../getPlatformsToTest';
import throwConfigError from '../../throwConfigError';

function validateConfigPlatforms(config: InvalidatedConfig): void {
  const platformsToTest = getPlatformsToTest(
    config.devices as Config['devices'] /* At this point we know that config.devices is validated */
  );

  if (
    platformsToTest.includes('android') &&
    !config.android &&
    platformsToTest.includes('ios') &&
    !config.ios
  ) {
    throwConfigError(
      'missing both `android` and `ios` paths (based on devices defined in config)',
      learnMoreLink.both
    );
  }

  if (platformsToTest.includes('android') && !config.android) {
    throwConfigError(
      'missing `android` path (based on devices defined in config)',
      learnMoreLink.android
    );
  }

  if (platformsToTest.includes('ios') && !config.ios) {
    throwConfigError('missing `ios` path (based on devices defined in config)', learnMoreLink.ios);
  }

  if (config.android) validatePlatformPath(config.android, 'android');
  if (config.ios) validatePlatformPath(config.ios, 'ios');
}

export default validateConfigPlatforms;

/* ========================================================================== */

const learnMoreLink: { [platform in Platform | 'both']: string } = {
  both: DOCS_LINK.config,
  android: DOCS_LINK.configAndroid,
  ios: DOCS_LINK.configIos,
};

const fileType: { [platformName in Platform]: readonly string[] } = {
  android: ['.apk'],
  ios: IOS_FILE_TYPES,
};

function validatePlatformPath(path: string | undefined, platform: Platform): void {
  if (!path || typeof path !== 'string') {
    throwConfigError(`\`${platform}\` must be a defined string`, learnMoreLink[platform]);
  }

  if (!fs.existsSync(path) || !hasValidExtension({ path, platform })) {
    throwConfigError(
      `\`${platform}\` path must point to an ${formatValidFileTypes(platform)} file`,
      learnMoreLink[platform]
    );
  }
}

function hasValidExtension({ path, platform }: { path: string; platform: Platform }) {
  return fileType[platform].some((extension) => path.endsWith(extension));
}

function formatValidFileTypes(platform: Platform) {
  const fileTypes = fileType[platform];

  if (fileTypes.length === 1) {
    return fileTypes[0];
  }

  const formattedFileTypes = [...fileTypes];
  const lastType = formattedFileTypes.pop();
  return `${formattedFileTypes.join(', ')}, or ${lastType}`;
}
