/**
 * The STAGED ROAD of `sherlo test` - the JS-only fast path, taken when the
 * command is given no native build paths (see ./test.ts for the routing).
 *
 * It asks ONE question first: can this commit be tested without a native
 * rebuild? The gate answers from the source fingerprint alone, BEFORE anything
 * is built. On "no" the road stops right there - nothing is bundled, nothing is
 * uploaded, no test runs - and publishes `native-needed=true` so the caller can
 * route to its own native-build job (see ./nativeNeeded.ts).
 *
 * On "yes" it builds a production plain-JS bundle + assets via the project's
 * canonical bundler, re-asks the gate with the REAL bundle-derived identity
 * (the fingerprint probe cannot know the engine class, bundle format or asset
 * inventory without bundling), uploads the bundle to staged S3 slots, and opens
 * a staged build. The server-side gate may still refuse at openBuild with a
 * machine-parseable STAGED_GATE_REFUSAL payload; that is the same answer,
 * arriving later, and is published the same way.
 *
 * --dry-run (SHERLO-1895 Phase C) short-circuits before the gate: it produces
 * the manifest via the SAME real bundling path, previews the server's read-only
 * Diff Scope decision (which stories a real run would capture), and STOPS - no
 * gate check, no upload, no build, no routing output. See ./dryRun.
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
  describeDiffSources,
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
  throwError,
  waitForBuildResult,
} from '../../helpers';
import printLink from '../../helpers/printLink';
import printOutputKeys from '../../helpers/printOutputKeys';
import {
  isServerBypassed,
  fetchServerBypassReason,
  printServerBypassCloser,
} from '../../helpers/waitForBuildResult';
import { computeBaseFingerprint, type GateMetadataInput } from '../../helpers/fingerprint';
import { THIS_COMMAND } from './constants';
import { buildBundleForPlatform, buildGateMetadata, type BundleResult } from './buildBundle';
import {
  formatStagedGateRefusal,
  parseStagedGateRefusal,
  FALLBACK_LINE,
  type StagedGateRefusal,
} from './stagedGateRefusal';
import reportNativeNeeded, { reportFastPathRunning } from './nativeNeeded';
import uploadStagedArtifacts, { type StagedUploadKeys } from './uploadStagedArtifacts';
import { runDryRunPreview } from './dryRun';
import { runEmitExpectation } from './emitExpectation';
import { countBundleStories } from './readModuleManifest';
import { formatDiffScopeReport, type DiffScopePlatformReport } from './diffScopeReport';

/**
 * The ONLY gate metadata the pre-bundle probe may send: the `none` derivation
 * marker, and nothing else. Nothing has been built at that point, so the probe
 * must not fabricate a single binary-identity dimension it cannot know without
 * opening an APK. SHERLO-1761 excludes none-marked dimensions from the identity
 * diff, so the gate rests this decision on the fingerprint match alone.
 */
const PROBE_GATE_METADATA: GateMetadataInput = { derivedFrom: 'none' };

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

