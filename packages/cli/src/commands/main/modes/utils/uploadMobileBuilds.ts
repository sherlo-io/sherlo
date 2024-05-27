import { GetBuildUploadUrlsReturn, Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import tar from 'tar';
import zlib from 'zlib';
import { getErrorMessage } from '../../utils';
import { IOSFileType } from '../../types';

const platformLabel: { [platform in Platform]: string } = {
  android: 'Android',
  ios: 'iOS',
};

export type UploadMobileBuildsPaths = {
  android?: string;
  ios?: string;
};

async function uploadMobileBuilds(
  paths: UploadMobileBuildsPaths,
  buildPresignedUploadUrls: GetBuildUploadUrlsReturn['buildPresignedUploadUrls']
): Promise<void> {
  if (paths.android) {
    if (!buildPresignedUploadUrls.android) {
      throw new Error(
        getErrorMessage({
          type: 'unexpected',
          message: `${platformLabel.android} presigned url is undefined`,
        })
      );
    }

    await uploadFile({
      platform: 'android',
      path: paths.android,
      uploadUrl: buildPresignedUploadUrls.android.url,
    });
  }

  if (paths.ios) {
    if (!buildPresignedUploadUrls.ios) {
      throw new Error(
        getErrorMessage({
          type: 'unexpected',
          message: `${platformLabel.ios} presigned url is undefined`,
        })
      );
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
      throw new Error(
        getErrorMessage({
          type: 'unexpected',
          message: 'iosFileType is undefined',
        })
      );
    }

    if (iosFileType === '.tar.gz') {
      fileData = await fs.promises.readFile(filePath);
    } else if (iosFileType === '.tar') {
      fileData = await compressFileToGzip(filePath);
    } else if (iosFileType === '.app') {
      fileData = await compressDirectoryToTarGzip(filePath);
    } else {
      throw new Error(
        getErrorMessage({
          type: 'unexpected',
          message: `invalid iOS file type: ${iosFileType}`,
        })
      );
    }
  } else {
    throw new Error(
      getErrorMessage({
        type: 'unexpected',
        message: `platform ${platform} is not supported`,
      })
    );
  }

  const platformLabelValue = platformLabel[platform];

  console.log(`${chalk.blue('→')} Started ${platformLabelValue} upload`);

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: fileData,
  }).catch(() => {
    throw new Error(
      getErrorMessage({
        type: 'unexpected',
        message: `failed to upload ${platformLabelValue} build`,
      })
    );
  });

  if (!response.ok) {
    throw new Error(
      getErrorMessage({
        type: 'unexpected',
        message: `failed to upload ${platformLabelValue} build`,
      })
    );
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
