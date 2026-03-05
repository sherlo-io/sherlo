import { Platform } from '@sherlo/api-types';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PLATFORMS, PLATFORM_LABEL, TEST_EAS_UPDATE_COMMAND } from '../../../../constants';
import { getErrorWithCustomMessage } from '../../../../helpers';
import { BinaryInfo, BuildType, Command } from '../../../../types';
import { validatePlatformPaths } from '../../../shared';
import throwError from '../../../throwError';
import runShellCommand from '../../../runShellCommand';
import accessFileInArchive from './accessFileInArchive';
import accessFileInDirectory from './accessFileInDirectory';

const SHERLO_JSON_FILENAME = 'sherlo.json';
const SHERLO_JSON_PATH = `assets/${SHERLO_JSON_FILENAME}`;
const PREVIEW_BUILD_BUNDLE_PATH = {
  android: 'assets/index.android.bundle',
  ios: 'main.jsbundle',
};

// Expo app.config paths - contains sdkVersion field
const EXPO_APP_CONFIG_PATH = {
  android: 'assets/app.config',
  ios: 'EXConstants.bundle/app.config',
};

// expo-dev-client markers
// iOS: EXDevLauncher.bundle is created by expo-dev-launcher podspec (reliable across SDK 43-55+)
const EXPO_DEV_CLIENT_IOS_MARKERS = ['EXDevLauncher.bundle'];
// Android: DevLauncherActivity registered in debug AndroidManifest.xml (reliable across SDK 48-55+)
const EXPO_DEV_CLIENT_ANDROID_MANIFEST_ACTIVITY =
  'expo.modules.devlauncher.launcher.DevLauncherActivity';

type LocalBinariesInfo = { android?: LocalBinaryInfo; ios?: LocalBinaryInfo };
type LocalBinaryInfo = Pick<
  BinaryInfo,
  'hash' | 'buildType' | 'sdkVersion' | 'fileName' | 'expoSdkVersion' | 'hasExpoDevClient'
>;

async function getLocalBinariesInfo({
  paths,
  platforms,
  projectRoot,
  command,
}: {
  paths: {
    android?: string;
    ios?: string;
  };
  platforms: Platform[];
  projectRoot: string;
  command: Command;
}): Promise<LocalBinariesInfo> {
  const result: LocalBinariesInfo = {};

  for (const platform of PLATFORMS) {
    // Get the local binary info for the platform if it should be tested and there's a path for it
    if (platforms.includes(platform) && paths[platform]) {
      if (command === TEST_EAS_UPDATE_COMMAND) {
        /**
         * We validate the BUILD FILE TYPE at this stage because TEST_EAS_UPDATE_COMMAND
         * does not validate it earlier (due to { requiredPlatformPaths: false })
         */

        validatePlatformPaths({
          platformsToValidate: [platform],
          android: paths.android,
          ios: paths.ios,
          command,
        });
      }

      result[platform] = await getLocalBinaryInfoForPlatform({
        platform,
        platformPath: paths[platform],
        sherloFilePath: SHERLO_JSON_PATH,
        previewBundlePath: PREVIEW_BUILD_BUNDLE_PATH[platform],
        projectRoot,
      });
    }
  }

  return result;
}

export default getLocalBinariesInfo;

/* ========================================================================== */

