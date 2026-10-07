import path from 'path';
import { Platform } from '@sherlo/api-types';
import {
  getAppBuildUrl,
  getCwd,
  getTokenParts,
  getValidatedBinariesInfoAndNextBuildIndex,
  handleClientError,
  logWarning,
  uploadOrPrintBinaryReuse,
  reporting,
} from '../../../../helpers';
import { registerBase, type GateMetadataInput } from '../../../../helpers/fingerprint';
import { emit } from '../../../../helpers/transcriptSink';
import { nativeBuild } from '../../../../seams/nativeBuild';
import { serverCalls } from '../../../../seams/serverCalls';
import { THIS_COMMAND } from '../../constants';
import getBuildPath from './getBuildPath';

/**
 * ONE EAS BUILD DELIVERS ITS PLATFORM into the run `sherlo test` opened for it on EAS: upload (or
 * reuse) the app build EAS made, register it as the stored app build, and fill the run's slot. The
 * run starts on Sherlo when the last platform is in, and this says which it was.
 *
 * Every read of the machine and every request goes through the seams (../../../../seams), so the
 * hook can be posed like every other command (epic sherlo-test-builds-apps: it used to reach the
 * service and the files around them directly, and was the one road a plan could not draw).
 */
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
  const projectRoot = getCwd();
  const machine = nativeBuild();

  const buildPath = path.resolve(projectRoot, getBuildPath({ easBuildProfile, platform }));

  const { projectIndex, teamId } = getTokenParts(token);

  const { binariesInfo } = await getValidatedBinariesInfoAndNextBuildIndex({
    buildPath,
    token,
    command: THIS_COMMAND,
    platform,
    projectIndex,
    teamId,
  });

  await uploadOrPrintBinaryReuse({
    binariesInfo,
    projectRoot,
    android: platform === 'android' ? buildPath : undefined,
    ios: platform === 'ios' ? buildPath : undefined,
    uploadEffects: {
      readBinary: (binaryPath, binaryPlatform, root) =>
        machine.readBinaryForUpload(binaryPath, binaryPlatform, root),
      putBinary: (uploadUrl, data) => machine.putBinary(uploadUrl, data),
    },
    now: machine.now(),
  });

  // The base fingerprint FIRST, before anything could load the Expo app config (SHERLO-1756).
  const fpResult = await machine.computeFingerprint(projectRoot, THIS_COMMAND);
  const nativeFingerprint = fpResult.nativeFingerprint;

  let baseFingerprint: string | undefined;
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};

  if (fpResult.hash) {
    baseFingerprint = fpResult.hash;

    // Extract gate metadata for this single platform (fail-soft).
    try {
      const bundlePath = platform === 'android' ? 'assets/index.android.bundle' : 'main.jsbundle';
      const binaryBuildType = binariesInfo[platform]?.buildType;

      const result = await registerBase(
        {
          binaryPath: buildPath,
          platform,
          projectRoot,
          bundlePath,
          buildType: binaryBuildType ?? 'preview',
          baseFingerprintHash: fpResult.hash,
          command: THIS_COMMAND,
        },
        { extractGateMetadataFor: (params) => machine.extractGateMetadataFor(params) }
      );

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

  const { couldRunThisBuildRightNow } = await serverCalls()
    .asyncUpload({
      token,
      buildIndex,
      projectIndex,
      teamId,
      androidS3Key: binariesInfo.android?.s3Key,
      iosS3Key: binariesInfo.ios?.s3Key,
      sdkVersion: binariesInfo.sdkVersion,
      // `binaryFileName` is the field the service reads; the hook used to send `fileName`, which
      // the service dropped, so the run's error page never named the file (Sherlo 3 audit).
      binaryFileName: binariesInfo[platform]?.fileName,
      nativeFingerprint,
      ...(baseFingerprint ? { baseFingerprint, gateMetadata } : {}),
    } as Parameters<ReturnType<typeof serverCalls>['asyncUpload']>[0])
    .catch((error) => handleClientError(error, token));

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  emit(
    couldRunThisBuildRightNow
      ? { kind: 'run-starting', buildIndex }
      : {
          kind: 'run-waits-for-builds',
          buildIndex,
          waitingFor: { easBuild: platform === 'android' ? 'ios' : 'android' },
        }
  );
  emit({ kind: 'results-url', url });

  return { buildIndex, url };
}

export default asyncUploadBuildAndRunTests;
