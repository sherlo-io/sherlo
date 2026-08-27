import sdkClient from '@sherlo/sdk-client';
import { Platform } from '@sherlo/api-types';
import logWarning from './logWarning';
import { PLATFORM_LABEL, TEST_COMMAND } from '../constants';
import { CommandParams } from '../types';
import {
  realFreshBundleEffects,
  uploadFreshBundles,
  type FreshBundleEffects,
} from './uploadFreshBundles';
import { applyBundleToPlatformConfig } from '../commands/test/uploadBundles';
import { resolveBaseFingerprintForSuppliedBundle } from '../commands/test/recordedBaseFingerprint';
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
import throwError from './throwError';
import { computeBaseFingerprint, registerBase, type GateMetadataInput } from './fingerprint';
import { REAL_BASE_REGISTRATION_EFFECTS } from './fingerprint/registerBase';
import { REAL_BINARY_UPLOAD_EFFECTS } from './uploadOrPrintBinaryReuse/uploadBuild';
import uploadOrPrintBinaryReuse from './uploadOrPrintBinaryReuse';
import waitForBuildResult from './waitForBuildResult';

/**
 * EVERY EFFECT THE PUSH SPINE PERFORMS, AS PARAMETERS - which is what lets an
 * expectation producer run THIS function rather than a re-implementation of it.
 *
 * The spine's transcript is emitted from here and from the shipped helpers it
 * calls, interleaved with these awaits: the run header before the binaries go
 * up, each platform's block around its own upload, the fingerprint warnings
 * from inside `registerBase`, the bundle block from inside `uploadFreshBundles`,
 * and the closer after `openBuild` answers. A producer that re-implemented that order
 * could drift from it silently; supplying the effects means the order, the
 * branching and every literal come from the shipped code, unforked.
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
  /** The fresh bundle spliced into every binary this run renders. */
  freshBundle: FreshBundleEffects;
};

/**
 * The standard road of `sherlo test`: upload (or reuse) the binaries, register
 * them as the native base, splice a freshly built bundle in and open the build.
 */
