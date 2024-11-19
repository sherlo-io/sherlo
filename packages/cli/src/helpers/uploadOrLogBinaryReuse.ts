import { Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import { exec } from 'child_process';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';
import { PLATFORM_LABEL } from '../constants';
import { IOSFileType } from '../types';
import getTimeAgo from './getTimeAgo';
import logPlatformMessage from './logPlatformMessage';
import throwError from './throwError';

async function uploadOrLogBinaryReuse(
  paths: { android?: string; ios?: string },
  binariesInfo: {
    android?: { url?: string; buildIndex?: number; buildCreatedAt?: string };
    ios?: { url?: string; buildIndex?: number; buildCreatedAt?: string };
  }
): Promise<void> {
  if (binariesInfo.android) {
    if (!binariesInfo.android.url) {
      logBinaryReuse({ platform: 'android', binariesInfo });
    } else {
      if (!paths.android) {
        throwError({
          type: 'unexpected',
          message: `${PLATFORM_LABEL.android} path is undefined`,
        });
      }

      await uploadFile({
        platform: 'android',
        path: paths.android,
        uploadUrl: binariesInfo.android.url,
      });
    }
  }

  if (binariesInfo.ios) {
    if (!binariesInfo.ios.url) {
      logBinaryReuse({ platform: 'ios', binariesInfo });
    } else {
      if (!paths.ios) {
        throwError({
          type: 'unexpected',
          message: `${PLATFORM_LABEL.ios} path is undefined`,
        });
      }

      const iosPath = paths.ios;
      const pathFileName = path.basename(iosPath);

      let iosFileType: IOSFileType;

      if (pathFileName.endsWith('.tar.gz')) {
        iosFileType = '.tar.gz';
      } else if (pathFileName.endsWith('.tar')) {
        iosFileType = '.tar';
      } else {
        iosFileType = '.app';
      }

      await uploadFile({
        platform: 'ios',
        path: iosPath,
        iosFileType,
        uploadUrl: binariesInfo.ios.url,
      });
    }
  }
}

export default uploadOrLogBinaryReuse;

/* ========================================================================== */

async function uploadFile({
  path: filePath,
  uploadUrl,
  platform,
  iosFileType,
}: {
  path: string;
  uploadUrl: string;
  platform: Platform;
  iosFileType?: IOSFileType;
}): Promise<void> {
  let fileData: Buffer;

  if (platform === 'android') {
    fileData = await fs.promises.readFile(filePath);
  } else if (platform === 'ios') {
    if (!iosFileType) {
      throwError({
        type: 'unexpected',
        message: 'iosFileType is undefined',
      });
    }

    if (iosFileType === '.tar.gz') {
      fileData = await fs.promises.readFile(filePath);
    } else if (iosFileType === '.tar') {
      fileData = await compressFileToGzip(filePath);
    } else if (iosFileType === '.app') {
      fileData = await compressDirectoryToTarGzip(filePath);
    } else {
      throwError({
        type: 'unexpected',
        message: `invalid ${PLATFORM_LABEL.ios} file type: ${iosFileType}`,
      });
    }
  } else {
    throwError({
      type: 'unexpected',
      message: `platform ${platform} is not supported`,
    });
  }

  const platformLabelValue = PLATFORM_LABEL[platform];

  logPlatformMessage({ platform, message: 'upload started', type: 'info' });

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: fileData,
  }).catch(() => {
    throwError({
      type: 'unexpected',
      message: `failed to upload ${platformLabelValue} build`,
    });
  });

  if (!response.ok) {
    throwError({
      type: 'unexpected',
      message: `failed to upload ${platformLabelValue} build`,
    });
  }

  logPlatformMessage({
    platform,
    message: 'upload finished',
    type: 'success',
    endsWithNewLine: true,
  });
}

async function compressFileToGzip(filePath: string): Promise<Buffer> {
  const gzip = zlib.createGzip();
  const buffers: Buffer[] = [];

  return new Promise<Buffer>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(gzip)
      .on('data', (data) => buffers.push(data))
      .on('end', () => resolve(Buffer.concat(buffers)))
      .on('error', reject);
  });
}

async function compressDirectoryToTarGzip(directoryPath: string): Promise<Buffer> {
  const execAsync = promisify(exec);

  try {
    /**
     * Create tar command that outputs gzipped tar to stdout:
     * -c: create new archive
     * -z: compress using gzip
     * -f -: write to stdout (- is a special file meaning stdout)
     * -C dir: change to directory before adding files (preserves relative paths)
     * last arg: file/directory to add to archive
     *
     * Example for path "/foo/bar/myapp.app":
     * - changes to "/foo/bar" directory (-C)
     * - adds "myapp.app" to archive
     * - results in archive with single top-level "myapp.app" entry
     */
    const command = `tar -czf - -C "${path.dirname(directoryPath)}" "${path.basename(directoryPath)}"`;

    // Execute and get buffer directly
    const { stdout } = await execAsync(command, {
      encoding: 'buffer',
      maxBuffer: 1 * 1024 * 1024 * 1024, // 1GB max buffer - very safe limit
    });

    return stdout;
  } catch (error) {
    throwError({
      type: 'unexpected',
      message: `Failed to compress directory: ${error.message}`,
    });
  }
}

function logBinaryReuse({
  platform,
  binariesInfo,
}: {
  platform: Platform;
  binariesInfo: {
    android?: { buildIndex?: number; buildCreatedAt?: string };
    ios?: { buildIndex?: number; buildCreatedAt?: string };
  };
}) {
  const platformInfo = binariesInfo[platform];

  if (!platformInfo?.buildIndex || !platformInfo?.buildCreatedAt) {
    throwError({
      type: 'unexpected',
      message: `${PLATFORM_LABEL[platform]} binary build info is incomplete`,
    });
  }

  const buildIndex = platformInfo.buildIndex;
  const timeAgo = getTimeAgo(platformInfo.buildCreatedAt);

  logPlatformMessage({
    platform,
    message: `reusing ${chalk.green(`Build ${buildIndex}`)} (unchanged, ${timeAgo})`,
    type: 'success',
    endsWithNewLine: true,
  });
}