async function stagedRun(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  printSherloIntro();

  // --emit-expectation (expectation-emit mode): rides the --dry-run path rather
  // than a parallel print path. Runs before command params are even validated -
  // the mode builds its own synthetic, scenario-specific input for the guard it
  // exercises, so it needs none of this invocation's real options. See
  // ./emitExpectation for the scenario catalogue and placeholder vocabulary.
  if (passedOptions.emitExpectation !== undefined) {
    if (passedOptions.dryRun !== true) {
      throwError({
        message: '--emit-expectation requires --dry-run',
      });
    }
    runEmitExpectation(passedOptions.emitExpectation);
    return { url: '' }; // unreachable - runEmitExpectation always exits the process
  }

  // 1. Validate params (no platform binary paths required - bundle only).
  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: false }
  );

  // --dry-run (SHERLO-1895 Phase C): bundle + produce the manifest exactly as a
  // normal run, then preview the server's Diff Scope decision and STOP. Resolved
  // here so the branch below is unmistakable; the bundling path is identical.
  const isDryRun = passedOptions.dryRun === true;

  // 2. Determine which platforms have devices configured. Unreachable in
  //    practice - validateDevices above already refuses an empty/unknown device
  //    list - but a misconfiguration is a TOOL ERROR, not a routing outcome: it
  //    exits without writing any `native-needed` key, because building natively
  //    would not make this project testable either.
  const platformsToTest = getPlatformsToTest(commandParams.devices);
  if (platformsToTest.length === 0) {
    console.log(
      chalk.yellow(
        'No devices configured. Add devices in sherlo.config.json to test on specific platforms.'
      )
    );
    await reporting.flush().finally(() => process.exit(1));
  }

  // 3. Compute the base fingerprint - identifies which base binary to stage
  //    against. A null hash means this project has no staged fast path to take,
  //    which IS a routing answer: a native build is needed.
  //    A dry run does NOT stage a binary, so a missing fingerprint is a
  //    staged-only concern that must not stop the preview - it bails open
  //    downstream (a real run would capture everything) rather than routing.
  const fpResult = await computeBaseFingerprint(commandParams.projectRoot, {
    command: THIS_COMMAND,
  });
  if (!fpResult.hash && !isDryRun) {
    return reportNativeNeeded({
      reason: fpResult.debugMessage ?? 'the base fingerprint could not be computed',
    });
  }
  const baseFingerprint = fpResult.hash ?? '';

  // 4. Resolve token + SDK client.
  const { apiToken, projectIndex, teamId } = getTokenParts(commandParams.token);
  const client = sdkClient({ authToken: apiToken });

  // 5-dry. --dry-run (SHERLO-1895 Phase C): bundle for real, preview which
  //   stories a real run would capture, and STOP here. A dry run never runs the
  //   staged gate, uploads nothing, opens no build, and advances no ancestry -
  //   so it also works with the Diff Scope flag OFF, and publishes no routing
  //   output (it decided nothing to route on). Bail-open lives inside
  //   runDryRunPreview; it prints a preview even when the decision is unsure.
  if (isDryRun) {
    console.log(chalk.bold('\n📦 Bundling for dry-run preview...\n'));

    const bundles = await buildBundles({ projectRoot: commandParams.projectRoot, platformsToTest });

    // Reuse the SAME git info openBuild is given (step 10 below) - the read-only
    // decision query takes the identical GitInfoInput; do not build a second one.
    const gitInfo = await getGitInfo(commandParams.projectRoot, {
      branchOverride: commandParams.gitBranch,
    });
    await runDryRunPreview({
      client,
      bundles: bundles.results,
      platformsToTest,
      projectIndex,
      teamId,
      gitInfo,
      baseReference: baseFingerprint,
    });
    return { url: '' };
  }

  // 6. THE ROUTING GATE, before anything is built (SHERLO-1692). The fingerprint
  //    alone answers "can this commit reuse the registered base?", so a commit
  //    that needs a native build costs a single API call and no bundler run.
  const probeRefusals = await checkGate({
    client,
    platformsToTest,
    baseFingerprint,
    gateMetadata: () => PROBE_GATE_METADATA,
    projectIndex,
    teamId,
  });

  if (probeRefusals.length > 0) {
    return reportNativeNeeded({
      reason: describeRefusals(probeRefusals),
      details: probeRefusals.map(formatStagedGateRefusal),
      baseFingerprint,
    });
  }

  // 7. Build bundle + assets and construct gate metadata for each platform.
  console.log(chalk.bold('\n📦 Bundling for staged upload...\n'));

  const { results: bundles, gateMetadata } = await buildBundles({
    projectRoot: commandParams.projectRoot,
    platformsToTest,
  });

  // 8. Re-ask the gate with the REAL bundle-derived identity. Step 6 could only
  //    compare fingerprints; only a built bundle carries the engine class,
  //    bundle format, asset inventory and SDK protocol version the gate diffs.
  //    A refusal here is the same routing answer, just better informed.
  const identityRefusals = await checkGate({
    client,
    platformsToTest,
    baseFingerprint,
    // Unreachable fallback: buildBundles fills every tested platform or exits.
    // If it ever were empty, the marker is the honest thing to send - "I know
    // nothing about this bundle's identity" - never a fabricated dimension.
    gateMetadata: (platform) => gateMetadata[platform] ?? PROBE_GATE_METADATA,
    projectIndex,
    teamId,
  });

  if (identityRefusals.length > 0) {
    return reportNativeNeeded({
      reason: describeRefusals(identityRefusals),
      details: identityRefusals.map(formatStagedGateRefusal),
      baseFingerprint,
    });
  }

  // 9. Request staged upload slots (getStagedUploadUrls - NOT getBuildUploadUrls).
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling getStagedUploadUrls API',
    data: { teamId, projectIndex, platforms: platformsToTest },
    level: 'info',
  });

  const { stagedPresignedUploadUrls } = await client
    .getStagedUploadUrls({ platforms: platformsToTest, projectIndex, teamId })
    .catch(handleClientError);

  // 10. Upload the bundle (+ assets) for each platform and collect its S3 keys.
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

  // 11. Capture git info - IDENTICAL to the standard road (same helper, same override).
  const gitInfo = await getGitInfo(commandParams.projectRoot, {
    branchOverride: commandParams.gitBranch,
  });

  // 12. Build the run config and mirror the staged S3 keys / bundle size onto each
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

  // 13. Open the staged build. The server gate may refuse with a
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
    // checks above said fast (e.g. a base registered between calls). It is the
    // SAME routing answer, so it is published the SAME way.
    const refusal = parseStagedGateRefusal(error);
    if (refusal) {
      return reportNativeNeeded({
        reason: describeRefusals([refusal]),
        details: [formatStagedGateRefusal(refusal)],
        baseFingerprint,
      });
    }
    handleClientError(error); // always throws
    throw error; // unreachable - satisfies control flow / typing
  }

  // 14. The fast path is committed: this commit is being tested with no native
  //     rebuild. Publish that answer before the run's own output.
  reportFastPathRunning({ baseFingerprint });

  const { build } = openBuildReturn;
  const buildIndex = build.index;
  // Sentry tags must be strings; buildIndex is a number from the API response.
  reporting.setTag('build_index', String(buildIndex));
  reporting.setTag('platform', platformsToTest.length === 2 ? 'both' : platformsToTest[0]);

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  // The API may close the build itself, without ever running it on a device
  // (SHERLO-1959), when every story's screenshot can be inherited from the
  // previous build. Detected off the openBuild COUNTS (the per-platform prose
  // reason is not selected by BuildFragment, so it is unavailable here). Such a
  // build has nothing to review and the review page cannot render its shape yet
  // (SHERLO-1974), so - in BOTH modes - we withhold the review/build URL and
  // print the compact bypassed closer instead (SHERLO-1952).
  const serverBypassed = isServerBypassed(openBuildReturn.build.diffScopeInfo);

  // The command EXPLAINS its own capture plan (SHERLO-1919): which stories this
  // run is capturing, which it is reusing from the previous build, and why - read
  // straight off the openBuild response, no extra API call - then closes with the
  // Review URL LAST (SHERLO-1937: no "Build created" line - the URL IS the
  // ending). Prints no plan block for a platform the server made no decision for
  // (Diff Scope off, or older API), but always closes with the URL so the link
  // never disappears - UNLESS the build was server-bypassed, whose compact closer
  // is printed below instead (by the --wait poll, or the non-wait branch).
  printCapturePlanAndCloser({ openBuildReturn, bundles, platformsToTest, url, serverBypassed });

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
    // Non-wait bypassed build: --wait is not printing the closer, so fetch the
    // server's verbatim reason with a single getBuildStatus read and print the
    // compact closer here (SHERLO-1952). Best-effort - see printBypassedCloser.
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

