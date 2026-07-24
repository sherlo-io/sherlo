import { Platform } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import { DEFAULT_PROJECT_ROOT, PLATFORM_LABEL } from '../../../../constants';
import {
  getAppBuildUrl,
  getTokenParts,
  getValidatedBinariesInfoAndNextBuildIndex,
  handleClientError,
  logWarning,
  printResultsUrl,
  uploadOrPrintBinaryReuse,
  reporting,
} from '../../../../helpers';
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

  // ------------------------------------------------------------------
  // Compute the base fingerprint FIRST - before any other work that could load
  // the Expo app config (SHERLO-1756). Loading the app config mutates
  // process.env as a dotenv-class side effect; if that ran before the sanitized
  // Layer-1 compute it would pollute the env that compute snapshots, producing a
  // base fingerprint no probe could ever match.
  //
  // This is the ONLY `createFingerprintAsync` invocation on this path: both the
  // `baseFingerprint` value AND the `nativeFingerprint` wire value are sourced
  // from this single result. `fpResult.nativeFingerprint` is the sanitized
  // Layer-1 hash, or undefined when the compute fails (fail-soft).
  // ------------------------------------------------------------------
  const fpResult = await computeBaseFingerprint(DEFAULT_PROJECT_ROOT, { command: THIS_COMMAND });
  const nativeFingerprint = fpResult.nativeFingerprint;

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
    logWarning({
      message: `Staged uploads unavailable - ${
        fpResult.debugMessage ?? 'fingerprint computation failed'
      }`,
    });
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
