import { Platform } from '@sherlo/api-types';
import fs from 'fs';
import { DOCS_LINK, EXPO_UPDATE_COMMAND, IOS_FILE_TYPES } from '../../constants';
import { Command } from '../../types';
import throwError from '../throwError';

function validatePlatformPaths({
  android,
  command,
  ios,
  platformsToValidate,
}: {
  command: Command;
  platformsToValidate: Platform[];
  android?: string;
  ios?: string;
}): void {
  if (
    platformsToValidate.includes('android') &&
    android === undefined &&
    platformsToValidate.includes('ios') &&
    ios === undefined
  ) {
    throwError(getError({ type: 'missingBothPaths' }, command));
  }

  if (platformsToValidate.includes('android') && android === undefined) {
    throwError(getError({ type: 'missingAndroidPath' }, command));
  }

  if (platformsToValidate.includes('ios') && ios === undefined) {
    throwError(getError({ type: 'missingIosPath' }, command));
  }

  if (android) validatePlatformPath({ path: android, platform: 'android', command });

  if (ios) validatePlatformPath({ path: ios, platform: 'ios', command });
}

export default validatePlatformPaths;

/* ========================================================================== */

function validatePlatformPath({
  command,
  path,
  platform,
}: {
  command: Command;
  path: string;
  platform: Platform;
}): void {
  if (typeof path !== 'string') {
    throwError(
      getError({ type: platform === 'android' ? 'invalidAndroidType' : 'invalidIosType' }, command)
    );
  }

  if (!fs.existsSync(path)) {
    throwError(
      getError(
        {
          type: platform === 'android' ? 'androidBuildNotFound' : 'iosBuildNotFound',
          path,
        },
        command
      )
    );
  }

  if (!hasValidExtension({ path, platform })) {
    throwError(
      getError(
        {
          type: platform === 'android' ? 'invalidAndroidFileType' : 'invalidIosFileType',
          path,
        },
        command
      )
    );
  }
}

const fileType: { [platformName in Platform]: readonly string[] } = {
  android: ['.apk'],
  ios: IOS_FILE_TYPES,
};

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

type PlatformPathError =
  | { type: 'missingBothPaths' }
  | { type: 'missingAndroidPath' }
  | { type: 'missingIosPath' }
  | { type: 'invalidAndroidType' }
  | { type: 'invalidIosType' }
  | { type: 'androidBuildNotFound'; path: string }
  | { type: 'iosBuildNotFound'; path: string }
  | { type: 'invalidAndroidFileType'; path: string }
  | { type: 'invalidIosFileType'; path: string };

const learnMoreLink: { [platform in Platform | 'both']: string } = {
  both: DOCS_LINK.config,
  android: DOCS_LINK.configAndroid,
  ios: DOCS_LINK.configIos,
};

function getError(error: PlatformPathError, command: Command) {
  const missingExpoUpdateNote =
    command === EXPO_UPDATE_COMMAND
      ? `\n\nNote: Future \`sherlo ${EXPO_UPDATE_COMMAND}\` runs won't require paths, as previously uploaded builds will be reused (unless they fail validation)\n`
      : '';

  switch (error.type) {
    case 'missingBothPaths':
      return {
        message:
          'Missing required Android and iOS build paths (based on devices in config). Pass them using `--android` and `--ios` flags or add them to the config file' +
          missingExpoUpdateNote,
        learnMoreLink: learnMoreLink.both,
      };
    case 'missingAndroidPath':
      return {
        message:
          'Missing required Android build path (based on devices in config). Pass it using `--android` flag or add `android` to the config file' +
          missingExpoUpdateNote,
        learnMoreLink: learnMoreLink.android,
      };
    case 'missingIosPath':
      return {
        message:
          'Missing required iOS build path (based on devices in config). Pass it using `--ios` flag or add `ios` to the config file' +
          missingExpoUpdateNote,
        learnMoreLink: learnMoreLink.ios,
      };
    case 'invalidAndroidType':
      return {
        message: 'Android build path must be a string',
        learnMoreLink: learnMoreLink.android,
      };
    case 'invalidIosType':
      return {
        message: 'iOS build path must be a string',
        learnMoreLink: learnMoreLink.ios,
      };
    case 'androidBuildNotFound':
      return {
        message: `Android build not found at path: "${error.path}"`,
        learnMoreLink: learnMoreLink.android,
      };
    case 'iosBuildNotFound':
      return {
        message: `iOS build not found at path: "${error.path}"`,
        learnMoreLink: learnMoreLink.ios,
      };
    case 'invalidAndroidFileType':
      return {
        message: `Invalid Android build file type. Expected: ${formatValidFileTypes('android')} file, got: "${error.path}"`,
        learnMoreLink: learnMoreLink.android,
      };
    case 'invalidIosFileType':
      return {
        message: `Invalid iOS build file type. Expected: ${formatValidFileTypes('ios')} file, got: "${error.path}"`,
        learnMoreLink: learnMoreLink.ios,
      };
  }
}