async function getLocalBinaryInfoForPlatform({
  platform,
  platformPath,
  sherloFilePath,
  previewBundlePath,
  projectRoot,
}: {
  platform: Platform;
  platformPath: string;
  sherloFilePath: string;
  previewBundlePath: string;
  projectRoot: string;
}): Promise<LocalBinaryInfo> {
  const fileName = path.basename(platformPath);

  let checkHasBundle: () => Promise<boolean>;
  let readSherloFile: () => Promise<string | undefined>;
  let checkHasExpoDevClient: () => Promise<boolean>;
  let readExpoAppConfig: () => Promise<string | undefined>;

  if (fileName.endsWith('.app')) {
    checkHasBundle = () =>
      accessFileInDirectory({
        operation: 'exists',
        file: previewBundlePath,
        directory: platformPath,
      });

    readSherloFile = () =>
      accessFileInDirectory({
        operation: 'read',
        file: sherloFilePath,
        directory: platformPath,
      });

    checkHasExpoDevClient = () =>
      checkAnyFileExists(
        EXPO_DEV_CLIENT_IOS_MARKERS.map(
          (marker) => () =>
            accessFileInDirectory({
              operation: 'exists',
              file: marker,
              directory: platformPath,
            })
        )
      );

    readExpoAppConfig = async () => {
      const exists = await accessFileInDirectory({
        operation: 'exists',
        file: EXPO_APP_CONFIG_PATH[platform],
        directory: platformPath,
      });
      if (!exists) return undefined;
      return accessFileInDirectory({
        operation: 'read',
        file: EXPO_APP_CONFIG_PATH[platform],
        directory: platformPath,
      });
    };
  } else if (
    fileName.endsWith('.apk') ||
    fileName.endsWith('.tar') ||
    fileName.endsWith('.tar.gz')
  ) {
    const archiveType = fileName.endsWith('.apk') ? 'unzip' : 'tar';

    checkHasBundle = () =>
      accessFileInArchive({
        operation: 'exists',
        file: previewBundlePath,
        archive: platformPath,
        type: archiveType,
        projectRoot,
      });

    readSherloFile = () =>
      accessFileInArchive({
        operation: 'read',
        file: sherloFilePath,
        archive: platformPath,
        type: archiveType,
        projectRoot,
      });

    checkHasExpoDevClient =
      platform === 'android'
        ? () =>
            checkApkManifestContains({
              apkPath: platformPath,
              searchString: EXPO_DEV_CLIENT_ANDROID_MANIFEST_ACTIVITY,
              projectRoot,
            })
        : () =>
            checkAnyFileExists(
              EXPO_DEV_CLIENT_IOS_MARKERS.map(
                (marker) => () =>
                  accessFileInArchive({
                    operation: 'exists',
                    file: marker,
                    archive: platformPath,
                    type: archiveType,
                    projectRoot,
                  })
              )
            );

    readExpoAppConfig = () =>
      accessFileInArchive({
        operation: 'read',
        file: EXPO_APP_CONFIG_PATH[platform],
        archive: platformPath,
        type: archiveType,
        projectRoot,
      });
  } else {
    throwError({
      type: 'unexpected',
      error: new Error(`Unsupported file format: ${fileName}`),
    });
  }

  const hash = await getBinaryHash(platformPath);

  const hasBundle = await checkHasBundle();
  const buildType: BuildType = hasBundle ? 'preview' : 'development';

  let sdkVersion: string | undefined;
  const sherloFileContent = await readSherloFile();
  if (sherloFileContent) {
    try {
      sdkVersion = JSON.parse(sherloFileContent).version;
    } catch (error) {
      throwError({
        type: 'unexpected',
        error: getErrorWithCustomMessage(
          error,
          `Invalid ${SHERLO_JSON_PATH} in ${PLATFORM_LABEL[platform]} build`
        ),
      });
    }
  }

  const hasExpoDevClient = await checkHasExpoDevClient();

  let expoSdkVersion: string | undefined;
  const appConfigContent = await readExpoAppConfig();
  if (appConfigContent) {
    try {
      expoSdkVersion = JSON.parse(appConfigContent).sdkVersion;
    } catch {
      // app.config may be binary plist (iOS local builds) - skip version extraction
    }
  }

  return { hash, buildType, sdkVersion, fileName, expoSdkVersion, hasExpoDevClient };
}

async function checkAnyFileExists(checks: (() => Promise<boolean>)[]): Promise<boolean> {
  for (const check of checks) {
    if (await check()) return true;
  }
  return false;
}

/**
 * Checks if the binary AndroidManifest.xml in an APK contains a specific string.
 * Android binary XML stores strings as UTF-16LE in its string pool.
 */
async function checkApkManifestContains({
  apkPath,
  searchString,
  projectRoot,
}: {
  apkPath: string;
  searchString: string;
  projectRoot: string;
}): Promise<boolean> {
  try {
    const manifestBuffer = await runShellCommand({
      command: `unzip -p "${apkPath}" AndroidManifest.xml`,
      projectRoot,
      encoding: 'buffer',
    });

    const searchBuffer = Buffer.from(searchString, 'utf16le');

    return manifestBuffer.includes(searchBuffer);
  } catch {
    return false;
  }
}

async function getBinaryHash(filePath: string): Promise<string> {
  const stats = await fs.promises.stat(filePath);

  if (!stats.isDirectory()) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  // Directory handling
  const hash = crypto.createHash('sha256');
  const files = await getFilesRecursively(filePath);

  // Sort files to ensure consistent order
  files.sort();

  for (const file of files) {
    const relativePath = path.relative(filePath, file);
    const content = await fs.promises.readFile(file);

    // Update hash with relative path and content
    hash.update(relativePath);
    hash.update(content);
  }

  return hash.digest('hex');
}

async function getFilesRecursively(dir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await getFilesRecursively(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}
