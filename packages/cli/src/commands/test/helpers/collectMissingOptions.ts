import { confirm, input } from '@inquirer/prompts';
import { Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import {
  ANDROID_FILE_TYPES,
  ANDROID_OPTION,
  APP_DOMAIN,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_PROJECT_ROOT,
  IOS_FILE_TYPES,
  IOS_OPTION,
  PLATFORM_LABEL,
  TEST_EAS_CLOUD_BUILD_COMMAND,
  TEST_EAS_UPDATE_COMMAND,
  TOKEN_OPTION,
} from '../../../constants';
import {
  getPlatformsToTest,
  isValidToken,
  printLink,
  throwError,
  wrapInBox,
} from '../../../helpers';
import { Config, Options } from '../../../types';
import { THIS_COMMAND } from '../constants';

async function collectMissingOptions(
  command: string,
  passedOptions: Options<typeof THIS_COMMAND>
): Promise<Record<string, string | boolean>> {
  const { hasToken, hasDevices, hasIos, hasAndroid, requiredPlatforms } = getInfo(passedOptions);

  const missingOptions: Record<string, string | boolean> = {};

  if (!hasToken) {
    missingOptions.token = await collectToken();
  }

  if (!hasDevices || command === TEST_EAS_CLOUD_BUILD_COMMAND) {
    return missingOptions;
  }

  if (command === TEST_EAS_UPDATE_COMMAND) {
    console.log();

    const wantsToUploadBuilds = await confirm({
      message: `Upload builds?${chalk.reset.dim(' (first test or native code changed)')}`,
    });

    if (!wantsToUploadBuilds) {
      return missingOptions;
    }
  }

  if (requiredPlatforms.includes('ios') && !hasIos) {
    missingOptions.ios = await collectIos();
  }

  if (requiredPlatforms.includes('android') && !hasAndroid) {
    missingOptions.android = await collectAndroid();
  }

  return missingOptions;
}

export default collectMissingOptions;

/* ========================================================================== */

function getInfo(passedOptions: Options<typeof THIS_COMMAND>): {
  hasToken: boolean;
  hasDevices: boolean;
  hasIos: boolean;
  hasAndroid: boolean;
  requiredPlatforms: Platform[];
} {
  const configData = getConfigData(passedOptions);

  const hasToken = !!passedOptions.token || !!configData.token;
  const hasDevices = !!configData.devices;
  const hasIos = !!passedOptions.ios || !!configData.ios;
  const hasAndroid = !!passedOptions.android || !!configData.android;
  const requiredPlatforms = configData.devices ? getPlatformsToTest(configData.devices) : [];

  return {
    hasToken,
    hasDevices,
    hasIos,
    hasAndroid,
    requiredPlatforms,
  };
}

function getConfigData(passedOptions: Options<typeof THIS_COMMAND>): Partial<Config> {
  const projectRoot = passedOptions.projectRoot || DEFAULT_PROJECT_ROOT;

  const configPath = path.resolve(projectRoot, passedOptions.config || DEFAULT_CONFIG_FILENAME);

  let configData: Partial<Config> = {};
  try {
    if (fs.existsSync(configPath)) {
      configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
    // Ignore config read errors, we'll prompt for everything
  }

  return configData;
}

async function collectToken(): Promise<string> {
  console.log();

  console.log(
    wrapInBox({
      title: 'Project Token',
      text: `Open ${printLink(APP_DOMAIN)} ➜ Create project ➜ Copy token`,
      type: 'default',
    })
  );

  console.log();

  let token;
  try {
    token = await input({
      message: `Enter your project token${chalk.reset.dim(` (--${TOKEN_OPTION})`)}:`,
      validate: (value: string) => {
        if (!value) {
          return 'Token is required';
        }

        if (!isValidToken(value)) {
          return 'Invalid token format. Make sure you copied it correctly';
        }

        return true;
      },
    });
  } catch (error: any) {
    console.log();

    if (error.name === 'ExitPromptError') {
      throwError({ message: 'No token provided' });
    }

    throw error;
  }

  return token;
}

async function collectIos(): Promise<string> {
  console.log();

  let iosPath;
  try {
    iosPath = await input({
      message: `Enter path to iOS build file (${IOS_FILE_TYPES.join(', ')})${chalk.reset.dim(
        ` (--${IOS_OPTION})`
      )}:`,
      validate: (value: string) => validateBuildPath(value, 'ios'),
    });
  } catch (error: any) {
    console.log();

    if (error.name === 'ExitPromptError') {
      throwError({ message: 'No iOS build path provided' });
    }

    throw error;
  }

  return iosPath;
}

async function collectAndroid(): Promise<string> {
  console.log();

  let androidPath;
  try {
    androidPath = await input({
      message: `Enter path to Android build file (${ANDROID_FILE_TYPES.join(
        ', '
      )})${chalk.reset.dim(` (--${ANDROID_OPTION})`)}:`,
      validate: (value: string) => validateBuildPath(value, 'android'),
    });
  } catch (error: any) {
    console.log();

    if (error.name === 'ExitPromptError') {
      throwError({ message: 'No Android build path provided' });
    }

    throw error;
  }

  return androidPath;
}

function validateBuildPath(value: string, platform: 'android' | 'ios'): true | string {
  if (!value || value.length === 0) {
    return `${PLATFORM_LABEL[platform]} build path is required`;
  }

  const resolvedPath = path.resolve(value);
  const isAbsolute = path.isAbsolute(value);

  // Check if path exists and is a file
  try {
    const stats = fs.statSync(resolvedPath);

    if (!stats.isFile()) {
      const resolvedPart = isAbsolute ? '' : ` ${chalk.reset.dim(`(${resolvedPath})`)}`;

      return `Path "${value}" points to a directory, not a file` + resolvedPart;
    }
  } catch {
    const resolvedPart = isAbsolute ? '' : ` ${chalk.reset.dim(`(${resolvedPath})`)}`;

    return `File does not exist at "${value}"` + resolvedPart;
  }

  // Check file extension
  const lowerValue = value.toLowerCase();
  const fileTypes = platform === 'android' ? ANDROID_FILE_TYPES : IOS_FILE_TYPES;
  const hasValidExtension = fileTypes.some((ext) => lowerValue.endsWith(ext));

  if (!hasValidExtension) {
    const fileTypesText = fileTypes.length === 1 ? fileTypes[0] : `one of: ${fileTypes.join(', ')}`;

    return `${PLATFORM_LABEL[platform]} build file must have ${fileTypesText} extension`;
  }

  return true;
}
