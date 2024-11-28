import { Platform } from '@sherlo/api-types';
import fs from 'fs';
import throwError from '../../../throwError';
import compressDirectoryToTarGzip from './compressDirectoryToTarGzip';
import compressFileToGzip from './compressFileToGzip';

function getBuildData({
  buildPath,
  platform,
  projectRoot,
}: {
  buildPath: string;
  platform: Platform;
  projectRoot: string;
}): Buffer {
  if (platform === 'android') {
    /**
     * .apk file
     */
    return fs.readFileSync(buildPath);
  }

  if (platform === 'ios') {
    if (buildPath.endsWith('.tar.gz')) {
      /**
       * .tar.gz file
       */
      return fs.readFileSync(buildPath);
    } else if (buildPath.endsWith('.tar')) {
      /**
       * .tar file
       */
      return compressFileToGzip(buildPath);
    } else {
      /**
       * .app directory
       */
      return compressDirectoryToTarGzip({ directoryPath: buildPath, projectRoot });
    }
  }

  throwError({
    type: 'unexpected',
    message: `Platform ${platform} is not supported`,
  });
}

export default getBuildData;
