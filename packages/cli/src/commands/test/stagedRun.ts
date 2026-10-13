/**
 * The STAGED ROAD of `sherlo test` - the JS-only fast path, taken when the
 * command is given no native build paths (see ./test.ts for the routing).
 *
 * It asks ONE question first: can this commit be tested without a native
 * rebuild? The gate answers from the source fingerprint alone, BEFORE anything
 * is built. On "no" the tool builds the refused platforms itself and pushes
 * them (./appBuild/buildThenPush.ts); nothing is bundled for the staged road.
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
import { GateMetadata, GateMetadataByPlatform, Platform } from '@sherlo/api-types';
import { ASYNC_UPLOAD_S3_KEY_PLACEHOLDER } from '@sherlo/shared';
import chalk from 'chalk';
import { Config, Options } from '../../types';
import {
  getAppBuildUrl,
  getBuildRunConfig,
  getGitInfo,
  getPlatformsToTest,
  getValidatedCommandParams,
  handleClientError,
  reporting,
  throwError,
} from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { isServerBypassed } from '../../helpers/waitForBuildResult';
import { computeBaseFingerprint, type GateMetadataInput } from '../../helpers/fingerprint';
import { closeTheRun } from './closeTheRun';
import { THIS_COMMAND } from './constants';
import type { BundleResult } from './buildBundle';
import {
  parseStagedGateRefusal,
  FALLBACK_LINE,
  type StagedGateRefusal,
} from './stagedGateRefusal';
import reportNativeNeeded, { reportFastPathRunning } from './nativeNeeded';
import { buildThenPush, splitRunKeyOf } from './appBuild/buildThenPush';
import { joinTheRun } from './appBuild/joinTheRun';
import type { BuildFlags } from './appBuild/buildSettings';
import {
  applyBundleToPlatformConfig,
  realBundleUploadEffects,
  StagedSlotMissingError,
  uploadBundles,
} from './uploadBundles';
import type { StagedUploadKeys } from './uploadStagedArtifacts';
import { buildBundles, runDryRunFlow } from './bundleAndPreview';
import { emitBundleDir } from './emitBundleDir';
import { resolveBaseFingerprintForSuppliedBundle } from './recordedBaseFingerprint';
import { resolveSuppliedBundles } from './suppliedBundle';
import {
  bundleStoryFiles,
  countBundleStories,
  countStoriesIn,
  type ValidatedModuleManifest,
} from './readModuleManifest';
import { serverCalls, type OpenBuildAnswer } from '../../seams/serverCalls';
import type { PlatformRow } from '../../render/runRows';
import type { PlatformCapture } from '../../render/testSteps';
import { rowsAbove, printPlatformRowInALog } from './platformRows';

/**
 * The ONLY gate metadata the pre-bundle probe may send: the `none` derivation
 * marker, and nothing else. Nothing has been built at that point, so the probe
 * must not fabricate a single binary-identity dimension it cannot know without
 * opening an APK. SHERLO-1761 excludes none-marked dimensions from the identity
 * diff, so the gate rests this decision on the fingerprint match alone.
 */
const PROBE_GATE_METADATA: GateMetadataInput = { derivedFrom: 'none' };

/**
 * The per-platform Diff Scope decision the server records at openBuild, read
 * forward-compatibly off the openBuild response (SHERLO-1915). Two fields are
 * involved and BOTH are declared locally + read defensively, the same pattern as
 * the `manifestS3Key` bridge in ./uploadBundles and the optional
 * `computeDiffScopeDryRun` method - the published @sherlo/api-types this repo
 * typechecks against does not carry them yet, so a cast to `any` is avoided in
 * favour of a precise local extension. Absent at runtime -> the live report
 * degrades cleanly (see below).
 *
 * - `captureScope` on the per-platform buildRun config: the captured set this
 *   run selected. `full: true` means EVERY story was in scope (an empty
 *   `storyFilePaths` in that case means "everything", not "nothing"). Absent for
 *   a platform -> the report says NOTHING about it (the server made no decision).
 * - `diffScopeInfo.platforms[platform].reason`: the server's own prose, byte-identical
 *   to the dashboard's. Absent -> no reason is printed.
 */