export default stagedRun;

/* ========================================================================== */

/**
 * Ask the staged gate about every platform and return the ones that answered
 * anything other than "fast". checkStagedGate is per platform, and a single
 * non-fast platform takes the whole run off the fast path.
 *
 * `gateMetadata` is a per-platform lookup rather than a value because the two
 * callers know DIFFERENT things: the pre-bundle probe knows only that it knows
 * nothing ({@link PROBE_GATE_METADATA}), while the post-bundle check carries the
 * real bundle-derived identity.
 */
async function checkGate({
  client,
  platformsToTest,
  baseFingerprint,
  gateMetadata,
  projectIndex,
  teamId,
}: {
  client: ReturnType<typeof sdkClient>;
  platformsToTest: Platform[];
  baseFingerprint: string;
  gateMetadata: (platform: Platform) => GateMetadataInput;
  projectIndex: number;
  teamId: string;
}): Promise<StagedGateRefusal[]> {
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling checkStagedGate API',
    data: { teamId, projectIndex, platforms: platformsToTest },
    level: 'info',
  });

  const refusals: StagedGateRefusal[] = [];

  try {
    for (const platform of platformsToTest) {
      const { outcome, diff } = await client.checkStagedGate({
        baseFingerprint,
        gateMetadata: gateMetadata(platform) as GateMetadata,
        platform,
        projectIndex,
        teamId,
      });

      if (outcome !== 'fast') {
        refusals.push({ outcome, platform, diff });
      }
    }
  } catch (error) {
    handleClientError(error); // always throws (bad token, network, ...)
    throw error; // unreachable - satisfies control flow / typing
  }

  return refusals;
}

/** One single-line, platform-prefixed reason per refusal, joined for the output key. */
function describeRefusals(refusals: StagedGateRefusal[]): string {
  return refusals
    .map(({ platform, outcome, diff }) => {
      if (outcome === 'not-stageable') {
        return `${platform}: this project can't use the staged fast path`;
      }

      const named = describeDiffSources(diff);
      return named
        ? `${platform}: changed since the base build: ${named}`
        : `${platform}: native inputs changed since the base build`;
    })
    .join('; ');
}

/**
 * Build the production bundle + assets for every platform and, alongside each,
 * the REAL gate metadata derived from it. Both the dry run and the live run
 * bundle through this exact path, so a preview can never diverge from the run
 * it is previewing.
 *
 * A bundling failure is user-facing and already carries the fallback line, so it
 * is printed and exits here rather than propagating as a crash.
 */
