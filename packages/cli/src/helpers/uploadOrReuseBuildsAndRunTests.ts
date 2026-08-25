import sdkClient from '@sherlo/sdk-client';
import { Platform } from '@sherlo/api-types';
import logWarning from './logWarning';
import { TEST_EAS_UPDATE_COMMAND, TEST_STANDARD_COMMAND } from '../constants';
import { CommandParams, EasUpdateData } from '../types';
import { emit } from './transcriptSink';
import { emitAndUploadModuleManifests, type ManifestEffects } from './emitAndUploadModuleManifests';
import type { BinaryUploadEffects } from './uploadOrPrintBinaryReuse/uploadBuild';
import type { BaseRegistrationEffects } from './fingerprint/registerBase';
import type { BaseFingerprintResult } from './fingerprint';
import type { GitInfo } from './getGitInfo';
import type { ValidatedBinariesInfo } from '../types';
import getAppBuildUrl from './getAppBuildUrl';
import getBuildRunConfig from './getBuildRunConfig';
import getGitInfo from './getGitInfo';
import getTokenParts from './getTokenParts';
import getValidatedBinariesInfoAndNextBuildIndex from './getValidatedBinariesInfoAndNextBuildIndex';
import handleClientError from './handleClientError';
import printBuildIntroMessage from './printBuildIntroMessage';
import printResultsUrl from './printResultsUrl';
import reporting from './reporting';
import { computeBaseFingerprint, registerBase, type GateMetadataInput } from './fingerprint';
import { REAL_BASE_REGISTRATION_EFFECTS } from './fingerprint/registerBase';
import { realManifestEffects } from './emitAndUploadModuleManifests';
import { REAL_BINARY_UPLOAD_EFFECTS } from './uploadOrPrintBinaryReuse/uploadBuild';
import uploadOrPrintBinaryReuse from './uploadOrPrintBinaryReuse';
import waitForBuildResult from './waitForBuildResult';

/**
 * The per-platform `manifestS3Key` the api department is adding to the
 * openBuild `buildRunConfig` in parallel (SHERLO-1894/1943). Optional and
 * local for the same reason testBundled.ts's `PlatformConfigWithManifest`
 * is: the published @sherlo/api-types config type this repo typechecks
 * against does not carry it yet. Drop once api-types republishes with it.
 */
type PlatformConfigWithManifest = { manifestS3Key?: string };

/**
 * EVERY EFFECT THE PUSH SPINE PERFORMS, AS PARAMETERS - which is what lets an
 * expectation producer run THIS function rather than a re-implementation of it.
 *
 * The spine's transcript is emitted from here and from the shipped helpers it
 * calls, interleaved with these awaits: the run header before the binaries go
 * up, each platform's block around its own upload, the EAS block, the
 * fingerprint warnings from inside `registerBase`, the manifest block from
 * inside `emitAndUploadModuleManifests`, and the closer after `openBuild`
 * answers. A producer that re-implemented that order could drift from it
 * silently; supplying the effects means the order, the branching and every
 * literal come from the shipped code, unforked.
 *
 * WHAT IS *NOT* HERE IS THE POINT. There is no substitute for a formatter, a
 * print site, a segment or a branch - only for the things that touch the
 * network, the filesystem and the clock.
 */
export type PushEffects = {
  /**
   * The instant a reuse line's "N minutes ago" is measured against - the ONE
   * wall-clock read on this transcript's path, and an effect for exactly the
   * reason the network ones are: a fixed scripted state that read the real clock
   * would render different bytes tomorrow.
   */
  now: () => Date;
  /**
   * `ValidatedBinariesInfo`, not `BinariesInfo`: the `openBuild` call below
   * reads `binariesInfo.sdkVersion`, which only the VALIDATED shape carries.
   */
  resolveBinaries: () => Promise<{
    binariesInfo: ValidatedBinariesInfo;
    nextBuildIndex: number;
  }>;
  resolveGitInfo: () => Promise<GitInfo>;
  computeFingerprint: () => Promise<BaseFingerprintResult>;
  openBuild: (input: Record<string, unknown>) => Promise<{ build: { index: number } }>;
  binaryUpload: BinaryUploadEffects;
  baseRegistration: BaseRegistrationEffects;
  manifest: ManifestEffects;
};