async function uploadOrReuseBuildsAndRunTests({
  commandParams,
  effects,
}: {
  commandParams: CommandParams;
  effects?: PushEffects;
}): Promise<{ url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  const command = TEST_COMMAND;

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
    // A run that supplies its bundle takes the fingerprint the bundle recorded
    // when this tree's native inputs still match - the machine that accepts a
    // bundle has no install to compute one with. See ./recordedBaseFingerprint.
    computeFingerprint: () =>
      commandParams.bundleDir !== undefined
        ? resolveBaseFingerprintForSuppliedBundle({
            bundleDir: commandParams.bundleDir,
            projectRoot: commandParams.projectRoot,
            platforms: platformsWithBinaries(commandParams),
            command,
          })
        : computeBaseFingerprint(commandParams.projectRoot, { command }),
    openBuild: (input) => client.openBuild(input as never).catch(handleClientError),
    binaryUpload: REAL_BINARY_UPLOAD_EFFECTS,
    baseRegistration: REAL_BASE_REGISTRATION_EFFECTS,
    freshBundle: realFreshBundleEffects(client),
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

  // The platforms the user handed a binary for. Each is registered as the
  // native base below and rendered with a fresh bundle.
  const platforms: Platform[] = [];
  if (binariesInfo.android && commandParams.android) platforms.push('android');
  if (binariesInfo.ios && commandParams.ios) platforms.push('ios');

  let baseFingerprint: string | undefined;
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};
  /**
   * Per platform, why a fresh bundle cannot be spliced into its binary; absent
   * when it can. A base is registered exactly when the binary loads a plain-JS
   * bundle from the platform-default path (see checkStageable), which is the
   * same fact the runner's splice relies on - so a refused registration is a
   * refused splice, and its reason is the one to show.
   */
  const notSpliceableReasons: Partial<Record<Platform, string>> = {};

  if (fpResult.hash) {
    baseFingerprint = fpResult.hash;

    // Extract gate metadata per platform (fail-soft per platform).
    for (const platform of platforms) {
      try {
        const binaryPath = platform === 'android' ? commandParams.android! : commandParams.ios!;
        const binaryInfo = platform === 'android' ? binariesInfo.android! : binariesInfo.ios!;

        const result = await registerBase(
          {
            binaryPath,
            platform,
            projectRoot: commandParams.projectRoot,
            bundlePath: defaultEmbeddedBundlePath(platform),
            buildType: binaryInfo.buildType,
            baseFingerprintHash: fpResult.hash,
            command,
          },
          io.baseRegistration
        );

        if (result.gateMetadata) {
          gateMetadata[platform] = result.gateMetadata;
        }
        if (!result.registered) {
          notSpliceableReasons[platform] =
            result.notStageableReason ?? 'the gate metadata could not be read from the binary';
        }
      } catch {
        // Fail-soft: base registration errors are non-fatal.
        notSpliceableReasons[platform] = 'base registration failed';
      }
    }
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
  });

  // THE RUN RENDERS A FRESHLY BUILT BUNDLE, OR IT DOES NOT RUN.
  //
  // The runner splices the bundle into the binary at the platform-default
  // bundle path, so a binary that does not load a plain-JS bundle from that
  // path cannot render it, and without a base fingerprint there is no base to
  // name the splice against. Either way the binary's own embedded bundle would
  // render instead - a run this command never performs - so the run is
  // refused, naming every reason at once.
  const reasons = platforms
    .filter((platform) => notSpliceableReasons[platform])
    .map((platform) => `${PLATFORM_LABEL[platform]}: ${notSpliceableReasons[platform]}`);
  if (!baseFingerprint) {
    reasons.push(`base fingerprint: ${fpResult.debugMessage ?? 'fingerprint computation failed'}`);
  }
  if (reasons.length > 0 || !baseFingerprint) {
    throwError({
      message:
        'This run cannot render a freshly built JS bundle, so it was not started.\n\n' +
        `${reasons.map((reason) => `  - ${reason}`).join('\n')}\n\n` +
        'Every `sherlo test` run renders the bundle built from your current project, ' +
        'spliced into the binary you passed. A binary that cannot take it would render ' +
        'the JS it was built with instead, so it is refused rather than tested stale.',
    });
  }

  const freshBundles = await uploadFreshBundles({
    projectRoot: commandParams.projectRoot,
    platforms,
    bundleDir: commandParams.bundleDir,
    baseFingerprint,
    projectIndex,
    teamId,
    effects: io.freshBundle,
  });

  // The binary keeps its own `s3Key` (set by getBuildRunConfig above): the
  // bundle is spliced into THIS binary, not into a registered base.
  for (const platform of platforms) {
    const platformConfig = buildRunConfig[platform];
    const uploaded = freshBundles[platform];
    if (!platformConfig || !uploaded) continue;

    applyBundleToPlatformConfig({
      platformConfig,
      keys: uploaded.keys,
      bundleSizeMb: uploaded.bundleSizeMb,
    });
  }

  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling openBuild API',
    data: { teamId, projectIndex, command },
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

/**
 * Where a React Native binary embeds its JS bundle by default:
 * `assets/index.android.bundle` on Android, `main.jsbundle` on iOS. It is the
 * default set by React Native's Gradle bundle task and `expo export:embed`, and
 * does NOT vary with the JS entry file.
 *
 * This is base-registration metadata, not the bundle a run renders. Base
 * registration probes this path to learn whether the binary embeds a bundle
 * and in what format; the runner later overwrites the same path with the
 * freshly built bundle, which is what actually runs.
 */
/** The platforms the user handed a binary for - the ones this run tests. */
function platformsWithBinaries(commandParams: CommandParams): Platform[] {
  const platforms: Platform[] = [];
  if (commandParams.android) platforms.push('android');
  if (commandParams.ios) platforms.push('ios');
  return platforms;
}

function defaultEmbeddedBundlePath(platform: Platform): string {
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