type CaptureScope = {
  full: boolean;
  storyFilePaths?: string[];
  newStoryFilePaths?: string[];
  changedStoryFilePaths?: string[];
};
type PlatformConfigWithCaptureScope = { captureScope?: CaptureScope };
type DiffScopeInfoWithPlatformReasons = {
  platforms?: Partial<Record<Platform, { reason?: string }>>;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function stagedRun(passedOptions: Options<THIS_COMMAND>): Promise<{ url: string }> {
  // 1. Validate params (no platform binary paths required - bundle only).
  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: false }
  );

  // --dry-run (SHERLO-1895 Phase C): bundle + produce the manifest exactly as a
  // normal run, then preview the server's Diff Scope decision and STOP. Resolved
  // here so the branch below is unmistakable; the bundling path is identical.
  const isDryRun = passedOptions.dryRun === true;

  // The two bundle-supply roads. They are opposites and only one can run, so the
  // combination is refused rather than resolved by precedence - a caller who passed
  // both is asking for two different things and should be told, not guessed at.
  const bundleDir = passedOptions.bundleDir;
  const emitBundleDirPath = passedOptions.emitBundleDir;
  if (bundleDir !== undefined && emitBundleDirPath !== undefined) {
    throwError({
      message:
        '`--bundle-dir` accepts a prebuilt bundle and `--emit-bundle-dir` produces one, ' +
        'so they cannot be combined. Pass whichever one this run is doing.',
    });
  }

  // A dry run bundles for real - that is what makes its preview trustworthy - and
  // it does not read a supplied directory. Accepting `--bundle-dir` here would
  // bundle anyway and print a transcript claiming it had, which is the silent
  // fallback the supplied road exists to rule out. Refuse instead of lying.
  if (isDryRun && bundleDir !== undefined) {
    throwError({
      message:
        '`--dry-run` bundles for real to preview what a run would capture, so it cannot ' +
        'use `--bundle-dir`. Drop one of the two.',
    });
  }

  // Emitting is not a preview and a preview does not emit; running both would beg
  // the question of which one the exit code belongs to.
  if (isDryRun && emitBundleDirPath !== undefined) {
    throwError({
      message:
        '`--emit-bundle-dir` produces a bundle directory and exits, so it cannot be ' +
        'combined with `--dry-run`. Drop one of the two.',
    });
  }

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
  //    A run that supplies its bundle takes the fingerprint the bundle recorded
  //    when this tree's native inputs still match - the machine that accepts a
  //    bundle has no install to compute one with. See ./recordedBaseFingerprint.
  const fpResult =
    bundleDir !== undefined
      ? await resolveBaseFingerprintForSuppliedBundle({
          bundleDir,
          projectRoot: commandParams.projectRoot,
          platforms: platformsToTest,
          command: THIS_COMMAND,
        })
      : await computeBaseFingerprint(commandParams.projectRoot, { command: THIS_COMMAND });
  //    An emit run does not stage a binary either - it only writes a directory to
  //    disk - so like a dry run it must not route on a missing fingerprint.
  if (!fpResult.hash && !isDryRun && emitBundleDirPath === undefined) {
    return reportNativeNeeded({
      reason: fpResult.debugMessage ?? 'the base fingerprint could not be computed',
    });
  }
  const baseFingerprint = fpResult.hash ?? '';

  // 5-emit. --emit-bundle-dir: bundle for real, write the triple + sidecar, STOP.
  //   It runs before the routing gate on purpose - producing a bundle directory is
  //   not a test run and asks the server nothing, so it needs no token, opens no
  //   build, and publishes no routing output. See ./emitBundleDir.
  if (emitBundleDirPath !== undefined) {
    await emitBundleDir({
      projectRoot: commandParams.projectRoot,
      platformsToTest,
      bundleDir: emitBundleDirPath,
      baseFingerprint: fpResult,
    });
    return { url: '' };
  }

  // 4. The credential and its project, resolved before any request (getValidatedCommandParams).
  //    The endpoint every call this road makes - including the read-only dry-run decision
  //    query - is resolved inside the server seam itself (../../seams/serverCalls), from the
  //    token this road hands it.
  const { token, projectIndex, teamId } = commandParams.credential;

  // 5-dry. --dry-run (SHERLO-1895 Phase C): bundle for real, preview which
  //   stories a real run would capture, and STOP here. A dry run never runs the
  //   staged gate, uploads nothing, opens no build, and advances no ancestry -
  //   so it also works with the Diff Scope flag OFF, and publishes no routing
  //   output (it decided nothing to route on). Bail-open lives inside
  //   runDryRunPreview; it prints a preview even when the decision is unsure.
  if (isDryRun) {
    await runDryRunFlow({
      projectRoot: commandParams.projectRoot,
      platformsToTest,
      token,
      projectIndex,
      teamId,
      baseFingerprint,
      // Reuse the SAME git info openBuild is given (step 10 below) - the read-only
      // decision query takes the identical GitInfoInput; do not build a second one.
      resolveGitInfo: () =>
        getGitInfo(commandParams.projectRoot, { branchOverride: commandParams.gitBranch }),
      include: commandParams.include,
      exclude: commandParams.exclude,
    });
    return { url: '' };
  }

  /** A platform the gate refused needs a new app build, and the tool builds it itself. */
  const buildTheRefusedPlatforms = ({ refusals, storedBuildIndexOf }: GateAnswers): Promise<{ url: string }> =>
    buildThenPush({
      passedOptions,
      platformsToTest,
      refusals,
      storedBuildIndexOf,
      baseFingerprint,
      fingerprintPreimage: fpResult.preimage,
    });

  // 6. THE ROUTING GATE, before anything is built (SHERLO-1692). The fingerprint
  //    alone answers "can this commit reuse the registered base?", so a commit
  //    that needs a native build costs a single API call and no bundler run.
  const probeAnswers = await checkGate({
    token,
    platformsToTest,
    baseFingerprint,
    gateMetadata: () => PROBE_GATE_METADATA,
    projectIndex,
    teamId,
  });

  //    A refused platform needs a new app build, and the tool builds it itself (./appBuild).
  if (probeAnswers.refusals.length > 0) {
    return buildTheRefusedPlatforms(probeAnswers);
  }

  // 7. Get the bundle + assets for each platform, and construct gate metadata
  //    from it. Either the bundler produces them here, or the caller already
  //    produced them and `--bundle-dir` accepts them after checking they belong to
  //    this project. Both roads end at the SAME BundleResult, so nothing below
  //    this point knows or cares which one ran.
  let bundles: Partial<Record<Platform, BundleResult>>;
  let gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput };

  if (bundleDir !== undefined) {
    ({ results: bundles, gateMetadata } = await resolveSuppliedBundles({
      bundleDir,
      projectRoot: commandParams.projectRoot,
      platformsToTest,
      ...(baseFingerprint ? { baseFingerprint } : {}),
      // The source-derived metadata was derived beside the bundle, on the machine
      // that had the install to derive it; the acceptor verified the source it
      // came from, so it is sent as recorded.
      gateMetadataFor: async (_platform, _bundleResult, recorded) => recorded,
    }));
  } else {
    ({ results: bundles, gateMetadata } = await buildBundles({
      projectRoot: commandParams.projectRoot,
      platformsToTest,
    }));
  }

  // 8. Re-ask the gate with the REAL bundle-derived identity. Step 6 could only
  //    compare fingerprints; only a built bundle carries the engine class,
  //    bundle format, asset inventory and SDK protocol version the gate diffs.
  //    A refusal here is the same routing answer, just better informed.
  const identityAnswers = await checkGate({
    token,
    platformsToTest,
    baseFingerprint,
    // Unreachable fallback: buildBundles fills every tested platform or exits.
    // If it ever were empty, the marker is the honest thing to send - "I know
    // nothing about this bundle's identity" - never a fabricated dimension.
    gateMetadata: (platform) => gateMetadata[platform] ?? PROBE_GATE_METADATA,
    projectIndex,
    teamId,
  });

  if (identityAnswers.refusals.length > 0) {
    return buildTheRefusedPlatforms(identityAnswers);
  }

  //    Both checks said every platform takes its stored app build: each platform's row says which
  //    test it came from (./platformRows).
  const platformRows = platformsToTest.map((platform) =>
    printPlatformRowInALog({
      platform,
      appBuild: 'reused-from-test',
      testIndex: identityAnswers.storedBuildIndexOf[platform],
    })
  );

  // 9. Upload the bundle (+ assets) for each platform to staged slots
  //    (getStagedUploadUrls - NOT getBuildUploadUrls) and collect its S3 keys.
  //    The SAME upload step the standard road runs; see ./uploadBundles.
  let stagedKeys: Partial<Record<Platform, StagedUploadKeys>>;
  try {
    stagedKeys = await uploadBundles({
      platformsToTest,
      bundles,
      projectIndex,
      teamId,
      effects: realBundleUploadEffects(token),
    });
  } catch (error) {
    if (!(error instanceof StagedSlotMissingError)) throw error;

    console.log(chalk.red(`\n${error.message}`));
    console.log(chalk.yellow(FALLBACK_LINE));
    await reporting.flush().finally(() => process.exit(1));
    return { url: '' }; // unreachable - satisfies control flow when exit is stubbed
  }

  // 10. Capture git info - IDENTICAL to the standard road (same helper, same override).
  const gitInfo = await getGitInfo(commandParams.projectRoot, {
    branchOverride: commandParams.gitBranch,
  });

  // 11. Build the run config and put each platform's bundle on it. This road
  //     uploaded no binary, so `s3Key` carries the async-upload placeholder: the
  //     server mirrors it back and the runner splices the bundle into the
  //     registered base instead.
  const buildRunConfig = getBuildRunConfig({ commandParams });

  for (const platform of platformsToTest) {
    const platformConfig = buildRunConfig[platform];
    const keys = stagedKeys[platform];
    const bundleResult = bundles[platform];
    if (!platformConfig || !keys || !bundleResult) continue;

    platformConfig.s3Key = ASYNC_UPLOAD_S3_KEY_PLACEHOLDER;
    applyBundleToPlatformConfig({
      platformConfig,
      keys,
      bundleSizeMb: bundleResult.bundleSizeMb,
    });
  }

  // 12. Open the staged build. The server gate may refuse with a
  //    STAGED_GATE_REFUSAL payload we translate for the user.
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling openBuild API (staged)',
    data: { teamId, projectIndex, command: THIS_COMMAND },
    level: 'info',
  });

  // ONE JOB OF A SPLIT CI RUN joins the run its CI run shares instead of opening one (./appBuild).
  const joinKey = splitRunKeyOf(passedOptions as BuildFlags);

  let openBuildReturn;
  /** A split job whose test starts in the other job: its run waits for that job's platform. */
  let joinedRunWaits = false;
  try {
    // Through the server seam (../../seams/serverCalls), so a pose answers this call instead of
    // the network. The payload is the one this run composed, unchanged.
    const request = {
      teamId,
      projectIndex,
      buildRunConfig,
      gitInfo,
      message: commandParams.message,
      baseFingerprint,
      gateMetadata: gateMetadata as GateMetadataByPlatform,
    };
    if (joinKey) {
      // A joined run decides what it captures when its last platform is in, so this job
      // has no capture plan to print - only the run's link.
      const joined = await joinTheRun({
        token,
        joinKey,
        platform: platformsToTest[0],
        request,
        platformRows,
      });
      joinedRunWaits = joined.waitingFor.length > 0;
      openBuildReturn = {
        build: joined.build,
        buildRun: { config: {} },
      } as unknown as Awaited<ReturnType<ReturnType<typeof serverCalls>['openBuild']>>;
    } else {
      openBuildReturn = await serverCalls().openBuild({ token, ...request });
    }
  } catch (error) {
    // Safety net: the server gate may still refuse at openBuild even though the
    // checks above said fast (e.g. a base registered between calls). It is the
    // SAME routing answer, so it is published the SAME way.
    const refusal = parseStagedGateRefusal(error);
    if (refusal) {
      return buildTheRefusedPlatforms({
        refusals: [refusal],
        storedBuildIndexOf: identityAnswers.storedBuildIndexOf,
      });
    }
    handleClientError(error, token); // always throws
    throw error; // unreachable - satisfies control flow / typing
  }

  // 13. The fast path is committed: this commit is being tested with no native
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

  // The test's row, with what it captures (SHERLO-1919) - read straight off the openBuild response,
  // no extra API call (a joined run's row was printed by joinTheRun) - then its ending
  // (./closeTheRun).
  if (!joinKey) {
    printTestStarted({
      openBuildReturn,
      moduleManifests: collectModuleManifests(bundles, platformsToTest),
      platformsToTest,
      devices: commandParams.devices,
      serverBypassed,
      platformRows,
    });
  }

  await closeTheRun({
    commandParams,
    buildIndex,
    url,
    serverBypassed,
    platformRows,
    endsOnNextStep: !joinedRunWaits,
    hasCiToken: openBuildReturn.hasCiToken,
  });

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
  token,
  platformsToTest,
  baseFingerprint,
  gateMetadata,
  projectIndex,
  teamId,
}: {
  /** The token the push spends - the seam builds its own sdk client from it (../../seams/serverCalls). */
  token: string;
  platformsToTest: Platform[];
  baseFingerprint: string;
  gateMetadata: (platform: Platform) => GateMetadataInput;
  projectIndex: number;
  teamId: string;
}): Promise<GateAnswers> {
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling checkStagedGate API',
    data: { teamId, projectIndex, platforms: platformsToTest },
    level: 'info',
  });

  const refusals: StagedGateRefusal[] = [];
  const storedBuildIndexOf: GateAnswers['storedBuildIndexOf'] = {};

  try {
    for (const platform of platformsToTest) {
      // Through the server seam, so a posed run answers the gate from its pose (the tester's
      // staged storyline) and never reaches the network.
      const { outcome, diff, storedBase, storedBuildIndex } = await serverCalls().checkStagedGate({
        token,
        baseFingerprint,
        gateMetadata: gateMetadata(platform) as GateMetadata,
        platform,
        projectIndex,
        teamId,
      });

      if (storedBuildIndex !== undefined) storedBuildIndexOf[platform] = storedBuildIndex;
      if (outcome !== 'fast') {
        refusals.push({ outcome, platform, diff, ...(storedBase ? { storedBase } : {}) });
      }
    }
  } catch (error) {
    handleClientError(error, token); // always throws (bad token, network, ...)
    throw error; // unreachable - satisfies control flow / typing
  }

  return { refusals, storedBuildIndexOf };
}

