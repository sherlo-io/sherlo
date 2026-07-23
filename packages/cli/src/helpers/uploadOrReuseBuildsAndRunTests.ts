import sdkClient from '@sherlo/sdk-client';
import chalk from 'chalk';
import logWarning from './logWarning';
import { TEST_EAS_UPDATE_COMMAND, TEST_STANDARD_COMMAND } from '../constants';
import { CommandParams, EasUpdateData } from '../types';
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
import uploadOrPrintBinaryReuse from './uploadOrPrintBinaryReuse';
import waitForBuildResult from './waitForBuildResult';

async function uploadOrReuseBuildsAndRunTests({
  commandParams,
  easUpdateData,
}: {
  commandParams: CommandParams;
  easUpdateData?: EasUpdateData;
}): Promise<{ url: string }> {
  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  const { binariesInfo, nextBuildIndex } = await getValidatedBinariesInfoAndNextBuildIndex({
    client,
    command: easUpdateData ? TEST_EAS_UPDATE_COMMAND : TEST_STANDARD_COMMAND,
    commandParams,
    projectIndex,
    teamId,
  });

  printBuildIntroMessage({ commandParams, nextBuildIndex });

  await uploadOrPrintBinaryReuse({
    binariesInfo,
    projectRoot: commandParams.projectRoot,
    android: commandParams.android,
    ios: commandParams.ios,
  });

  if (easUpdateData) {
    printEasUpdateData(easUpdateData);
  }

  const gitInfo = await getGitInfo(commandParams.projectRoot, {
    branchOverride: commandParams.gitBranch,
  });

  // ------------------------------------------------------------------
  // Compute the base fingerprint FIRST - before any other work that could load
  // the Expo app config (SHERLO-1756). Loading the app config mutates
  // process.env as a dotenv-class side effect; if that ran before the sanitized
  // Layer-1 compute it would pollute the env that compute snapshots, producing a
  // base fingerprint no probe (staged:check / test:bundled, which never load the
  // config first) could ever match.
  //
  // This is the ONLY `createFingerprintAsync` invocation on this path: both the
  // `baseFingerprint` value AND the `nativeFingerprint` wire value are sourced
  // from this single result. `fpResult.nativeFingerprint` is the sanitized
  // Layer-1 hash, or undefined when the compute fails (fail-soft).
  // ------------------------------------------------------------------
  const fingerprintCommand = easUpdateData ? TEST_EAS_UPDATE_COMMAND : TEST_STANDARD_COMMAND;
  const fpResult = await computeBaseFingerprint(commandParams.projectRoot, {
    command: fingerprintCommand,
  });
  const nativeFingerprint = fpResult.nativeFingerprint;

  let baseFingerprint: string | undefined;
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};

  if (fpResult.hash) {
    baseFingerprint = fpResult.hash;

    // Extract gate metadata per platform (fail-soft per platform).
    const platforms: ('android' | 'ios')[] = [];
    if (binariesInfo.android && commandParams.android) platforms.push('android');
    if (binariesInfo.ios && commandParams.ios) platforms.push('ios');

    for (const platform of platforms) {
      try {
        const binaryPath = platform === 'android' ? commandParams.android! : commandParams.ios!;
        const binaryInfo = platform === 'android' ? binariesInfo.android! : binariesInfo.ios!;
        const bundlePath = getBundlePathInBinary(platform, commandParams.projectRoot);

        const result = await registerBase({
          binaryPath,
          platform,
          projectRoot: commandParams.projectRoot,
          bundlePath,
          buildType: binaryInfo.buildType,
          baseFingerprintHash: fpResult.hash,
          command: fingerprintCommand,
        });

        if (result.gateMetadata) {
          gateMetadata[platform] = result.gateMetadata;
        }
      } catch {
        // Fail-soft: base registration errors are non-fatal.
      }
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
    message: 'Calling openBuild API',
    data: { teamId, projectIndex, command: easUpdateData ? 'testEasUpdate' : 'testStandard' },
    level: 'info',
  });

  const { build } = await client
    .openBuild({
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
      buildRunConfig: getBuildRunConfig({
        commandParams,
        binaryS3Keys: {
          android: binariesInfo.android?.s3Key,
          ios: binariesInfo.ios?.s3Key,
        },
        easUpdateData,
      }),
      gitInfo,
      sdkVersion: binariesInfo.sdkVersion,
      message: commandParams.message,
      nativeFingerprint,
      ...(baseFingerprint ? { baseFingerprint, gateMetadata } : {}),
    })
    .catch(handleClientError);

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
  console.log(
    `🔄 ${chalk.bold('EAS Update')}\n` +
      `└─ message: ${chalk.blue(easUpdateData.message)}\n` +
      `└─ created: ${chalk.blue(easUpdateData.timeAgo)}\n` +
      `└─ author: ${chalk.blue(easUpdateData.author)}\n` +
      `└─ branch: ${chalk.blue(easUpdateData.branch)}\n`
  );
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
