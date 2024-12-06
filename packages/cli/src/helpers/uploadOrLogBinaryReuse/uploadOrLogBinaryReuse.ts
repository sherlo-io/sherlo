import { PLATFORM_LABEL, PLATFORMS } from '../../constants';
import { BinariesInfo } from '../../types';
import logBuildPlatformLabel from '../logBuildPlatformLabel';
import throwError from '../throwError';
import logBuildReuse from './logBuildReuse';
import uploadBuild from './uploadBuild';

async function uploadOrLogBinaryReuse(params: {
  binariesInfo: BinariesInfo;
  projectRoot: string;
  android?: string;
  ios?: string;
}): Promise<void> {
  for (const platform of PLATFORMS) {
    const binaryInfo = params.binariesInfo[platform];
    if (!binaryInfo) continue;

    logBuildPlatformLabel(platform);

    if (!binaryInfo.url) {
      logBuildReuse({ platform, binaryInfo });
    } else {
      if (!params[platform]) {
        throwError({
          type: 'unexpected',
          error: new Error(`${PLATFORM_LABEL[platform]} path is undefined`),
        });
      }

      await uploadBuild({
        buildPath: params[platform],
        platform,
        projectRoot: params.projectRoot,
        uploadUrl: binaryInfo.url,
      });
    }
  }
}

export default uploadOrLogBinaryReuse;
