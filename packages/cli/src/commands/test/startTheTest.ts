/**
 * HOW A PUSH WHOSE BUNDLES ARE UP STARTS ITS TEST AND ENDS ON SCREEN - one place, so the staged
 * road (./stagedRun) and the sim road (./simRun) open the test, print it and close it the same way
 * and cannot drift apart: the push facts the test is opened with, a split job's join, the test's
 * Started row with its story counts and titles, the branching-off warning, and the ending
 * (./closeTheRun). Only what comes before - bundling the app, or reading a sim world - is a road's
 * own.
 */
import type { Platform } from '@sherlo/api-types';
import { getAppBuildUrl, handleClientError, reporting } from '../../helpers';
import { emit } from '../../helpers/transcriptSink';
import { isServerBypassed } from '../../helpers/waitForBuildResult';
import type { PlatformRow } from '../../render/runRows';
import type { PlatformCapture, SherloProject } from '../../render/testSteps';
import { serverCalls, type OpenBuildAnswer, type OpenBuildRequest } from '../../seams/serverCalls';
import type { CommandParams, Config, Options } from '../../types';
import type { BuildFlags } from './appBuild/buildSettings';
import { joinTheRun } from './appBuild/joinTheRun';
import { pushFactsOf } from './appBuild/pushFacts';
import { capturePerPlatform } from './capturePerPlatform';
import { closeTheRun } from './closeTheRun';
import type { THIS_COMMAND } from './constants';
import { rowsAbove } from './platformRows';
import { countBundleStories, type ValidatedModuleManifest } from './readModuleManifest';

/**
 * Open the test (or, for one job of a split CI run, join the run its CI run shares), print its
 * Started row, and end it. `refusedAtOpen` is a road's own answer to an error the open threw - the
 * staged road's late gate refusal - and anything it does not answer is the client error it is.
 */
export async function openAndEndTheTest({
  passedOptions,
  commandParams,
  platformsToTest,
  joinKey,
  request,
  moduleManifests,
  platformRows,
  refusedAtOpen,
}: {
  passedOptions: Options<THIS_COMMAND>;
  commandParams: CommandParams<THIS_COMMAND>;
  platformsToTest: Platform[];
  /** The run this job joins, for one job of a split CI run; none, and the test is opened alone. */
  joinKey: string | null | undefined;
  /** Everything the open is sent, but the push facts, which are composed here. */
  request: Omit<OpenBuildRequest, 'pushFacts'>;
  /** Each platform's module map: what the test's Started row counts and names the stories by. */
  moduleManifests: Partial<Record<Platform, ValidatedModuleManifest>>;
  /** What became of each platform's app build: the rows above the test's row. */
  platformRows: PlatformRow[];
  refusedAtOpen?: (error: unknown) => Promise<{ url: string }> | undefined;
}): Promise<{ url: string }> {
  const { token, projectIndex, teamId } = commandParams.credential;

  let openBuildReturn: OpenBuildAnswer;
  /** A split job whose test starts in the other job: its run waits for that job's platform. */
  let joinedRunWaits = false;
  try {
    // Nothing was built on these roads: the facts are the module maps' story counts and the CI run.
    const pushFacts = pushFactsOf({
      appBuilds: {},
      storiesInBundle: storiesInBundleOf(moduleManifests),
      env: process.env,
      runIdFlag: (passedOptions as BuildFlags).runId,
    });
    if (joinKey) {
      // A joined run decides what it captures when its last platform is in, so this job
      // has no capture plan to print - only the run's link.
      const joined = await joinTheRun({
        token,
        joinKey,
        platform: platformsToTest[0],
        request,
        pushFacts: pushFacts.platforms[platformsToTest[0]],
        platformRows,
        testDevices: commandParams.testDevices,
      });
      joinedRunWaits = joined.waitingFor.length > 0;
      openBuildReturn = {
        build: joined.build,
        buildRun: { config: {} },
      } as unknown as OpenBuildAnswer;
    } else {
      // Through the server seam (../../seams/serverCalls), so a pose answers this call instead of
      // the network.
      openBuildReturn = await serverCalls().openBuild({ token, pushFacts, ...request });
    }
  } catch (error) {
    const refused = refusedAtOpen?.(error);
    if (refused) return refused;
    handleClientError(error, token); // always throws
    throw error; // unreachable - satisfies control flow / typing
  }

  const buildIndex = openBuildReturn.build.index;
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
      moduleManifests,
      platformsToTest,
      devices: commandParams.devices,
      serverBypassed,
      platformRows,
      project: { teamId, projectIndex },
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

/** How many stories each platform's bundle holds, counted off its module map. */
function storiesInBundleOf(
  moduleManifests: Partial<Record<Platform, ValidatedModuleManifest>>
): Partial<Record<Platform, number>> {
  const counts: Partial<Record<Platform, number>> = {};
  for (const [platform, moduleManifest] of Object.entries(moduleManifests) as Array<
    [Platform, ValidatedModuleManifest]
  >) {
    counts[platform] = countBundleStories(moduleManifest);
  }
  return counts;
}

/**
 * The test's row under the platforms' rows, saying what it captures - per platform, straight off
 * the openBuild response (SHERLO-1919): `Test 14     ✔ Started: 3 of 24 stories on 1 device
 * (Pixel 7)`, with the story files it captures under it, new and changed marked (../../render/runRows).
 * No extra API call: `captureScope` carries the captured set and `diffScopeInfo` the reason. Why a
 * partial capture took what it took is `npx sherlo view <n> --json`'s. The review link is the
 * ending's (./closeTheRun).
 *
 * `full: true` means EVERY story was in scope: an empty `storyFilePaths` then means "everything".
 * A platform with no `captureScope` adds no count, never an invented "captured everything". A test
 * the server closed without a device run has no started row (./closeTheRun ends it).
 *
 * Exported because the standard road (../../helpers/uploadOrReuseBuildsAndRunTests) prints the
 * same row.
 */
export function printTestStarted({
  openBuildReturn,
  moduleManifests,
  platformsToTest,
  devices,
  serverBypassed,
  platformRows,
  project,
}: {
  /** The project's address, for the branching-off warning's link; none, no warning. */
  project?: SherloProject;
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

  const capture = capturePerPlatform({ openBuildReturn, moduleManifests, platformsToTest });

  // Branching is off when the server captured every story and said why: the project has no main
  // branch. The warning says it, so the Started row drops the same words.
  const showBranchingOff = !!project && hasNoMainBranch(capture);

  emit({
    kind: 'test-started',
    buildIndex: openBuildReturn.build.index,
    devices,
    capture: showBranchingOff ? capture.map((c) => ({ ...c, reason: undefined })) : capture,
    rowsAbove: rowsAbove(platformRows),
  });

  if (showBranchingOff) {
    emit({ kind: 'branching-off', project });
  }
}

/** The server's own words for a full capture that has no main branch to measure against. */
const NO_MAIN_BRANCH_REASON = 'no main branch is set';

/** Every platform was captured in full for want of a main branch. */
function hasNoMainBranch(capture: PlatformCapture[]): boolean {
  return capture.length > 0 && capture.every((c) => c.reason === NO_MAIN_BRANCH_REASON);
}
