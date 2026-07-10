/**
 * test:bundled command - the bundle-only fast path for staged builds.
 *
 * Builds a production plain-JS bundle + assets via the project's canonical
 * bundler, computes the base fingerprint and per-platform gate metadata,
 * uploads the bundle (and assets) to staged S3 slots, then opens a staged
 * build. The server-side gate decides whether the staged run can proceed on
 * the fast path; when it can't it refuses with a machine-parseable
 * STAGED_GATE_REFUSAL payload that we translate into a named-diff message plus
 * the test:standard fallback line.
 *
 * Upload-slot decision: staged runs use getStagedUploadUrls (NOT
 * getBuildUploadUrls) - a bundled run has no native binary, so the per-platform
 * config carries the ASYNC_UPLOAD_S3_KEY_PLACEHOLDER for `s3Key` (mirrored
 * server-side) alongside the real jsBundleS3Key / assetsS3Key.
 */
import sdkClient from '@sherlo/sdk-client';
import { GateMetadata, GateMetadataByPlatform, Platform } from '@sherlo/api-types';
import { ASYNC_UPLOAD_S3_KEY_PLACEHOLDER } from '@sherlo/shared';
import chalk from 'chalk';
import path from 'path';
import { Options } from '../../types';
import {
  getAppBuildUrl,
  getBuildRunConfig,
  getGitInfo,
  getPlatformsToTest,
  getTokenParts,
  getValidatedCommandParams,
  handleClientError,
  logWarning,
  printResultsUrl,
  printSherloIntro,
  reporting,
  waitForBuildResult,
} from '../../helpers';
import { computeBaseFingerprint, type GateMetadataInput } from '../../helpers/fingerprint';
import { THIS_COMMAND } from './constants';
import { buildBundleForPlatform, buildGateMetadata, type BundleResult } from './buildBundle';
import { parseStagedGateRefusal, FALLBACK_LINE, type StagedGateRefusal } from './stagedGateRefusal';
import { getOnStaleMode, handleStaleBase } from './onStale';
import uploadStagedArtifacts, { type StagedUploadKeys } from './uploadStagedArtifacts';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function testBundled(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  printSherloIntro();

  // 1. Validate params (no platform binary paths required - bundle only).
  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: false }
  );

  // Resolve --on-stale up front so an invalid value fails before any work.
  const onStale = getOnStaleMode(passedOptions);

  // Determine which platforms have devices configured.
  const platformsToTest = getPlatformsToTest(commandParams.devices);
  if (platformsToTest.length === 0) {
    console.log(
      chalk.yellow(
        'No devices configured. Add devices in sherlo.config.json to test on specific platforms.'
      )
    );
    await reporting.flush().finally(() => process.exit(1));
  }

  console.log(chalk.bold('\n📦 Bundling for staged upload...\n'));

  // 2. Compute base fingerprint - identifies which base binary to stage against.
  //    A null hash means the staged flow is unavailable for this project.
  const fpResult = await computeBaseFingerprint(commandParams.projectRoot);
  if (!fpResult.hash) {
    console.log(
      chalk.red(
        'Staged upload unavailable - ' + (fpResult.debugMessage ?? 'fingerprint computation failed')
      )
    );
    console.log(chalk.yellow(FALLBACK_LINE));
    await reporting.flush().finally(() => process.exit(1));
  }
  const baseFingerprint = fpResult.hash!;

  // 3. Build bundle + assets and construct gate metadata for each platform.
  const bundles: Partial<Record<Platform, BundleResult>> = {};
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};

  for (const platform of platformsToTest) {
    const emoji = platform === 'android' ? '🤖' : '🍎';
    console.log(chalk.cyan(`\n${emoji} Building ${platform} bundle...`));

    try {
      const result = await buildBundleForPlatform({
        projectRoot: commandParams.projectRoot,
        platform,
      });
      bundles[platform] = result;

      console.log(
        chalk.green(`  ✓ Bundle: ${path.basename(result.bundlePath)}`) +
          ` (${result.bundleSizeMb} MB, ${result.bundleFormat}, ${result.bundler})`
      );
      if (result.assetsDest) {
        console.log(chalk.green(`  ✓ Assets: ${result.assetInventory.length} files`));
      }

      gateMetadata[platform] = await buildGateMetadata({
        projectRoot: commandParams.projectRoot,
        platform,
        bundleResult: result,
      });
    } catch (err) {
      // buildBundleForPlatform throws user-facing messages that already include
      // the test:standard fallback line.
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`\n  ✗ ${message}`));
      await reporting.flush().finally(() => process.exit(1));
    }
  }

  // 4. Resolve token + SDK client.
  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  // 4.5 Staged gate check (SHERLO-1718): decide fast vs stale BEFORE uploading.
  //     checkStagedGate is per platform; a non-fast outcome on any platform
  //     means the base is stale, so --on-stale decides what happens next (fail
  //     with the diff, or rebuild + full run). Tests are never silently skipped.
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling checkStagedGate API',
    data: { teamId, projectIndex, platforms: platformsToTest },
    level: 'info',
  });

  const staleRefusals: StagedGateRefusal[] = [];
  try {
    for (const platform of platformsToTest) {
      const { outcome, diff } = await client.checkStagedGate({
        baseFingerprint,
        gateMetadata: (gateMetadata[platform] ?? {}) as GateMetadata,
        platform,
        projectIndex,
        teamId,
      });

      if (outcome !== 'fast') {
        staleRefusals.push({ outcome, platform, diff });
      }
    }
  } catch (error) {
    handleClientError(error); // always throws (bad token, network, ...)
    throw error; // unreachable - satisfies control flow / typing
  }

  if (staleRefusals.length > 0) {
    return handleStaleBase({ onStale, refusals: staleRefusals, commandParams, passedOptions });
  }

  // 5. Request staged upload slots (getStagedUploadUrls - NOT getBuildUploadUrls).
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling getStagedUploadUrls API',
    data: { teamId, projectIndex, platforms: platformsToTest },
    level: 'info',
  });

  const { stagedPresignedUploadUrls } = await client
    .getStagedUploadUrls({ platforms: platformsToTest, projectIndex, teamId })
    .catch(handleClientError);

  // 6. Upload the bundle (+ assets) for each platform and collect its S3 keys.
  const stagedKeys: Partial<Record<Platform, StagedUploadKeys>> = {};

  for (const platform of platformsToTest) {
    const urls = stagedPresignedUploadUrls[platform];
    const bundleResult = bundles[platform];

    if (!urls || !bundleResult) {
      console.log(chalk.red(`\nStaged upload slot missing for ${platform}.`));
      console.log(chalk.yellow(FALLBACK_LINE));
      await reporting.flush().finally(() => process.exit(1));
      return { url: '' }; // unreachable - satisfies control flow when exit is stubbed
    }

    console.log(chalk.cyan(`\n⬆️  Uploading ${platform} bundle...`));
    stagedKeys[platform] = await uploadStagedArtifacts({ platform, bundleResult, urls });
  }

  // 7. Capture git info - IDENTICAL to test:standard (same helper, same override).
  const gitInfo = await getGitInfo(commandParams.projectRoot, {
    branchOverride: commandParams.gitBranch,
  });

  // 8. Build the run config and mirror the staged S3 keys / bundle size onto each
  //    platform. getBuildRunConfig already sets `s3Key` to the async-upload
  //    placeholder (no binary S3 keys passed); the server mirrors it back.
  const buildRunConfig = getBuildRunConfig({ commandParams });

  for (const platform of platformsToTest) {
    const platformConfig = buildRunConfig[platform];
    const keys = stagedKeys[platform];
    const bundleResult = bundles[platform];
    if (!platformConfig || !keys || !bundleResult) continue;

    platformConfig.s3Key = ASYNC_UPLOAD_S3_KEY_PLACEHOLDER;
    platformConfig.jsBundleS3Key = keys.jsBundleS3Key;
    platformConfig.bundleSizeMb = bundleResult.bundleSizeMb;
    if (keys.assetsS3Key) {
      platformConfig.assetsS3Key = keys.assetsS3Key;
    }
  }

  // 9. Open the staged build. The server gate may refuse with a
  //    STAGED_GATE_REFUSAL payload we translate for the user.
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling openBuild API (staged)',
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
      baseFingerprint,
      gateMetadata: gateMetadata as GateMetadataByPlatform,
    });
  } catch (error) {
    // Safety net: the server gate may still refuse at openBuild even though the
    // upfront checkStagedGate said fast (e.g. a base registered between calls).
    // Route it through the SAME --on-stale handler so behavior stays consistent.
    const refusal = parseStagedGateRefusal(error);
    if (refusal) {
      return handleStaleBase({ onStale, refusals: [refusal], commandParams, passedOptions });
    }
    handleClientError(error); // always throws
    throw error; // unreachable - satisfies control flow / typing
  }

  const { build } = openBuildReturn;
  const buildIndex = build.index;
  // Sentry tags must be strings; buildIndex is a number from the API response.
  reporting.setTag('build_index', String(buildIndex));
  reporting.setTag('platform', platformsToTest.length === 2 ? 'both' : platformsToTest[0]);

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  printResultsUrl(url);

  if (commandParams.wait) {
    const exitCode = await waitForBuildResult({
      token: commandParams.token,
      buildIndex,
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

export default testBundled;

/* ========================================================================== */

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
