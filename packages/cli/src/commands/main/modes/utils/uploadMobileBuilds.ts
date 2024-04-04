import { GetBuildUploadUrlsReturn, Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';
import tar from 'tar';
import { getErrorMessage } from '../../utils';

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

    await uploadFile(paths.android, buildPresignedUploadUrls.android.url, 'android');
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

    const pathFileName = path.basename(paths.ios);

    let compressedIosPath;
    if (pathFileName.endsWith('.tar.gz')) {
      compressedIosPath = paths.ios;
    } else {
      compressedIosPath = path.join(paths.ios, '..', `${pathFileName}.tar.gz`);

      await compressDirectory(paths.ios, compressedIosPath).catch(() => {
        throw new Error(
          getErrorMessage({
            type: 'unexpected',
            message: `failed to compress ${platformLabel.ios} build`,
          })
        );
      });
    }

    await uploadFile(compressedIosPath, buildPresignedUploadUrls.ios.url, 'ios');
  }
}

async function uploadFile(
  pathToFile: string,
  uploadUrl: string,
  platform: Platform
): Promise<void> {
  const platformLabelValue = platformLabel[platform];

  console.log(`${chalk.blue('→')} Reading ${platformLabelValue} build`, pathToFile);

  const fileData = await fs.readFile(pathToFile).catch(() => {
    throw new Error(
      getErrorMessage({
        type: 'unexpected',
        message: `failed to read ${platformLabelValue} build`,
      })
    );
  });

  console.log(`${chalk.blue('→')} Read ${platformLabelValue} build`, fileData.length);

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

function compressDirectory(inputDirectory: string, outputFilePath: string): Promise<void> {
  return tar.c({ gzip: true, file: outputFilePath, C: inputDirectory }, ['.']);
}

export default uploadMobileBuilds;