/** What the gate answered for every platform: the ones it refused, and the test each stored app build came from. */
type GateAnswers = {
  refusals: StagedGateRefusal[];
  /** Per platform, the test its stored app build was built in - absent where nothing is stored. */
  storedBuildIndexOf: Partial<Record<Platform, number>>;
};

/** The per-platform module manifests the capture plan reads, lifted off the bundles. */
export function collectModuleManifests(
  bundles: Partial<Record<Platform, BundleResult>>,
  platformsToTest: Platform[]
): Partial<Record<Platform, ValidatedModuleManifest>> {
  const moduleManifests: Partial<Record<Platform, ValidatedModuleManifest>> = {};
  for (const platform of platformsToTest) {
    const manifest = bundles[platform]?.moduleManifest;
    if (manifest) moduleManifests[platform] = manifest;
  }
  return moduleManifests;
}

/**
 * The test's row under the platforms' rows, saying what it captures - per platform, straight off
 * the openBuild response (SHERLO-1919): `Test 14     ✔ Started: 3 of 24 stories on 1 device
 * (Pixel 7)`, with the story files it captures under it, new and changed marked (../../render/runRows).
 * No extra API call: `captureScope` carries the captured set and `diffScopeInfo` the reason. Why a
 * partial capture took what it took is `npx sherlo view <n> --json`'s. The review link is the
 * ending's (./closeTheRun).
 *
 * A platform the server made no decision for (no `captureScope`) adds no count - silence, never an
 * invented "captured everything". A test the server closed without a device run has no started row
 * (./closeTheRun ends it, and decides where its platforms' rows go).
 *
 * Exported because the SIM road reuses this exact output road - it has no
 * bundles, so the count is keyed on each platform's module manifest, the one input
 * the line actually reads.
 */
