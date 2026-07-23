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
 * --dry-run (SHERLO-1895 Phase C) short-circuits after bundling: it produces the
 * manifest via the SAME real bundling path, previews the server's read-only Diff
 * Scope decision (which stories a real run would capture), and STOPS - no gate
 * check, no upload, no build. See ./dryRun.
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
  printSherloIntro,
  reporting,
  waitForBuildResult,
} from '../../helpers';
import printLink from '../../helpers/printLink';
import { computeBaseFingerprint, type GateMetadataInput } from '../../helpers/fingerprint';
import { THIS_COMMAND } from './constants';
import { buildBundleForPlatform, buildGateMetadata, type BundleResult } from './buildBundle';
import { parseStagedGateRefusal, FALLBACK_LINE, type StagedGateRefusal } from './stagedGateRefusal';
import { getOnStaleMode, handleStaleBase } from './onStale';
import uploadStagedArtifacts, { type StagedUploadKeys } from './uploadStagedArtifacts';
import { runDryRunPreview } from './dryRun';
import { countBundleStories } from './readModuleManifest';
import { SEPARATOR, formatDiffScopeReport, type DiffScopePlatformReport } from './diffScopeReport';

/**
 * The per-platform staged build config plus the SHERLO-1894 `manifestS3Key` the api
 * department is adding to the openBuild `buildRunConfig` in parallel. Optional and
 * local because the published @sherlo/api-types config type this repo typechecks
 * against does not carry it yet - the same dev-stage skew the `manifest` upload slot
 * has. Mirrors the existing `GateMetadataInput` pattern (CLI owns its wire shape,
 * bridged at the API boundary) rather than casting to `any`. Drop this once api-types
 * republishes with the field.
 */
type PlatformConfigWithManifest = { manifestS3Key?: string };

/**
 * The per-platform Diff Scope decision the server records at openBuild, read
 * forward-compatibly off the openBuild response (SHERLO-1915). Two fields are
 * involved and BOTH are declared locally + read defensively, the same pattern as
 * {@link PlatformConfigWithManifest} and the optional `computeDiffScopeDryRun`
 * method - the published @sherlo/api-types this repo typechecks against does not
 * carry them yet, so a cast to `any` is avoided in favour of a precise local
 * extension. Absent at runtime -> the live report degrades cleanly (see below).
 *
 * - `captureScope` on the per-platform buildRun config: the captured set this
 *   run selected. `full: true` means EVERY story was in scope (an empty
 *   `storyFilePaths` in that case means "everything", not "nothing"). Absent for
 *   a platform -> the report says NOTHING about it (the server made no decision).
 * - `diffScopeInfo.platforms[platform].reason`: the path-legible closure-diff
 *   string, byte-identical to the dashboard's. The api department selects this in
 *   a parallel PR; until it lands the field is absent and the reason ladder falls
 *   through to `fullCaptureTriggerReason` or omits the reason entirely.
 */
