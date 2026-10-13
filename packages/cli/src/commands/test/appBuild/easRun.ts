/**
 * EAS MODE - `sherlo test` in a project whose sherlo.config.json says `"build": { "tool": "eas" }`.
 *
 * The staged gate runs first, exactly as for a local build: a JavaScript-only change takes the
 * stored app build and no EAS build starts at all. Only a platform the gate refused is built, and
 * here it is built on Expo's servers instead of this machine:
 *
 *   1. package.json must hold the `eas-build-on-complete` script - each EAS build uploads itself
 *      to Sherlo through it when it finishes - and the `eas-build-on-cancel` script, the same line,
 *      through which a cancelled EAS build closes the run (epic sherlo-test-builds-apps, operator
 *      decision 2026-10-11). A project without either is refused before anything starts, naming
 *      every one it lacks, because a run would otherwise wait for builds that never arrive. So is
 *      one whose eas.json has no profile named `build.easProfile` (default "sherlo") - setup writes
 *      none - and one whose upload to EAS would leave `.sherlo/data.json` out (./easHandOver.ts).
 *   2. The run is opened with one empty slot per platform, and `.sherlo/data.json` is written so
 *      the EAS builds carry which run they belong to.
 *   3. One EAS build per refused platform is started with the profile `build.easProfile`
 *      (default "sherlo"), without waiting.
 *   4. The run starts on Sherlo when the last slot is filled - never before (operator ruling
 *      2026-10-07).
 *
 * This replaces the separate `test:eas-cloud-build` command, which the Sherlo 3 CLI no longer has;
 * the server still serves older CLIs that call it.
 *
 * ------------------------------------------------------------------------
 * PLAN-LAYER DEBT, NAMED (epic sherlo-test-builds-apps): `.sherlo/data.json` still carries the
 * project token, as the old command wrote it. The build task replaces it with a ticket for this one
 * run, and the opener then accepts a `sherlo login` too.
 */
import type { Platform } from '@sherlo/api-types';
import { EAS_BUILD_ON_CANCEL_SCRIPT, EAS_BUILD_ON_COMPLETE_COMMAND } from '../../../constants';
import {
  getAppBuildUrl,
  getBuildRunConfig,
  getGitInfo,
  handleClientError,
  throwError,
} from '../../../helpers';
import { readProjectJson } from '../../../helpers/projectJson';
import { emit } from '../../../helpers/transcriptSink';
import { serverCalls } from '../../../seams/serverCalls';
import { appBuilder } from '../../../seams/appBuilder';
import type { CommandParams } from '../../../types';
import { whileShowing } from '../../shared/terminal';
import { createSherloTempDirectory } from '../../testEasCloudBuild/helpers';
import { closeTheRun } from '../closeTheRun';
import { SHERLO_BUILD_FOR_PUSH, type THIS_COMMAND } from '../constants';
import { rowsAbove, printPlatformRowInALog } from '../platformRows';
import { type BuildSettings, DEFAULT_EAS_PROFILE } from './buildSettings';
import { refuseWhenEasLeavesTheHandOverOut } from './easHandOver';

/**
 * The package.json scripts each EAS build reports to Sherlo through, both running the same command:
 * Expo runs the first when a build ends, finished or errored, and the second when it is cancelled.
 */
const EAS_HOOK_SCRIPTS = [EAS_BUILD_ON_COMPLETE_COMMAND, EAS_BUILD_ON_CANCEL_SCRIPT];
const EAS_HOOK_COMMAND = `sherlo ${EAS_BUILD_ON_COMPLETE_COMMAND}`;

/**
 * The variable every Sherlo app build is made with, set to `SHERLO_BUILD_FOR_PUSH`: the app opens
 * into Storybook.
 */
const SHERLO_BUILD_VARIABLE = 'SHERLO_BUILD';