async function buildBundles({
  projectRoot,
  platformsToTest,
}: {
  projectRoot: string;
  platformsToTest: Platform[];
}): Promise<{
  results: Partial<Record<Platform, BundleResult>>;
  gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput };
}> {
  const results: Partial<Record<Platform, BundleResult>> = {};
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};

  for (const platform of platformsToTest) {
    const emoji = platform === 'android' ? '🤖' : '🍎';
    console.log(chalk.cyan(`\n${emoji} Building ${platform} bundle...`));

    try {
      const result = await buildBundleForPlatform({ projectRoot, platform });
      results[platform] = result;

      console.log(
        chalk.green(`  ✓ Bundle: ${path.basename(result.bundlePath)}`) +
          ` (${result.bundleSizeMb} MB, ${result.bundleFormat}, ${result.bundler})`
      );
      if (result.assetsDest) {
        console.log(chalk.green(`  ✓ Assets: ${result.assetInventory.length} files`));
      }

      gateMetadata[platform] = await buildGateMetadata({
        projectRoot,
        platform,
        bundleResult: result,
      });
    } catch (err) {
      // buildBundleForPlatform throws user-facing messages that already include
      // the fallback line.
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`\n  ✗ ${message}`));
      await reporting.flush().finally(() => process.exit(1));
    }
  }

  return { results, gateMetadata };
}

/**
 * Print this run's capture plan, per platform, straight off the openBuild
 * response (SHERLO-1919). No extra API call: `captureScope` carries the captured
 * set and `diffScopeInfo` carries the reason. Renders through the SAME shared
 * formatter the dry run uses, so the two modes read identically apart from the
 * capture verb. Then closes with the Review URL LAST - no "Build created" line
 * (SHERLO-1937 operator ruling: a live run's ending IS the Review URL).
 *
 * A platform the server made no decision for (no `captureScope`) is skipped
 * entirely - silence, never an invented "captured everything". If NO platform has
 * a decision, no plan block prints, but the URL still does so the developer
 * always gets their link.
 *
 * The one exception (SHERLO-1952): a server-bypassed build. There is nothing to
 * review and the review page cannot render this build shape yet (SHERLO-1974), so
 * the Review URL is withheld here in BOTH modes; the compact bypassed closer is
 * printed by the caller instead (the --wait poll, or the non-wait branch).
 */
function printCapturePlanAndCloser({
  openBuildReturn,
  bundles,
  platformsToTest,
  url,
  serverBypassed,
}: {
  openBuildReturn: Awaited<ReturnType<ReturnType<typeof sdkClient>['openBuild']>>;
  bundles: Partial<Record<Platform, BundleResult>>;
  platformsToTest: Platform[];
  url: string;
  serverBypassed: boolean;
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

  // A server-bypassed build has its compact closer printed by the caller (the
  // --wait poll, or the non-wait branch), never a Review URL - the review page
  // cannot render this build shape yet (SHERLO-1952/1974). Withhold the URL here
  // in both modes.
  if (serverBypassed) {
    return;
  }

  // The closer, LAST (SHERLO-1919 ordering). A live run has no "Build created"
  // line (SHERLO-1937 operator ruling) - the Review URL IS the ending. The
  // machine-readable `url=` line goes just above it, so a CI can republish the
  // link the developer is reading (a server-bypassed build returns above without
  // either one - there is no review to link to).
  console.log();
  printOutputKeys({ url });

  console.log(`\n🔗 Review: ${printLink(url)}`);
}

/**
 * Non-wait closer for a server-bypassed build (SHERLO-1952). Sources the server's
 * verbatim reason with a single getBuildStatus read (the build is already closed,
 * so it returns immediately - a read, not a wait) and prints the compact closer.
 *
 * Best-effort by ruling: if the reason cannot be fetched (network, auth, timeout,
 * older API with no per-platform prose), fall back to TODAY's full output - the
 * Review URL - rather than a closer with nothing after the dash. A working link
 * beats silence, and a build that succeeded is never reported failed over this
 * cosmetic query (fetchServerBypassReason swallows every error).
 */
async function printBypassedCloser({
  token,
  buildIndex,
  projectIndex,
  teamId,
  url,
}: {
  token: string;
  buildIndex: number;
  projectIndex: number;
  teamId: string;
  url: string;
}): Promise<void> {
  const reason = await fetchServerBypassReason({ token, buildIndex, projectIndex, teamId });

  if (reason) {
    console.log();
    printServerBypassCloser(reason);
  } else {
    console.log(`\n🔗 Review: ${printLink(url)}`);
  }
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