async function uploadOrReuseBuildsAndRunTests({
  commandParams,
  easUpdateData,
  effects,
}: {
  commandParams: CommandParams;
  easUpdateData?: EasUpdateData;
  effects?: PushEffects;
}): Promise<{ url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  const command = easUpdateData ? TEST_EAS_UPDATE_COMMAND : TEST_STANDARD_COMMAND;

  const io: PushEffects = effects ?? {
    now: () => new Date(),
    resolveBinaries: () =>
      getValidatedBinariesInfoAndNextBuildIndex({
        client,
        command,
        commandParams,
        projectIndex,
        teamId,
      }),
    resolveGitInfo: () =>
      getGitInfo(commandParams.projectRoot, { branchOverride: commandParams.gitBranch }),
    computeFingerprint: () => computeBaseFingerprint(commandParams.projectRoot, { command }),
    openBuild: (input) => client.openBuild(input as never).catch(handleClientError),
    binaryUpload: REAL_BINARY_UPLOAD_EFFECTS,
    baseRegistration: REAL_BASE_REGISTRATION_EFFECTS,
    manifest: realManifestEffects(client),
  };

  const { binariesInfo, nextBuildIndex } = await io.resolveBinaries();

  printBuildIntroMessage({ commandParams, nextBuildIndex });

  await uploadOrPrintBinaryReuse({
    binariesInfo,
    projectRoot: commandParams.projectRoot,
    android: commandParams.android,
    ios: commandParams.ios,
    uploadEffects: io.binaryUpload,
    now: io.now(),
  });

  if (easUpdateData) {
    printEasUpdateData(easUpdateData);
  }

  const gitInfo = await io.resolveGitInfo();

  // ------------------------------------------------------------------
  // Compute the base fingerprint FIRST - before any other work that could load
  // the Expo app config (SHERLO-1756). Loading the app config mutates
  // process.env as a dotenv-class side effect; if that ran before the sanitized
  // Layer-1 compute it would pollute the env that compute snapshots, producing a
  // base fingerprint no probe (the staged road, which never loads the
  // config first) could ever match.
  //
  // This is the ONLY `createFingerprintAsync` invocation on this path: both the
  // `baseFingerprint` value AND the `nativeFingerprint` wire value are sourced
  // from this single result. `fpResult.nativeFingerprint` is the sanitized
  // Layer-1 hash, or undefined when the compute fails (fail-soft).
  // ------------------------------------------------------------------
  const fpResult = await io.computeFingerprint();
  const nativeFingerprint = fpResult.nativeFingerprint;

  let baseFingerprint: string | undefined;
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};
  let manifestS3Keys: Partial<Record<Platform, string>> = {};

  if (fpResult.hash) {
    baseFingerprint = fpResult.hash;

    // Extract gate metadata per platform (fail-soft per platform).
    const platforms: Platform[] = [];
    if (binariesInfo.android && commandParams.android) platforms.push('android');
    if (binariesInfo.ios && commandParams.ios) platforms.push('ios');

    for (const platform of platforms) {
      try {
        const binaryPath = platform === 'android' ? commandParams.android! : commandParams.ios!;
        const binaryInfo = platform === 'android' ? binariesInfo.android! : binariesInfo.ios!;
        const bundlePath = getBundlePathInBinary(platform, commandParams.projectRoot);

        const result = await registerBase(
          {
            binaryPath,
            platform,
            projectRoot: commandParams.projectRoot,
            bundlePath,
            buildType: binaryInfo.buildType,
            baseFingerprintHash: fpResult.hash,
            command,
          },
          io.baseRegistration
        );

        if (result.gateMetadata) {
          gateMetadata[platform] = result.gateMetadata;
        }
      } catch {
        // Fail-soft: base registration errors are non-fatal.
      }
    }

    // SHERLO-1943: emit + upload the per-platform module manifest via the SAME
    // producer the staged road uses, guarded by provenance (clean tree + known
    // commit). Runs alongside base registration since the manifest is only
    // meaningful when compared against the base being registered here.
    manifestS3Keys = await emitAndUploadModuleManifests({
      client,
      projectRoot: commandParams.projectRoot,
      platforms,
      gitInfo,
      projectIndex,
      teamId,
      effects: io.manifest,
    });
  } else {
    logWarning({
      message: `Staged uploads unavailable - ${
        fpResult.debugMessage ?? 'fingerprint computation failed'
      }`,
    });
  }

  const buildRunConfig = getBuildRunConfig({
    commandParams,
    binaryS3Keys: {
      android: binariesInfo.android?.s3Key,
      ios: binariesInfo.ios?.s3Key,
    },
    easUpdateData,
  });

  // Mirror the manifest S3 key onto its platform config, exactly like
  // testBundled.ts's manifestS3Key wiring. Only set when present, so a
  // skipped/failed manifest sends nothing extra.
  for (const platform of Object.keys(manifestS3Keys) as Platform[]) {
    const key = manifestS3Keys[platform];
    const platformConfig = buildRunConfig[platform];
    if (platformConfig && key) {
      (platformConfig as PlatformConfigWithManifest).manifestS3Key = key;
    }
  }

  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling openBuild API',
    data: { teamId, projectIndex, command: easUpdateData ? 'testEasUpdate' : 'testStandard' },
    level: 'info',
  });

  const { build } = await io.openBuild({
    teamId,
    projectIndex,
    binaryHashes: {
      android: binariesInfo.android?.hash,
      ios: binariesInfo.ios?.hash,
    },
    binaryFileNames: {
      android: binariesInfo.android?.fileName,
      ios: binariesInfo.ios?.fileName,
    },
    buildRunConfig,
    gitInfo,
    sdkVersion: binariesInfo.sdkVersion,
    message: commandParams.message,
    nativeFingerprint,
    ...(baseFingerprint ? { baseFingerprint, gateMetadata } : {}),
  });

  const buildIndex = build.index;
  // Sentry tags must be strings; buildIndex is a number from the API response.
  reporting.setTag('build_index', String(buildIndex));

  const platform =
    binariesInfo.android && binariesInfo.ios ? 'both' : binariesInfo.android ? 'android' : 'ios';
  reporting.setTag('platform', platform);

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  printResultsUrl(url);

  if (commandParams.wait) {
    const exitCode = await waitForBuildResult({
      token: commandParams.token,
      buildIndex: buildIndex,
      projectIndex,
      teamId,
      waitTimeoutMinutes: parseWaitTimeout(commandParams.waitTimeout),
    });

    // --wait mode: the exit code IS the contract. Flush telemetry then exit.
    await reporting.flush().finally(() => {
      process.exit(exitCode);
    });
  }

  return { url };
}

export default uploadOrReuseBuildsAndRunTests;

/* ========================================================================== */

function printEasUpdateData(easUpdateData: EasUpdateData) {
  emit({
    kind: 'eas-update',
    message: easUpdateData.message,
    timeAgo: easUpdateData.timeAgo,
    author: easUpdateData.author,
    branch: easUpdateData.branch,
  });
}

/**
 * Determine the JS bundle path within the built binary for a given platform.
 *
 * Uses the FIXED platform default for the embedded bundle asset name:
 * `assets/index.android.bundle` on Android, `main.jsbundle` on iOS.
 * This is the default set by React Native's Gradle bundle task and
 * `expo export:embed` - it does NOT vary with the JS entry file.
 */
function getBundlePathInBinary(platform: 'android' | 'ios', _projectRoot: string): string {
  if (platform === 'android') {
    return 'assets/index.android.bundle';
  }
  return 'main.jsbundle';
}

function parseWaitTimeout(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const minutes = parseInt(raw, 10);
  if (isNaN(minutes) || minutes < 1) {
    logWarning({
      message: `Invalid --wait-timeout "${raw}"; using default 45 minutes.`,
    });
    return undefined;
  }
  return minutes;
}
