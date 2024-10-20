import { Platform } from '@sherlo/api-types';
import fs from 'fs';
import { DOCS_LINK, IOS_FILE_TYPES } from '../../constants';
import throwConfigError from '../throwConfigError';

// TODO: przeniesc do validateConfigPlatforms

const learnMoreLink: { [platform in Platform]: string } = {
  android: DOCS_LINK.configAndroid,
  ios: DOCS_LINK.configIos,
};

const fileType: { [platformName in Platform]: readonly string[] } = {
  android: ['.apk'],
  ios: IOS_FILE_TYPES,
};

function validateConfigPlatformPath(path: string | undefined, platform: Platform): void {
  if (!path || typeof path !== 'string') {
    throwConfigError(`\`${platform}\` must be a defined string`, learnMoreLink[platform]);
  }

  if (!fs.existsSync(path) || !hasValidExtension({ path, platform })) {
    throwConfigError(
      `\`${platform}\` path must point to an ${formatValidFileTypes(platform)} file`,
      learnMoreLink[platform]
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
  return `${formattedFileTypes.join(', ')}, or ${lastType}`;
}
