import { Platform } from '@sherlo/api-types';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import throwError from '../throwError';
import accessFileInArchive from './accessFileInArchive';
import accessFileInDirectory from './accessFileInDirectory';
import { BinaryInfo } from './types';

const SHERLO_JSON_FILENAME = 'sherlo.json';
const SHERLO_JSON_PATH = `assets/${SHERLO_JSON_FILENAME}`;
const ANDROID_EXPO_DEV_MENU_FILE_PATH = 'assets/EXDevMenuApp.android.js';
const IOS_EXPO_DEV_MENU_FILE_PATH = 'EXDevMenu.bundle/EXDevMenuApp.ios.js';

export type LocalBinariesInfo = { android?: LocalBinaryInfo; ios?: LocalBinaryInfo };
type LocalBinaryInfo = Pick<BinaryInfo, 'hash' | 'isExpoDev' | 'sdkVersion'>;

async function getLocalBinariesInfo({
  paths,
  platforms,
}: {
  paths: {
    android?: string;
    ios?: string;
  };
  platforms: Platform[];
}): Promise<LocalBinariesInfo> {
  const result: LocalBinariesInfo = {};

  if (platforms.includes('android') && paths.android) {
    result.android = await getLocalBinaryInfoForPlatform({
      platformPath: paths.android,
      sherloFilePath: SHERLO_JSON_PATH,
      expoDevFilePath: ANDROID_EXPO_DEV_MENU_FILE_PATH,
    });
  }

  if (platforms.includes('ios') && paths.ios) {
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
        operation: 'exists',
        file: expoDevFilePath,
        directory: platformPath,
      });

    readSherloFile = () =>
      accessFileInDirectory({
        operation: 'read',
        file: sherloFilePath,
        directory: platformPath,
      });
  } else if (
    fileName.endsWith('.apk') ||
    fileName.endsWith('.tar') ||
    fileName.endsWith('.tar.gz')
  ) {
    const archiveType = fileName.endsWith('.apk') ? 'unzip' : 'tar';

    checkIsExpoDev = () =>
      accessFileInArchive({
        operation: 'exists',
        file: expoDevFilePath,
        archive: platformPath,
        type: archiveType,
      });

    readSherloFile = () =>
      accessFileInArchive({
        operation: 'read',
        file: sherloFilePath,
        archive: platformPath,
        type: archiveType,
      });
  } else {
    throwError({
      type: 'unexpected',
      message: `Unsupported file format: ${fileName}`,
    });
  }

  const hash = await getBinaryHash(platformPath);

  const isExpoDev = await checkIsExpoDev();

  const sherloFileContent = await readSherloFile();
  const sdkVersion = sherloFileContent ? JSON.parse(sherloFileContent).version : undefined;

  return { hash, isExpoDev, sdkVersion };
}

async function getBinaryHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