export function printTestStarted({
  openBuildReturn,
  moduleManifests,
  platformsToTest,
  devices,
  serverBypassed,
  platformRows,
}: {
  openBuildReturn: OpenBuildAnswer;
  moduleManifests: Partial<Record<Platform, ValidatedModuleManifest>>;
  platformsToTest: Platform[];
  devices: Config['devices'];
  serverBypassed: boolean;
  /** What became of each platform's app build: the rows above the test's row. The sim road has none. */
  platformRows: PlatformRow[];
}): void {
  // A test the server closed without a device run never started on one: its ending is the one
  // finished step that says so (./closeTheRun).
  if (serverBypassed) return;

  const diffScopeInfo = openBuildReturn.build.diffScopeInfo as
    | DiffScopeInfoWithPlatformReasons
    | undefined;

  const capture: PlatformCapture[] = [];
  for (const platform of platformsToTest) {
    const platformConfig = openBuildReturn.buildRun?.config?.[platform] as
      | PlatformConfigWithCaptureScope
      | undefined;
    const captureScope = platformConfig?.captureScope;
    if (!captureScope) continue;

    const manifest = moduleManifests[platform];
    capture.push({
      platform,
      // INVERSION GUARD: full === true is "every story", regardless of the list.
      full: captureScope.full,
      capturedStories: captureScope.full
        ? 0
        : manifest
          ? countStoriesIn(manifest, captureScope.storyFilePaths ?? [])
          : (captureScope.storyFilePaths ?? []).length,
      // The whole bundle's story set, counted the ONE canonical way.
      storiesInBundle: manifest ? countBundleStories(manifest) : undefined,
      // The server's own prose, verbatim - never the build-wide `fullCaptureTriggerReason`, which is
      // a machine code. The line prints it only for a full capture (Q2).
      reason: diffScopeInfo?.platforms?.[platform]?.reason,
      // A full capture takes every story file the bundle holds.
      storyFiles: captureScope.full
        ? manifest
          ? bundleStoryFiles(manifest)
          : []
        : (captureScope.storyFilePaths ?? []),
      newStoryFiles: captureScope.newStoryFilePaths ?? [],
      ...(manifest?.parsed.storyTitles ? { storyTitles: manifest.parsed.storyTitles } : {}),
      // A partial capture takes exactly what a change reaches.
      changedStoryFiles: captureScope.full
        ? (captureScope.changedStoryFilePaths ?? [])
        : (captureScope.storyFilePaths ?? []),
    });
  }

  emit({
    kind: 'test-started',
    buildIndex: openBuildReturn.build.index,
    devices,
    capture,
    rowsAbove: rowsAbove(platformRows),
  });
}
