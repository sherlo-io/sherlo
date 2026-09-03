/**
 * The SIM ROAD of `sherlo test` (sim-mode design section 2) - taken when a sim
 * world file is in play, which is exactly when `sherlo.config.json` carries a
 * `simulation` path (see ./test.ts for the routing and the refusals).
 *
 * A sim run travels the REAL road end to end - the same staged slots, the same
 * openBuild, the same output - and only the app is replaced: a declared JSON
 * world stands in for source + bundler + binary. Client-side that means:
 *
 *   1. read + validate the world file (./simWorld - strict, every problem named);
 *   2. derive the real-format module manifest from it (./deriveSimManifest -
 *      the one algorithm), so the server's diff scope runs unchanged;
 *   3. gzip + PUT the manifest to the staged `manifest` slot exactly as
 *      uploadStagedArtifacts does, and PUT the world file itself (verbatim) to
 *      the staged `jsBundle` slot - the sim executor reads it from there;
 *   4. open the build with, per platform: `sim: true`, `manifestS3Key`,
 *      `simWorldS3Key`, and `s3Key` MIRRORING the manifest key - prefix-valid
 *      and a real S3 object, so the one genuine binary existence check passes
 *      without a bypass (the mirrorStagedS3Keys precedent). Devices stay real
 *      catalog entries, which also gives the executor its render dimensions.
 *
 * No bundler runs, no fingerprint is computed, no routing gate is asked - a sim
 * world has no native base to route against - and the staged trio
 * (jsBundleS3Key/bundleSizeMb/assetsS3Key) is deliberately NOT sent, so no
 * baseFingerprint is owed. Output reuses the staged road's own closer verbatim
 * (capture plan, Review URL, --wait contract, server-bypass closer): sim mode
 * changes the machine, never the conversation.
 *
 * Unlike the module-manifest sidecar's bail-open contract, EVERY failure here
 * is fatal: the manifest and the world ARE the run - there is nothing to
 * degrade to without them.
 */
import zlib from 'zlib';
import sdkClient from '@sherlo/sdk-client';
import { Platform } from '@sherlo/api-types';
import chalk from 'chalk';
import { Options } from '../../types';
import {
  getAppBuildUrl,
  getBuildRunConfig,
  getGitInfo,
  getPlatformsToTest,
  getTokenParts,
  getValidatedCommandParams,
  handleClientError,
  printSherloIntro,
  reporting,
  throwError,
  waitForBuildResult,
} from '../../helpers';
import { isServerBypassed } from '../../helpers/waitForBuildResult';
import { THIS_COMMAND } from './constants';
import deriveSimManifest from './deriveSimManifest';
import { readSimWorld } from './simWorld';
import { parseWaitTimeout, printBypassedCloser, printCapturePlanAndCloser } from './stagedRun';
import { putBuffer, type StagedUploadUrlsWithManifest } from './uploadStagedArtifacts';
import type { ValidatedModuleManifest } from './readModuleManifest';

/**
 * The per-platform sim fields of the openBuild config (sim-mode design section
 * 2). A local extension, the same pattern as PlatformConfigWithManifest in
 * ./uploadBundles: the published @sherlo/api-types this repo typechecks against
 * does not carry the `sim` input fields until the api republishes with them.
 * The api department adds exactly these names to the openBuild input; the
 * server reads them off the platform config.
 */
type SimPlatformConfig = {
  sim?: boolean;
  manifestS3Key?: string;
  simWorldS3Key?: string;
};

/** Where each platform's two sim artifacts landed. */
type SimStagedKeys = {
  manifestS3Key: string;
  simWorldS3Key: string;
};

