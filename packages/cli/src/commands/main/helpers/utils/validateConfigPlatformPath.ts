import { Platform } from '@sherlo/api-types';
import fs from 'fs';
import { docsLink, iOSFileTypes } from '../../constants';
import { getConfigErrorMessage } from '../../utils';

const learnMoreLink: { [platform in Platform]: string } = {
  android: docsLink.configAndroid,
  ios: docsLink.configIos,
};

const fileType: { [platformName in Platform]: readonly string[] } = {
  android: ['.apk'],
  ios: iOSFileTypes,
};

function validateConfigPlatformPath(path: string | undefined, platform: Platform): void {
  if (!path || typeof path !== 'string') {
    throw new Error(
      getConfigErrorMessage(`${platform} must be a defined string`, learnMoreLink[platform])
    );
  }

  if (!fs.existsSync(path) || !hasValidExtension({ path, platform })) {
    throw new Error(
      getConfigErrorMessage(
        `${platform} must be a valid ${formatValidFileTypes(platform)} file`,
        learnMoreLink[platform]
      )
    );
  }
}

export default validateConfigPlatformPath;

/* ========================================================================== */

function hasValidExtension({ path, platform }: { path: string; platform: Platform }) {
  return fileType[platform].some((extension) => path.endsWith(extension));
}

function formatValidFileTypes(platform: Platform) {
  const fileTypes = fileType[platform];

  if (fileTypes.length === 1) {
    return fileTypes[0];
  }

  const formattedFileTypes = [...fileTypes];
  const lastType = formattedFileTypes.pop();
  return `${formattedFileTypes.join(', ')} or ${lastType}`;
}
