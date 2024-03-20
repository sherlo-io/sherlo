import fs from 'fs/promises';
import path from 'path';
import { InitBuildReturn, Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import fetch from 'node-fetch';
import tar from 'tar';
import { Config } from '../types';
import getErrorMessage from './getErrorMessage';

const platformLabel: { [platform in Platform]: string } = {
  android: 'Android',
  ios: 'iOS',
};

async function uploadMobileBuilds(
  config: Config,
  buildPresignedUploadUrls: InitBuildReturn['buildPresignedUploadUrls']
): Promise<void> {
  const { android, ios } = config;

  if (android) {
    if (!buildPresignedUploadUrls.android) {
      throw new Error(
        getErrorMessage({
          type: 'unexpected',
          message: `${platformLabel.android} presigned url is undefined`,
        })
      );
    }

    await uploadFile(android.path, buildPresignedUploadUrls.android.url, 'android');
  }

  if (ios) {
    if (!buildPresignedUploadUrls.ios) {
      throw new Error(
        getErrorMessage({
          type: 'unexpected',
          message: `${platformLabel.ios} presigned url is undefined`,
        })
      );
    }

    const iosPath = ios.path;
    const pathFileName = path.basename(iosPath);

    let compressedIosPath;
    if (pathFileName.endsWith('.tar.gz')) {
      compressedIosPath = iosPath;
    } else {
      compressedIosPath = path.join(iosPath, '..', `${pathFileName}.tar.gz`);

      await compressDirectory(iosPath, compressedIosPath).catch(() => {
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

  const fileData = await fs.readFile(pathToFile).catch(() => {
    throw new Error(
      getErrorMessage({
        type: 'unexpected',
        message: `failed to read ${platformLabelValue} build`,
      })
    );
  });

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