async function simRun(
  passedOptions: Options<THIS_COMMAND>,
  simWorldFilePath: string
): Promise<{ url: string }> {
  printSherloIntro();

  // 1. The world file - strict validation, every problem named at once.
  const world = readSimWorld(simWorldFilePath);

  // 2. Validate params (no platform binary paths - the world is the app).
  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: false }
  );

  // Devices must be REAL catalog entries (openBuild validation requires it, and
  // the sim executor renders at the device's real resolution). Same tool-error
  // exit as the staged road when none are configured.
  const platformsToTest = getPlatformsToTest(commandParams.devices);
  if (platformsToTest.length === 0) {
    console.log(
      chalk.yellow(
        'No devices configured. Add devices in sherlo.config.json to test on specific platforms.'
      )
    );
    await reporting.flush().finally(() => process.exit(1));
  }

  console.log(chalk.bold(`\n🧪 Sim mode: testing the declared world (${world.filePath})...\n`));

  // 3. Derive the manifest - the one algorithm. Same bytes for every platform:
  //    a sim world has no per-platform toolchain to differ by.
  const manifest = deriveSimManifest(world.parsed);

  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  // 4. Upload both artifacts to staged slots, per platform.
  const simKeys = await uploadSimArtifacts({
    client,
    platformsToTest,
    manifest,
    worldRaw: world.raw,
    projectIndex,
    teamId,
  });

  // 5. Git info - IDENTICAL to the other roads (same helper, same override).
  const gitInfo = await getGitInfo(commandParams.projectRoot, {
    branchOverride: commandParams.gitBranch,
  });

  // 6. Build the run config. `s3Key` mirrors the manifest key (prefix-valid, a
  //    real object - the HeadObject check passes with no bypass), and the sim
  //    fields tell the server to dispatch the sim executor instead of a runner.
  const buildRunConfig = getBuildRunConfig({ commandParams });

  for (const platform of platformsToTest) {
    const platformConfig = buildRunConfig[platform] as
      | ((typeof buildRunConfig)['android'] & SimPlatformConfig)
      | undefined;
    const keys = simKeys[platform];
    if (!platformConfig || !keys) continue;

    platformConfig.s3Key = keys.manifestS3Key;
    platformConfig.sim = true;
    platformConfig.manifestS3Key = keys.manifestS3Key;
    platformConfig.simWorldS3Key = keys.simWorldS3Key;
  }

  // 7. Open the build - the REAL openBuild, quota and queue included.
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling openBuild API (sim)',
    data: { teamId, projectIndex, command: THIS_COMMAND },
    level: 'info',
  });

  let openBuildReturn;
  try {
    openBuildReturn = await client.openBuild({
      teamId,
      projectIndex,
      buildRunConfig,
      gitInfo,
      message: commandParams.message,
    });
  } catch (error) {
    handleClientError(error); // always throws
    throw error; // unreachable - satisfies control flow / typing
  }

  // 8. The output road - the staged road's own, reused verbatim.
  const { build } = openBuildReturn;
  const buildIndex = build.index;
  reporting.setTag('build_index', String(buildIndex));
  reporting.setTag('platform', platformsToTest.length === 2 ? 'both' : platformsToTest[0]);

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });
  const serverBypassed = isServerBypassed(openBuildReturn.build.diffScopeInfo);

  printCapturePlanAndCloser({
    openBuildReturn,
    moduleManifests: manifestForEveryPlatform(manifest, platformsToTest),
    platformsToTest,
    url,
    serverBypassed,
  });

  if (commandParams.wait) {
    const exitCode = await waitForBuildResult({
      token: commandParams.token,
      buildIndex,
      projectIndex,
      teamId,
      waitTimeoutMinutes: parseWaitTimeout(commandParams.waitTimeout),
      serverBypassed,
    });

    // --wait mode: the exit code IS the contract. Flush telemetry then exit.
    await reporting.flush().finally(() => {
      process.exit(exitCode);
    });
  } else if (serverBypassed) {
    await printBypassedCloser({
      token: commandParams.token,
      buildIndex,
      projectIndex,
      teamId,
      url,
    });
  }

  return { url };
}

export default simRun;

/* ========================================================================== */

/**
 * PUT the gzipped manifest to each platform's staged `manifest` slot (exactly
 * as uploadStagedArtifacts's manifest branch does) and the world file bytes -
 * verbatim - to the staged `jsBundle` slot, which is where the sim executor
 * reads its world from. FATAL on any miss, unlike the bail-open manifest pass
 * of the real roads: a sim run without either artifact is not a run.
 */
async function uploadSimArtifacts({
  client,
  platformsToTest,
  manifest,
  worldRaw,
  projectIndex,
  teamId,
}: {
  client: ReturnType<typeof sdkClient>;
  platformsToTest: Platform[];
  manifest: ValidatedModuleManifest;
  worldRaw: Buffer;
  projectIndex: number;
  teamId: string;
}): Promise<Partial<Record<Platform, SimStagedKeys>>> {
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling getStagedUploadUrls API (sim)',
    data: { teamId, projectIndex, platforms: platformsToTest },
    level: 'info',
  });

  const { stagedPresignedUploadUrls } = await client
    .getStagedUploadUrls({ platforms: platformsToTest, projectIndex, teamId })
    .catch(handleClientError);

  const gzippedManifest = zlib.gzipSync(manifest.raw);
  const simKeys: Partial<Record<Platform, SimStagedKeys>> = {};

  for (const platform of platformsToTest) {
    const urls = stagedPresignedUploadUrls[platform] as StagedUploadUrlsWithManifest | undefined;

    if (!urls) {
      throwError({ message: `Staged upload slot missing for ${platform}.` });
    }
    if (!urls.manifest) {
      throwError({
        message:
          `The server offered no ${platform} manifest upload slot, which sim mode requires - ` +
          'the API this project points at is too old for sim mode.',
      });
    }

    console.log(chalk.cyan(`\n⬆️  Uploading ${platform} sim world + manifest...`));

    await putBuffer({
      platform,
      label: 'sim module manifest',
      uploadUrl: urls.manifest.url,
      buffer: gzippedManifest,
    });
    await putBuffer({
      platform,
      label: 'sim world',
      uploadUrl: urls.jsBundle.url,
      buffer: worldRaw,
    });

    simKeys[platform] = {
      manifestS3Key: urls.manifest.s3Key,
      simWorldS3Key: urls.jsBundle.s3Key,
    };
  }

  return simKeys;
}

/** The one derived manifest, keyed under every tested platform for the capture plan. */
function manifestForEveryPlatform(
  manifest: ValidatedModuleManifest,
  platformsToTest: Platform[]
): Partial<Record<Platform, ValidatedModuleManifest>> {
  const moduleManifests: Partial<Record<Platform, ValidatedModuleManifest>> = {};
  for (const platform of platformsToTest) {
    moduleManifests[platform] = manifest;
  }
  return moduleManifests;
}
