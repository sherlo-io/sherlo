import { Platform } from '@sherlo/api-types';
import SDKApiClient from '@sherlo/sdk-client';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { DOCS_LINK } from '../constants';
import { printHeader } from '../helpers';
import { getLogLink, throwError } from '../utils';
import { asyncUploadMode } from './main/modes';
import { getTokenParts, handleClientError } from './utils';

/**
 * Build lifecycle hooks: https://docs.expo.dev/build-reference/npm-hooks/
 * Environment variables: https://docs.expo.dev/build-reference/variables/#built-in-environment-variables
 * Secrets in environment variables: https://docs.expo.dev/build-reference/variables/#using-secrets-in-environment-variables
 */

async function easBuildOnComplete() {
  // Skip if the app was built locally
  if (process.env.EAS_BUILD_RUNNER !== 'eas-build') {
    console.log(
      '\n' +
        getInfoMessage({
          message:
            'Sherlo automatically tests only remote Expo builds - if you want to test your local builds, run Sherlo manually',
          learnMoreLink: DOCS_LINK.sherloScriptLocalBuilds,
        })
    );

    return;
  }

  const sherloBuildProfile = getSherloBuildProfile();
  const easBuildProfile = process.env.EAS_BUILD_PROFILE;

  // Skip if EAS build profile doesn't match
  if (sherloBuildProfile && sherloBuildProfile !== easBuildProfile) {
    console.log(
      '\n' +
        getInfoMessage({
          message: `Sherlo skipped testing - current EAS build profile "${easBuildProfile}" doesn't match the profile "${sherloBuildProfile}" defined in \`eas-build-on-complete\` script`,
          learnMoreLink: DOCS_LINK.remoteExpoBuilds,
        })
    );

    return;
  }

  printHeader();

  // Sherlo build profile is not defined
  if (!sherloBuildProfile) {
    throwError({
      message:
        'in `eas-build-on-complete` script you must define the same EAS `--profile` that you use for your Sherlo test builds',
      learnMoreLink: DOCS_LINK.remoteExpoBuilds,
    });
  }

  const { buildIndex, token } = getSherloData();

  // Build failed on Expo servers
  if (process.env.EAS_BUILD_STATUS === 'errored') {
    const { apiToken, projectIndex, teamId } = getTokenParts(token);
    const client = SDKApiClient(apiToken);

    await client
      .closeBuild({
        buildIndex,
        projectIndex,
        teamId,
        runError: 'user_expoBuildError',
      })
      .catch(handleClientError);

    throwError({ message: 'canceled due to error on Expo servers' });
  }

  // Upload the platform build
  await asyncUploadPlatformBuild({ buildIndex, sherloBuildProfile, token });
}

export default easBuildOnComplete;

/* ========================================================================== */

function getInfoMessage({
  learnMoreLink,
  message,
}: {
  message: string;
  learnMoreLink?: string;
}): string {
  return (
    [
      chalk.blue(`Info: ${message}`),
      learnMoreLink ? `↳ Learn more: ${getLogLink(learnMoreLink)}` : null,
    ]
      .filter((v) => v !== null)
      .join('\n') + '\n'
  );
}

function getSherloBuildProfile(): string | null {
  const flagPrefix = '--';
  const flagName = 'profile';
  const flag = [flagPrefix, flagName].join('');

  const args = process.argv.slice(3);

  for (let i = 0; i < args.length; i++) {
    const currentArgument = args[i];
    const nextArgument = args[i + 1];

    if (currentArgument.startsWith(`${flag}=`)) {
      const value = currentArgument.split('=')[1];

      return value;
    } else if (currentArgument === flag) {
      if (nextArgument && !nextArgument.startsWith(flagPrefix)) {
        const value = nextArgument;

        return value;
      }
    }
  }

  return null;
}

function getSherloData(): { buildIndex: number; token: string } {
  const SHERLO_TEMP_FILE_PATH = './.sherlo/data.json';

  if (!fs.existsSync(SHERLO_TEMP_FILE_PATH)) {
    throwError({
      message: `temporary file "${SHERLO_TEMP_FILE_PATH}" not found - ensure it isn't filtered out by \`.gitignore\`, or use the \`--projectRoot\` flag when working with a monorepo`,
      learnMoreLink: DOCS_LINK.sherloScriptFlags,
    });
  }

  const { buildIndex, token } = JSON.parse(fs.readFileSync(SHERLO_TEMP_FILE_PATH, 'utf8'));

  if (typeof buildIndex !== 'number') {
    throwError({
      type: 'unexpected',
      message: `field \`buildIndex\` in temporary file "${SHERLO_TEMP_FILE_PATH}" is not valid`,
    });
  }

  const tokenRegex = /^[A-Za-z0-9_-]{40}[0-9]{1,4}$/;
  if (!tokenRegex.test(token)) {
    throwError({
      message: `passed \`token\` ("${token}") is not valid`,
      learnMoreLink: DOCS_LINK.configToken,
    });
  }

  return { buildIndex, token };
}

async function asyncUploadPlatformBuild({
  buildIndex,
  sherloBuildProfile,
  token,
}: {
  buildIndex: number;
  sherloBuildProfile: string;
  token: string;
}) {
  const platform = process.env.EAS_BUILD_PLATFORM as Platform;

  let platformPath = '';
  if (platform === 'android') {
    // Android build details: https://docs.expo.dev/build-reference/android-builds/

    const defaultPath = 'android/app/build/outputs/apk/release/app-release.apk';

    platformPath =
      getPlatformPathFromEasJson({ platform: 'android', sherloBuildProfile }) ?? defaultPath;
  } else if (platform === 'ios') {
    // iOS build details: https://docs.expo.dev/build-reference/ios-builds/

    platformPath =
      getPlatformPathFromEasJson({ platform: 'ios', sherloBuildProfile }) ??
      findDefaultIosAppPath();
  }

  const { url } = await asyncUploadMode({
    asyncBuildIndex: buildIndex,
    path: platformPath,
    platform,
    token,
  });

  console.log(`Tests start after all builds are uploaded ➜ ${getLogLink(url)}\n`);
}

function getPlatformPathFromEasJson({
  platform,
  sherloBuildProfile,
}: {
  platform: Platform;
  sherloBuildProfile: string;
}): string | null {
  const easJsonData = JSON.parse(fs.readFileSync('eas.json', 'utf8'));

  return easJsonData?.builds?.[platform]?.[sherloBuildProfile]?.applicationArchivePath ?? null;
}

function findDefaultIosAppPath() {
  const iosBuildPath = 'ios/build/Build/Products/Release-iphonesimulator';
  const fileNames = fs.readdirSync(iosBuildPath);

  for (let i = 0; i < fileNames.length; i++) {
    const fileName = fileNames[i];

    if (fileName.endsWith('.app')) {
      return path.join(iosBuildPath, fileName);
    }
  }

  return '';
}
