import { PLATFORM_LABEL, PLATFORMS } from '../../constants';
import { BinariesInfo } from '../../types';
import printBuildPlatformLabel from '../printBuildPlatformLabel';
import throwError from '../throwError';
import printBuildReuse from './printBuildReuse';
import uploadBuild, { type BinaryUploadEffects } from './uploadBuild';

/**
 * The per-platform binary block of the push transcript: a label, then either a
 * fresh upload or a cache reuse.
 *
 * WHICH BRANCH FIRES IS A BEHAVIOUR, NOT A STYLE. A fresh upload and a reuse are
 * different things the CLI did, decided by whether the backend has seen this
 * binary before - which is why the tester's masker deliberately does NOT fold
 * them into one canonical line.
 */
async function uploadOrPrintBinaryReuse(params: {
  binariesInfo: BinariesInfo;
  projectRoot: string;
  android?: string;
  ios?: string;
  /** Supplied by an expectation producer so this exact loop runs offline. */
  uploadEffects?: BinaryUploadEffects;
  /** The instant a reuse line's "N minutes ago" is measured against. */
  now?: Date;
}): Promise<void> {
  for (const platform of PLATFORMS) {
    const binaryInfo = params.binariesInfo[platform];
    if (!binaryInfo) continue;

    printBuildPlatformLabel(platform);

    if (!binaryInfo.url) {
      printBuildReuse({ platform, binaryInfo, ...(params.now ? { now: params.now } : {}) });
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
        ...(params.uploadEffects ? { effects: params.uploadEffects } : {}),
      });
    }
  }
}

export default uploadOrPrintBinaryReuse;
