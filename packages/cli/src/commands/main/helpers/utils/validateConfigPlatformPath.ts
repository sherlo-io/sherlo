import { Platform } from '@sherlo/api-types';
import fs from 'fs';
import nodePath from 'path';
import { docsLink } from '../../constants';
import getConfigErrorMessage from './getConfigErrorMessage';

const learnMoreLink: { [platform in Platform]: string } = {
  android: docsLink.configAndroid,
  ios: docsLink.configIos,
};

export function validateConfigPlatformPath(path: string | undefined, platform: Platform): void {
  if (!path || typeof path !== 'string') {
    throw new Error(
      getConfigErrorMessage(
        `for ${platform}, path must be a defined string`,
        learnMoreLink[platform]
      )
    );
  }

  const fileType: { [platformName in Platform]: string[] } = {
    android: ['.apk'],
    ios: ['.app', '.gz'],
  };

  if (!fs.existsSync(path) || !fileType[platform].includes(nodePath.extname(path))) {
    throw new Error(
      getConfigErrorMessage(
        `for ${platform}, path must be a valid ${fileType[platform].join(', ')} file`,
        learnMoreLink[platform]
      )
    );
  }
}

export default validateConfigPlatformPath;
