import { Platform } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import { DEFAULT_PROJECT_ROOT, PLATFORM_LABEL } from '../../../../constants';
import {
  getAppBuildUrl,
  getGitInfo,
  getTokenParts,
  getValidatedBinariesInfoAndNextBuildIndex,
  handleClientError,
  printResultsUrl,
  uploadOrPrintBinaryReuse,
  reporting,
} from '../../../../helpers';
import { computeChangedFiles, computeNativeFingerprint } from '../../../../helpers/diffScope';
import {
  computeBaseFingerprint,
  registerBase,
  type GateMetadataInput,
} from '../../../../helpers/fingerprint';
import { THIS_COMMAND } from '../../constants';
import getBuildPath from './getBuildPath';

async function asyncUploadBuildAndRunTests({
  buildIndex,
  easBuildProfile,
  token,
}: {
  buildIndex: number;
  easBuildProfile: string;
  token: string;
}) {
  const platform = process.env.EAS_BUILD_PLATFORM as Platform;

  const buildPath = getBuildPath({ easBuildProfile, platform });

  const { apiToken, projectIndex, teamId } = getTokenParts(token);
  const client = sdkClient({ authToken: apiToken });

  const { binariesInfo } = await getValidatedBinariesInfoAndNextBuildIndex({
    buildPath,
    client,
    command: THIS_COMMAND,
    platform,
    projectIndex,
    teamId,
  });

  await uploadOrPrintBinaryReuse({
    binariesInfo,
    projectRoot: DEFAULT_PROJECT_ROOT,
    android: platform === 'android' ? buildPath : undefined,
    ios: platform === 'ios' ? buildPath : undefined,
  });

  // Diff Scope: compute changed files and native fingerprint for the EAS-cloud path.
  // The same bail-to-full conditions apply: shallow clone, dirty tree, no mergeBaseSha.
  const gitInfo = await getGitInfo(DEFAULT_PROJECT_ROOT);
  const changedFilesResult = await computeChangedFiles(DEFAULT_PROJECT_ROOT, gitInfo);
  let changedFiles: string[] | undefined;
  if ('changedFiles' in changedFilesResult) {
    changedFiles = changedFilesResult.changedFiles;
  } else {
    console.log(`[Sherlo] Diff Scope: full capture - ${changedFilesResult.reason}`);
  }
  const nativeFingerprint = (await computeNativeFingerprint(DEFAULT_PROJECT_ROOT)) ?? undefined;

  // ------------------------------------------------------------------
  // Compute base fingerprint (project-level, once) and per-platform
  // gate metadata BEFORE the API call so they can be wired into the
  // asyncUpload payload.
  // ------------------------------------------------------------------
  const fpResult = await computeBaseFingerprint(DEFAULT_PROJECT_ROOT, { command: THIS_COMMAND });

  let baseFingerprint: string | undefined;
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};

  if (fpResult.hash) {
    baseFingerprint = fpResult.hash;

    // Extract gate metadata for this single platform (fail-soft).
    try {
      const bundlePath = platform === 'android' ? 'assets/index.android.bundle' : 'main.jsbundle';
      const binaryBuildType = binariesInfo[platform]?.buildType;

      const result = await registerBase({
        binaryPath: buildPath,
        platform,
        projectRoot: DEFAULT_PROJECT_ROOT,
        bundlePath,
        buildType: binaryBuildType ?? 'preview',
        baseFingerprintHash: fpResult.hash,
        command: THIS_COMMAND,
      });

      if (result.gateMetadata) {
        gateMetadata[platform] = result.gateMetadata;
      }
    } catch {
      // Fail-soft: base registration errors are non-fatal.
    }
  } else {
    console.log(
      `[Sherlo] Staged uploads unavailable - ${
        fpResult.debugMessage ?? 'fingerprint computation failed'
      }`
    );
  }

  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling asyncUpload API',
    data: { buildIndex, teamId, projectIndex, platform },
    level: 'info',
  });

  const { couldRunThisBuildRightNow } = await client
    .asyncUpload({
      buildIndex,
      projectIndex,
      teamId,
      androidS3Key: binariesInfo.android?.s3Key,
      iosS3Key: binariesInfo.ios?.s3Key,
      sdkVersion: binariesInfo.sdkVersion,
      fileName: binariesInfo[platform]?.fileName,
      changedFiles,
      nativeFingerprint,
      ...(baseFingerprint ? { baseFingerprint, gateMetadata } : {}),
    })
    .catch(handleClientError);

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  if (!couldRunThisBuildRightNow) {
    console.log(
      `⏳ Waiting for ${
        platform === 'android' ? PLATFORM_LABEL.ios : PLATFORM_LABEL.android
      } build to complete...\n`
    );
  } else {
    console.log('🚀 All required platforms are ready - starting tests...\n');

    printResultsUrl(url);
  }

  return { buildIndex, url };
}

export default asyncUploadBuildAndRunTests;