/** Open the run, start an EAS build of every refused platform, and hand back the run's address. */
export async function easRun({
  commandParams,
  platforms,
  settings,
}: {
  commandParams: CommandParams<THIS_COMMAND>;
  platforms: Platform[];
  settings: BuildSettings;
}): Promise<{ url: string }> {
  refuseWithoutTheHookScripts(commandParams.projectRoot);

  const profile = settings.easProfile ?? DEFAULT_EAS_PROFILE;
  refuseWithoutTheProfile(commandParams.projectRoot, profile);
  refuseWhenEasLeavesTheHandOverOut(commandParams.projectRoot);
  const { token, projectIndex, teamId } = commandParams.credential;

  const { build, hasCiToken } = await serverCalls()
    .openBuild({
      token,
      teamId,
      projectIndex,
      asyncUpload: true,
      buildRunConfig: getBuildRunConfig({ commandParams }),
      gitInfo: await getGitInfo(commandParams.projectRoot, {
        branchOverride: commandParams.gitBranch,
      }),
      message: commandParams.message,
    })
    .catch((error) => handleClientError(error, token));

  const buildIndex = build.index;

  // Written BEFORE the EAS builds start: EAS uploads the project as it is when the build starts,
  // and each build reads which run it belongs to out of this file.
  createSherloTempDirectory({ projectRoot: commandParams.projectRoot, buildIndex, token, profile });

  // Starting them is only a wait, so it leaves no line of its own: each platform's row says it is
  // building on EAS, and the test's row that it starts when they finish.
  await whileShowing({ kind: 'eas-builds-starting', platforms }, async () => {
    for (const platform of platforms) {
      await appBuilder().startEasBuild({ platform, profile, projectRoot: commandParams.projectRoot });
    }
  });

  const platformRows = platforms.map((platform) => printPlatformRowInALog({ platform, appBuild: 'building-on-eas' }));
  emit({
    kind: 'run-waits-for-builds',
    buildIndex,
    waitingFor: { easBuilds: platforms },
    rowsAbove: rowsAbove(platformRows),
  });

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });

  // FROM A LAPTOP THE DEVELOPER OFTEN STAYS FOR THE ANSWER: `--wait` waits through the EAS builds
  // and the run alike, under the same contract as every other wait - EAS builds take a while, so
  // the deadline is the one `--wait-timeout` names.
  await closeTheRun({ commandParams, buildIndex, url, hasCiToken, platformRows });

  return { url };
}

/**
 * EAS builds report to Sherlo through the hook scripts, so a project without them is refused first,
 * naming every script it lacks and the line to add for each.
 */
function refuseWithoutTheHookScripts(projectRoot: string): void {
  // No package.json, or one that cannot be read: the scripts are missing either way.
  const scripts: Record<string, unknown> = readProjectJson(projectRoot, 'package.json')?.scripts ?? {};

  const missingScripts = EAS_HOOK_SCRIPTS.filter((script) => !scripts[script]);
  if (missingScripts.length === 0) return;

  const named = missingScripts.map((script) => `"${script}"`).join(' or ');
  const lines = missingScripts.map((script) => `"${script}": "${EAS_HOOK_COMMAND}"`).join(',\n');

  throwError({
    message:
      `Can't build on EAS: package.json has no ${named} script.\n` +
      (missingScripts.length === 1
        ? 'EAS builds report back to Sherlo through this script. Add it to "scripts":\n'
        : 'EAS builds report back to Sherlo through these scripts. Add them to "scripts":\n') +
      lines,
  });
}

/**
 * EAS builds start with an eas.json profile, and `sherlo init` writes none (operator decision
 * 2026-10-07: setup asks nothing about EAS), so a project without it is refused first and shown the
 * profile to add - an APK for Android and a simulator build for iOS, the two shapes a Sherlo device
 * runs, with `SHERLO_BUILD=storybook`, the variable that builds the app with Storybook in it (settled
 * with the Storybook epic, 2026-10-07). A profile that is there but leaves the variable out is
 * refused the same way, naming the one line it lacks. Draft words, for the content department's
 * review.
 */
function refuseWithoutTheProfile(projectRoot: string, profile: string): void {
  // No eas.json, or one that cannot be read: the profile is missing either way.
  const profiles: Record<string, { env?: Record<string, unknown> } | undefined> =
    readProjectJson(projectRoot, 'eas.json')?.build ?? {};

  const found = profiles[profile];

  if (!found) {
    throwError({
      message:
        `Can't build on EAS: eas.json has no "${profile}" build profile.\n` +
        'Sherlo starts its EAS builds with that profile. Add it to "build" in eas.json:\n' +
        `"${profile}": {\n` +
        '  "distribution": "internal",\n' +
        `  "env": { "${SHERLO_BUILD_VARIABLE}": "${SHERLO_BUILD_FOR_PUSH}" },\n` +
        '  "android": { "buildType": "apk" },\n' +
        '  "ios": { "simulator": true }\n' +
        '}',
    });
  }

  if (found.env?.[SHERLO_BUILD_VARIABLE] === SHERLO_BUILD_FOR_PUSH) return;

  throwError({
    message:
      `Can't build on EAS: the "${profile}" profile in eas.json doesn't set ${SHERLO_BUILD_VARIABLE}.\n` +
      `Sherlo's builds need it set to "${SHERLO_BUILD_FOR_PUSH}". Add this line to the profile's "env":\n` +
      `"${SHERLO_BUILD_VARIABLE}": "${SHERLO_BUILD_FOR_PUSH}"`,
  });
}
