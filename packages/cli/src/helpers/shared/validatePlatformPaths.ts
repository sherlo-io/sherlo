import { Platform } from '@sherlo/api-types';
import fs from 'fs';
import {
  ANDROID_FILE_TYPES,
  ANDROID_OPTION,
  IOS_FILE_TYPES,
  IOS_OPTION,
} from '../../constants';
import { Command } from '../../types';
import getBuildTypeLabel from '../getBuildTypeLabel';
import getBuildTypeTipBox from '../getBuildTypeTipBox';
import chalk from 'chalk';
import getDeviceConfigHint from '../getDeviceConfigHint';
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
    throwPlatformError({ type: 'missingBothPaths' }, command);
  }

  if (platformsToValidate.includes('android') && android === undefined) {
    throwPlatformError({ type: 'missingAndroidPath' }, command);
  }

  if (platformsToValidate.includes('ios') && ios === undefined) {
    throwPlatformError({ type: 'missingIosPath' }, command);
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
    throwPlatformError(
      { type: platform === 'android' ? 'invalidAndroidType' : 'invalidIosType' },
      command
    );
  }

  if (!fs.existsSync(path)) {
    throwPlatformError(
      { type: platform === 'android' ? 'androidBuildNotFound' : 'iosBuildNotFound', path },
      command
    );
  }

  if (!hasValidExtension({ path, platform })) {
    throwPlatformError(
      { type: platform === 'android' ? 'invalidAndroidFileType' : 'invalidIosFileType', path },
      command
    );
  }
}

const fileType: { [platformName in Platform]: readonly string[] } = {
  android: ANDROID_FILE_TYPES,
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

function formatErrorHint(passHint: string) {
  const deviceHint = chalk.blue(`INFO: ${getDeviceConfigHint()}`);
  return `${passHint}\n\n${deviceHint}`;
}

function throwPlatformError(error: PlatformPathError, command: Command): never {
  throwError(getError(error, command));
}

function getError(error: PlatformPathError, command: Command) {
  const buildTypeLabel = getBuildTypeLabel(command);
  const buildTypePrefix = buildTypeLabel ? `${buildTypeLabel} ` : '';

  const tipBox = getBuildTypeTipBox(command);

  const hintBoth = `Pass using \`--${ANDROID_OPTION}\` and \`--${IOS_OPTION}\` options or set \`android\` and \`ios\` in the config file`;
  const hintAndroid = `Pass using \`--${ANDROID_OPTION}\` option or set \`android\` in the config file`;
  const hintIos = `Pass using \`--${IOS_OPTION}\` option or set \`ios\` in the config file`;

  switch (error.type) {
    case 'missingBothPaths':
      return {
        message: `Missing required Android and iOS ${buildTypePrefix}build paths`,
        above: tipBox,
        below: formatErrorHint(hintBoth),
      };
    case 'missingAndroidPath':
      return {
        message: `Missing required Android ${buildTypePrefix}build path`,
        above: tipBox,
        below: formatErrorHint(hintAndroid),
      };
    case 'missingIosPath':
      return {
        message: `Missing required iOS ${buildTypePrefix}build path`,
        above: tipBox,
        below: formatErrorHint(hintIos),
      };
    case 'invalidAndroidType':
      return {
        message: `Android ${buildTypePrefix}build path must be a string`,
        above: tipBox,
        below: formatErrorHint(hintAndroid),
      };
    case 'invalidIosType':
      return {
        message: `iOS ${buildTypePrefix}build path must be a string`,
        above: tipBox,
        below: formatErrorHint(hintIos),
      };
    case 'androidBuildNotFound':
      return {
        message: `Android ${buildTypePrefix}build not found at path: "${error.path}"`,
        above: tipBox,
        below: formatErrorHint(hintAndroid),
      };
    case 'iosBuildNotFound':
      return {
        message: `iOS ${buildTypePrefix}build not found at path: "${error.path}"`,
        above: tipBox,
        below: formatErrorHint(hintIos),
      };
    case 'invalidAndroidFileType':
      return {
        message: `Invalid Android ${buildTypePrefix}build file type. Expected: ${formatValidFileTypes(
          'android'
        )} file, got: "${error.path}"`,
        above: tipBox,
        below: formatErrorHint(hintAndroid),
      };
    case 'invalidIosFileType':
      return {
        message: `Invalid iOS ${buildTypePrefix}build file type. Expected: ${formatValidFileTypes(
          'ios'
        )} file, got: "${error.path}"`,
        above: tipBox,
        below: formatErrorHint(hintIos),
      };
  }
}
