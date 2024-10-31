import { GetBuildUploadUrlsReturn, Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import tar from 'tar';
import zlib from 'zlib';
import { IOSFileType } from '../types';
import throwError from './throwError';

async function uploadMobileBuilds(
  paths: { android?: string; ios?: string },
  buildPresignedUploadUrls: GetBuildUploadUrlsReturn['buildPresignedUploadUrls']
): Promise<void> {
  if (paths.android) {
    if (!buildPresignedUploadUrls.android?.url) {
      throwError({
        type: 'unexpected',
        message: `${platformLabel.android} presigned url is undefined`,
      });
    }

    await uploadFile({
      platform: 'android',
      path: paths.android,
      uploadUrl: buildPresignedUploadUrls.android.url,
    });
  }

  if (paths.ios) {
    if (!buildPresignedUploadUrls.ios?.url) {
      throwError({
        type: 'unexpected',
        message: `${platformLabel.ios} presigned url is undefined`,
      });
    }

    const iosPath = paths.ios as string;
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
      uploadUrl: buildPresignedUploadUrls.ios.url,
    });
  }
}

export default uploadMobileBuilds;

/* ========================================================================== */

const platformLabel: { [platform in Platform]: string } = {
  android: 'Android',
  ios: 'iOS',
};

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
        message: `invalid iOS file type: ${iosFileType}`,
      });
    }
  } else {
    throwError({
      type: 'unexpected',
      message: `platform ${platform} is not supported`,
    });
  }

  const platformLabelValue = platformLabel[platform];

  console.log(`${chalk.blue('→')} Started ${platformLabelValue} upload`);

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

  console.log(`${chalk.green('✓')} Finished ${platformLabelValue} upload\n`);
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
  const buffers: Buffer[] = [];

  return new Promise<Buffer>((resolve, reject) => {
    tar
      .c(
        {
          gzip: true,
          cwd: path.dirname(directoryPath),
        },
        [path.basename(directoryPath)]
      )
      .on('data', (data) => buffers.push(data))
      .on('end', () => resolve(Buffer.concat(buffers)))
      .on('error', reject);
  });
}
