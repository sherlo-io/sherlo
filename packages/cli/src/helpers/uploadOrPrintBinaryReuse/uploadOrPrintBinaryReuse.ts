import { PLATFORM_LABEL, PLATFORMS } from '../../constants';
import { BinariesInfo } from '../../types';
import printBuildPlatformLabel from '../printBuildPlatformLabel';
import throwError from '../throwError';
import printBuildReuse from './printBuildReuse';
import uploadBuild from './uploadBuild';

async function uploadOrPrintBinaryReuse(params: {
  binariesInfo: BinariesInfo;
  projectRoot: string;
  android?: string;
  ios?: string;
}): Promise<void> {
  for (const platform of PLATFORMS) {
    const binaryInfo = params.binariesInfo[platform];
    if (!binaryInfo) continue;

    printBuildPlatformLabel(platform);

    if (!binaryInfo.url) {
      printBuildReuse({ platform, binaryInfo });
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

export default uploadOrPrintBinaryReuse;
