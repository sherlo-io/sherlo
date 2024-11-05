import { Platform } from '@sherlo/api-types';
import path from 'path';
import throwError from '../throwError';
import accessFileInArchive from './accessFileInArchive';
import accessFileInDirectory from './accessFileInDirectory';

const SHERLO_JSON_FILENAME = 'sherlo.json';
const SHERLO_JSON_PATH = `assets/${SHERLO_JSON_FILENAME}`;
const ANDROID_EXPO_DEV_MENU_FILE_PATH = 'assets/EXDevMenuApp.android.js';
const IOS_EXPO_DEV_MENU_FILE_PATH = 'EXDevMenu.bundle/EXDevMenuApp.ios.js';

type LocalBinariesInfo = {
  android?: LocalBinaryInfo;
  ios?: LocalBinaryInfo;
};

type LocalBinaryInfo = {
  hasSherlo: boolean;
  isExpoDev: boolean;
  sdkVersion?: string;
};

async function getLocalBinariesInfo({
  paths,
  platformsToTest,
}: {
  paths: {
    android?: string;
    ios?: string;
  };
  platformsToTest: Platform[];
}): Promise<LocalBinariesInfo> {
  const result: LocalBinariesInfo = {};

  if (paths.android && platformsToTest.includes('android')) {
    result.android = await getLocalBinaryInfoForPlatform({
      platformPath: paths.android,
      sherloFilePath: SHERLO_JSON_PATH,
      expoDevFilePath: ANDROID_EXPO_DEV_MENU_FILE_PATH,
    });
  }

  if (paths.ios && platformsToTest.includes('ios')) {
    result.ios = await getLocalBinaryInfoForPlatform({
      platformPath: paths.ios,
      sherloFilePath: SHERLO_JSON_PATH,
      expoDevFilePath: IOS_EXPO_DEV_MENU_FILE_PATH,
    });
  }

  return result;
}

export default getLocalBinariesInfo;

/* ========================================================================== */

async function getLocalBinaryInfoForPlatform({
  platformPath,
  sherloFilePath,
  expoDevFilePath,
}: {
  platformPath: string;
  sherloFilePath: string;
  expoDevFilePath: string;
}): Promise<LocalBinaryInfo> {
  const fileName = path.basename(platformPath);

  let checkIsExpoDev;
  let readSherloFile;

  if (fileName.endsWith('.app')) {
    checkIsExpoDev = () =>
      accessFileInDirectory({
        directory: platformPath,
        file: expoDevFilePath,
        operation: 'exists',
      });

    readSherloFile = () =>
      accessFileInDirectory({
        directory: platformPath,
        file: sherloFilePath,
        operation: 'read',
      });
  } else if (
    fileName.endsWith('.apk') ||
    fileName.endsWith('.tar') ||
    fileName.endsWith('.tar.gz')
  ) {
    const archiveType = fileName.endsWith('.apk') ? 'unzip' : 'tar';

    checkIsExpoDev = () =>
      accessFileInArchive({
        archive: platformPath,
        file: expoDevFilePath,
        type: archiveType,
        operation: 'exists',
      });

    readSherloFile = () =>
      accessFileInArchive({
        archive: platformPath,
        file: sherloFilePath,
        type: archiveType,
        operation: 'read',
      });
  } else {
    throwError({
      type: 'unexpected',
      message: `Unsupported file format: ${fileName}`,
    });
  }

  try {
    const isExpoDev = await checkIsExpoDev();
    let hasSherlo = false;
    let sdkVersion;

    try {
      const sherloContent = await readSherloFile();
      hasSherlo = true;

      try {
        sdkVersion = JSON.parse(sherloContent).version;
      } catch {
        throwError({
          type: 'unexpected',
          message: `Invalid ${SHERLO_JSON_FILENAME} format in ${platformPath}`,
        });
      }
    } catch {
      hasSherlo = false;
    }

    return { hasSherlo, isExpoDev, sdkVersion };
  } catch {
    throwError({
      type: 'unexpected',
      message: `Failed to read files from ${platformPath}`,
    });
  }
}