type CaptureScope = { full: boolean; storyFilePaths?: string[] };
type PlatformConfigWithCaptureScope = { captureScope?: CaptureScope };
type DiffScopeInfoWithPlatformReasons = {
  fullCaptureTriggerReason?: string;
  platforms?: Partial<Record<Platform, { reason?: string }>>;
};

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

  // --dry-run (SHERLO-1895 Phase C): bundle + produce the manifest exactly as a
  // normal run, then preview the server's Diff Scope decision and STOP. Resolved
  // here so the branch below is unmistakable; the bundling path is identical.
  const isDryRun = passedOptions.dryRun === true;

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

  console.log(
    chalk.bold(
      isDryRun ? '\n📦 Bundling for dry-run preview...\n' : '\n📦 Bundling for staged upload...\n'
    )
  );

  // 2. Compute base fingerprint - identifies which base binary to stage against.
  //    A null hash means the staged flow is unavailable for this project.
  //    A dry run does NOT stage a binary, so a missing fingerprint is a
  //    staged-only concern that must not hard-fail the preview - it bails open
  //    downstream (a real run would capture everything) rather than exiting here.
  const fpResult = await computeBaseFingerprint(commandParams.projectRoot, {
    command: THIS_COMMAND,
  });
  if (!fpResult.hash && !isDryRun) {
    console.log(
      chalk.red(
        'Staged upload unavailable - ' + (fpResult.debugMessage ?? 'fingerprint computation failed')
      )
    );
    console.log(chalk.yellow(FALLBACK_LINE));
    await reporting.flush().finally(() => process.exit(1));
  }
  const baseFingerprint = fpResult.hash ?? '';

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

  // 4-dry. --dry-run (SHERLO-1895 Phase C): we now have the REAL bundle + manifest
  //   for every platform and an SDK client. Preview which stories a real run would
  //   capture via the read-only decision query, print it, and STOP here. A dry run
  //   never runs the staged gate, uploads nothing, opens no build, and advances no
  //   ancestry - so it also works with the Diff Scope flag OFF. Bail-open lives
  //   inside runDryRunPreview; it prints a preview even when the decision is unsure.
  if (isDryRun) {
    // Reuse the SAME git info openBuild is given (step 7 below) - the read-only
    // decision query takes the identical GitInfoInput; do not build a second one.
    const gitInfo = await getGitInfo(commandParams.projectRoot, {
      branchOverride: commandParams.gitBranch,
    });
    await runDryRunPreview({
      client,
      bundles,
      platformsToTest,
      projectIndex,
      teamId,
      gitInfo,
      baseReference: baseFingerprint,
    });
    return { url: '' };
  }

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
    // Mirror the manifest S3 key when a manifest was uploaded (SHERLO-1894). Only set
    // when present, so old-API runs (no manifest slot -> no key) send nothing extra.
    // `manifestS3Key` is a forward-compat field the published api-types config type
    // does not carry yet; see PlatformConfigWithManifest.
    if (keys.manifestS3Key) {
      (platformConfig as PlatformConfigWithManifest).manifestS3Key = keys.manifestS3Key;
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

  // The command EXPLAINS its own capture plan (SHERLO-1919): which stories this
  // run is capturing, which it is reusing from the previous build, and why - read
  // straight off the openBuild response, no extra API call - then closes with
  // "✓ Build created" and the Review URL LAST. Prints no plan block for a platform
  // the server made no decision for (Diff Scope off, or older API), but always
  // closes with the build-created line + URL so the link never disappears.
  printCapturePlanAndCloser({ openBuildReturn, bundles, platformsToTest, url });

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

/**
 * Print this run's capture plan, per platform, straight off the openBuild
 * response (SHERLO-1919). No extra API call: `captureScope` carries the captured
 * set and `diffScopeInfo` carries the reason. Renders through the SAME shared
 * formatter the dry run uses, so the two modes read identically apart from the
 * capture verb. Then closes with "✓ Build created" (dim " - running on devices"
 * when at least one platform captured a story) and the Review URL LAST.
 *
 * A platform the server made no decision for (no `captureScope`) is skipped
 * entirely - silence, never an invented "captured everything". If NO platform has
 * a decision, no plan block prints, but the build-created line + URL still do so
 * the developer always gets their link.
 */
function printCapturePlanAndCloser({
  openBuildReturn,
  bundles,
  platformsToTest,
  url,
}: {
  openBuildReturn: Awaited<ReturnType<ReturnType<typeof sdkClient>['openBuild']>>;
  bundles: Partial<Record<Platform, BundleResult>>;
  platformsToTest: Platform[];
  url: string;
}): void {
  const diffScopeInfo = openBuildReturn.build.diffScopeInfo as
    | DiffScopeInfoWithPlatformReasons
    | undefined;

  const platforms: DiffScopePlatformReport[] = [];
  for (const platform of platformsToTest) {
    const platformConfig = openBuildReturn.buildRun?.config?.[platform] as
      | PlatformConfigWithCaptureScope
      | undefined;
    const captureScope = platformConfig?.captureScope;

    // No decision recorded for this platform -> stay silent. Asserting "captured
    // everything" here would claim a decision the server never made.
    if (!captureScope) continue;

    const manifest = bundles[platform]?.moduleManifest;
    platforms.push({
      kind: 'decided',
      platform,
      // INVERSION GUARD: full === true is "every story", regardless of the list.
      full: captureScope.full,
      // A full capture selects everything; its per-story list is not meaningful.
      capturedStoryFilePaths: captureScope.full ? [] : captureScope.storyFilePaths ?? [],
      // M is the whole bundle's story set, counted the ONE canonical way.
      totalStoriesInBundle: manifest ? countBundleStories(manifest) : undefined,
      reason: resolveLiveReason({ platform, full: captureScope.full, diffScopeInfo }),
    });
  }

  if (platforms.length > 0) {
    console.log('\n' + formatDiffScopeReport('live', platforms));
  }

  // The closer, LAST (SHERLO-1919 ordering). "- running on devices" is shown when
  // at least one platform is capturing a story; a run that reuses everything on
  // every platform gets the plain "✓ Build created". With no plan at all (Diff
  // Scope off) the build still runs on devices, so keep the suffix.
  const somethingCaptured = platforms.length === 0 || platforms.some(platformCapturesAStory);
  const runningSuffix = somethingCaptured ? chalk.dim(` ${SEPARATOR} running on devices`) : '';
  console.log('\n' + chalk.green('✓') + chalk.bold(' Build created') + runningSuffix);
  console.log(`🔗 Review: ${printLink(url)}`);
}

/** True when this platform is capturing at least one story (full, or a partial > 0). */
function platformCapturesAStory(block: DiffScopePlatformReport): boolean {
  return block.full || block.capturedStoryFilePaths.length > 0;
}

/**
 * The reason ladder, in strict order (SHERLO-1915). The reason is byte-identical
 * to the persisted server decision or absent - never CLI-invented:
 *   1. the per-platform closure-diff reason, when present -> verbatim;
 *   2. else, on a FULL capture only, the build-wide fullCaptureTriggerReason;
 *   3. else -> omitted.
 */
function resolveLiveReason({
  platform,
  full,
  diffScopeInfo,
}: {
  platform: Platform;
  full: boolean;
  diffScopeInfo: DiffScopeInfoWithPlatformReasons | undefined;
}): string | undefined {
  const perPlatformReason = diffScopeInfo?.platforms?.[platform]?.reason;
  if (perPlatformReason) return perPlatformReason;

  if (full && diffScopeInfo?.fullCaptureTriggerReason) {
    return diffScopeInfo.fullCaptureTriggerReason;
  }

  return undefined;
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
