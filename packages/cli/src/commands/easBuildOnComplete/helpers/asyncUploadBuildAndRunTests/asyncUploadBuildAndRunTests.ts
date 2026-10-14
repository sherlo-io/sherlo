import path from 'path';
import zlib from 'zlib';
import { Platform } from '@sherlo/api-types';
import { PLATFORM_LABEL } from '../../../../constants';
import {
  getAppBuildUrl,
  getCwd,
  getPlatformsToTest,
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
import { rowsAbove, printPlatformRowInALog } from '../../../test/platformRows';
import { pushFactsPlatformOf } from '../../../test/appBuild/pushFacts';
import {
  countBundleStories,
  readValidatedModuleManifest,
  type ValidatedModuleManifest,
} from '../../../test/readModuleManifest';
import { putBuffer, type StagedUploadUrlsWithManifest } from '../../../test/uploadStagedArtifacts';
import { THIS_COMMAND } from '../../constants';
import getBuildPath from './getBuildPath';

/**
 * ONE EAS BUILD DELIVERS ITS PLATFORM into the run `sherlo test` opened for it on EAS: upload (or
 * reuse) the app build EAS made, register it as the stored app build, and fill the run's slot. The
 * run starts on Sherlo when the last platform is in, and this says which it was.
 *
 * Every read of the machine and every request goes through the seams (../../../../seams), so the
 * hook can be posed like every other command.
 */
async function asyncUploadBuildAndRunTests({
  buildIndex,
  easBuildProfile,
  ticket,
  teamId,
  projectIndex,
}: {
  buildIndex: number;
  easBuildProfile: string;
  /** The run's one-build ticket, from the hand-over file: every request here spends it. */
  ticket: string;
  teamId: string;
  projectIndex: number;
}) {
  const platform = process.env.EAS_BUILD_PLATFORM as Platform;
  const projectRoot = getCwd();
  const machine = nativeBuild();

  const buildPath = path.resolve(projectRoot, getBuildPath({ easBuildProfile, platform }));

  const { binariesInfo } = await getValidatedBinariesInfoAndNextBuildIndex({
    buildPath,
    token: ticket,
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
  });

  // The base fingerprint FIRST, before anything could load the Expo app config (SHERLO-1756).
  // This build is one platform's, so it registers that platform's own base.
  const fingerprint = (await machine.computeFingerprint(projectRoot, THIS_COMMAND))[platform];
  const nativeFingerprint = fingerprint.nativeFingerprint;

  let baseFingerprint: string | undefined;
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};

  if (fingerprint.hash) {
    baseFingerprint = fingerprint.hash;

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
          baseFingerprint: fingerprint,
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
        fingerprint.debugMessage ?? 'fingerprint computation failed'
      }`,
    });
  }

  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling asyncUpload API',
    data: { buildIndex, teamId, projectIndex, platform },
    level: 'info',
  });

  const moduleMap = readValidatedModuleManifest(projectRoot);
  const manifestS3Key = await stageTheModuleMap({
    moduleMap,
    platform,
    ticket,
    teamId,
    projectIndex,
  });

  const { couldRunThisBuildRightNow, startedRun } = await serverCalls()
    .asyncUpload({
      token: ticket,
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
      ...(manifestS3Key ? { manifestS3Key } : {}),
      pushFacts: pushFactsPlatformOf({
        appBuild: { madeBy: 'eas' },
        storiesInBundle: moduleMap ? countBundleStories(moduleMap) : undefined,
      }),
    } as Parameters<ReturnType<typeof serverCalls>['asyncUpload']>[0])
    .catch((error) => handleClientError(error, ticket));

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  // Every platform's row, then the test's. The last EAS build in starts the test with the ordinary
  // Started row; the whole test's devices and capture come from the service's answer, since this
  // build knows only its own platform. A build that is not the last says the other one is still
  // building on EAS.
  const otherPlatform: Platform = platform === 'android' ? 'ios' : 'android';
  const platformRows = [printPlatformRowInALog({ platform, appBuild: 'built-on-eas' })];

  if (couldRunThisBuildRightNow) {
    if (getPlatformsToTest(startedRun?.devices ?? []).includes(otherPlatform)) {
      platformRows.push(
        printPlatformRowInALog({ platform: otherPlatform, appBuild: 'built-on-eas' })
      );
    }
    emit({ kind: 'test-started', buildIndex, ...startedRun, rowsAbove: rowsAbove(platformRows) });
  } else {
    platformRows.push(
      printPlatformRowInALog({ platform: otherPlatform, appBuild: 'still-building-on-eas' })
    );
    emit({
      kind: 'run-waits-for-builds',
      buildIndex,
      waitingFor: { easBuild: otherPlatform },
      rowsAbove: rowsAbove(platformRows),
    });
  }
  emit({ kind: 'results-url', url });

  return { buildIndex, url };
}

export default asyncUploadBuildAndRunTests;

/* ========================================================================== */

/**
 * THE MODULE MAP THE EAS BUILD WROTE, staged where the service offers it, so the run captures only
 * what changed, as Diff Scope does on every other road. The Sherlo bundler step wrote it into the
 * project while EAS bundled the app; it is read the way every other road reads it and uploaded the
 * way every other staged module map is (../../../test/uploadStagedArtifacts). Answers the staged
 * key, or undefined when there is no map or no slot for it.
 *
 * BAIL-OPEN, as on every road: a missing or broken map, or one that fails to upload, costs the run
 * its narrowing - it captures every story - and never fails the hook.
 */
async function stageTheModuleMap({
  moduleMap,
  platform,
  ticket,
  teamId,
  projectIndex,
}: {
  /** The module map the EAS build wrote; none when there is none to stage. */
  moduleMap: ValidatedModuleManifest | null;
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
