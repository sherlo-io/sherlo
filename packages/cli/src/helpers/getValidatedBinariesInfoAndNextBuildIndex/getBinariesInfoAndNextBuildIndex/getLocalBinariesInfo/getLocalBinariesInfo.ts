import { Platform } from '@sherlo/api-types';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { EXPO_UPDATE_COMMAND, PLATFORMS } from '../../../../constants';
import { Command } from '../../../../types';
import { validatePlatformPaths } from '../../../shared';
import throwError from '../../../throwError';
import { BinaryInfo } from '../../types';
import accessFileInArchive from './accessFileInArchive';
import accessFileInDirectory from './accessFileInDirectory';

const SHERLO_JSON_FILENAME = 'sherlo.json';
const SHERLO_JSON_PATH = `assets/${SHERLO_JSON_FILENAME}`;
const EXPO_DEV_FILE_PATH = {
  android: 'assets/EXDevMenuApp.android.js',
  ios: 'EXDevMenu.bundle/EXDevMenuApp.ios.js',
};

type LocalBinariesInfo = { android?: LocalBinaryInfo; ios?: LocalBinaryInfo };
type LocalBinaryInfo = Pick<BinaryInfo, 'hash' | 'isExpoDev' | 'sdkVersion'>;

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

  console.log('[DEBUG] getLocalBinariesInfo - Platforms to process:', platforms);
  console.log('[DEBUG] getLocalBinariesInfo - Paths:', paths);

  for (const platform of PLATFORMS) {
    // Get the local binary info for the platform if it should be tested and there's a path for it
    if (platforms.includes(platform) && paths[platform]) {
      if (command === EXPO_UPDATE_COMMAND) {
        /**
         * We validate the BUILD FILE TYPE at this stage because EXPO_UPDATE_COMMAND
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
        platformPath: paths[platform],
        sherloFilePath: SHERLO_JSON_PATH,
        expoDevFilePath: EXPO_DEV_FILE_PATH[platform],
        projectRoot,
      });
    }
  }

  return result;
}

export default getLocalBinariesInfo;

/* ========================================================================== */

async function getLocalBinaryInfoForPlatform({
  platformPath,
  sherloFilePath,
  expoDevFilePath,
  projectRoot,
}: {
  platformPath: string;
  sherloFilePath: string;
  expoDevFilePath: string;
  projectRoot: string;
}): Promise<LocalBinaryInfo> {
  const fileName = path.basename(platformPath);

  console.log('[DEBUG] getLocalBinaryInfoForPlatform - Processing file:', fileName);
  console.log(
    '[DEBUG] getLocalBinaryInfoForPlatform - Looking for sherlo file at:',
    sherloFilePath
  );

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
  } else {
    throwError({
      type: 'unexpected',
      error: new Error(`Unsupported file format: ${fileName}`),
    });
  }

  const hash = await getBinaryHash(platformPath);
  const isExpoDev = await checkIsExpoDev();
  const sherloFileContent = await readSherloFile();

  let sdkVersion;

  if (sherloFileContent) {
    console.log(`[DEBUG] Found sherlo file, length: ${sherloFileContent.length}`);

    // Show raw content only if it's small
    if (sherloFileContent.length < 100) {
      console.log(`[DEBUG] Full content: "${sherloFileContent}"`);
    } else {
      console.log(`[DEBUG] Content preview: "${sherloFileContent.substring(0, 50)}..."`);
    }

    try {
      // Try standard parse
      const parsedContent = JSON.parse(sherloFileContent);
      sdkVersion = parsedContent.version;
      console.log(`[DEBUG] Parse success. Version: ${sdkVersion}`);
    } catch (error) {
      console.error(`[DEBUG] Parse error: ${error.message}`);

      // Simple extraction
      try {
        const startPos = sherloFileContent.indexOf('{');
        const endPos = sherloFileContent.indexOf('}', startPos);

        if (startPos >= 0 && endPos > startPos) {
          const extractedJson = sherloFileContent.substring(startPos, endPos + 1);
          console.log(`[DEBUG] Extracted JSON: ${extractedJson}`);

          const parsed = JSON.parse(extractedJson);
          sdkVersion = parsed.version;
          console.log(`[DEBUG] Extracted version: ${sdkVersion}`);
        }
      } catch (e) {
        console.error(`[DEBUG] Extraction failed: ${e.message}`);
      }
    }
  } else {
    console.log('[DEBUG] No sherlo.json content found');
  }

  console.log('[DEBUG] getLocalBinaryInfoForPlatform - Results:', {
    hash: hash.substring(0, 8) + '...',
    isExpoDev,
    sdkVersion,
    sherloFileFound: !!sherloFileContent,
  });

  return { hash, isExpoDev, sdkVersion };
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
