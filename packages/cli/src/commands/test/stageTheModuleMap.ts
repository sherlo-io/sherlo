import zlib from 'zlib';
import type { Platform } from '@sherlo/api-types';
import { PLATFORM_LABEL } from '../../constants';
import logWarning from '../../helpers/logWarning';
import { serverCalls } from '../../seams/serverCalls';
import type { ValidatedModuleManifest } from './readModuleManifest';
import { putBuffer, type StagedUploadUrlsWithManifest } from './uploadStagedArtifacts';

/**
 * A MODULE MAP STAGED WHERE THE SERVICE OFFERS IT, so the run captures only what changed and the
 * service counts the stories before any phone starts. Uploaded the way every other staged module
 * map is (./uploadStagedArtifacts). Answers the staged key, or undefined when there is no map or
 * no slot for it.
 *
 * BAIL-OPEN, as on every road: a missing or broken map, or one that fails to upload, costs the run
 * its narrowing - it captures every story - and never fails the command.
 */
export async function stageTheModuleMap({
  moduleMap,
  platform,
  ticket,
  teamId,
  projectIndex,
}: {
  /** The module map the platform's build wrote; none when there is none to stage. */
  moduleMap: ValidatedModuleManifest | null | undefined;
  platform: Platform;
  ticket: string;
  teamId: string;
  projectIndex: number;
}): Promise<string | undefined> {
  if (!moduleMap) return undefined;

  try {
    const { stagedPresignedUploadUrls } = await serverCalls().getStagedUploadUrls({
      token: ticket,
      platforms: [platform],
      projectIndex,
      teamId,
    });
    const slot = (stagedPresignedUploadUrls[platform] as StagedUploadUrlsWithManifest | undefined)
      ?.manifest;
    if (!slot) return undefined;

    await putBuffer({
      platform,
      label: 'module manifest',
      uploadUrl: slot.url,
      buffer: zlib.gzipSync(moduleMap.raw),
    });
    return slot.s3Key;
  } catch (error) {
    logWarning({
      message:
        `Failed to upload the ${PLATFORM_LABEL[platform]} module manifest ` +
        `(${error instanceof Error ? error.message : String(error)}); ` +
        'continuing without it.',
    });
    return undefined;
  }
}
