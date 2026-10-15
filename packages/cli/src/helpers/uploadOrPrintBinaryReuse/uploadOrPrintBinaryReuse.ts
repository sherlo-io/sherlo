import { PLATFORM_LABEL, PLATFORMS } from '../../constants';
import { BinariesInfo } from '../../types';
import { nativeBuild } from '../../seams/nativeBuild';
import throwError from '../throwError';
import uploadBuild, { type BinaryUploadEffects } from './uploadBuild';

/**
 * The per-platform binary block of a push: a fresh upload for each app build the backend has not
 * seen before, and nothing for one it already holds.
 */
async function uploadOrPrintBinaryReuse(params: {
  binariesInfo: BinariesInfo;
  projectRoot: string;
  android?: string;
  ios?: string;
  /** Supplied by an expectation producer so this exact loop runs offline. */
  uploadEffects?: BinaryUploadEffects;
}): Promise<void> {
  for (const platform of PLATFORMS) {
    const binaryInfo = params.binariesInfo[platform];

    // No url: the server already holds this app build, so nothing goes up and nothing prints.
    if (!binaryInfo?.url) continue;

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
      // The machine IN FORCE, not uploadBuild's own real-machine default - a posed run installs
      // its own (../../seams/nativeBuild), so this never falls through to a real upload.
      effects: params.uploadEffects ?? {
        readBinary: (buildPath, binaryPlatform, projectRoot) =>
          nativeBuild().readBinaryForUpload(buildPath, binaryPlatform, projectRoot),
        putBinary: (uploadUrl, data) => nativeBuild().putBinary(uploadUrl, data),
      },
    });
  }
}

export default uploadOrPrintBinaryReuse;
