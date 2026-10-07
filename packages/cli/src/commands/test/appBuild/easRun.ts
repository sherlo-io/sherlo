/**
 * EAS MODE - `sherlo test` in a project whose sherlo.config.json says `"build": { "tool": "eas" }`.
 *
 * The staged gate runs first, exactly as for a local build: a JavaScript-only change takes the
 * stored app build and no EAS build starts at all. Only a platform the gate refused is built, and
 * here it is built on Expo's servers instead of this machine:
 *
 *   1. package.json must hold the `eas-build-on-complete` script - each EAS build uploads itself
 *      to Sherlo through it when it finishes. A project without it is refused before anything
 *      starts, because a run would otherwise wait for builds that never arrive.
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
import fs from 'fs';
import path from 'path';
import type { Platform } from '@sherlo/api-types';
import {
  getAppBuildUrl,
  getBuildRunConfig,
  getGitInfo,
  handleClientError,
  printBuildIntroMessage,
  throwError,
} from '../../../helpers';
import { emit } from '../../../helpers/transcriptSink';
import { serverCalls } from '../../../seams/serverCalls';
import { appBuilder } from '../../../seams/appBuilder';
import type { CommandParams } from '../../../types';
import { createSherloTempDirectory } from '../../testEasCloudBuild/helpers';
import type { THIS_COMMAND } from '../constants';
import { type BuildSettings, DEFAULT_EAS_PROFILE } from './buildSettings';

/** The package.json script each EAS build uploads itself to Sherlo through. */
const EAS_HOOK_SCRIPT = 'eas-build-on-complete';

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
  refuseWithoutTheHookScript(commandParams.projectRoot);

  const profile = settings.easProfile ?? DEFAULT_EAS_PROFILE;
  const { token, projectIndex, teamId } = commandParams.credential;

  const { build } = await serverCalls()
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
  createSherloTempDirectory({ projectRoot: commandParams.projectRoot, buildIndex, token });

  printBuildIntroMessage({ commandParams, nextBuildIndex: buildIndex });

  emit({ kind: 'eas-build-header', profile });
  for (const platform of platforms) {
    await appBuilder().startEasBuild({ platform, profile, projectRoot: commandParams.projectRoot });
    emit({ kind: 'eas-build-queued', platform });
  }

  emit({ kind: 'run-waits-for-builds', buildIndex, waitingFor: { easBuilds: true } });

  const url = getAppBuildUrl({ buildIndex, projectIndex, teamId });
  emit({ kind: 'results-url', url });

  return { url };
}

/** EAS builds upload themselves through the hook script, so a project without it is refused first. */
function refuseWithoutTheHookScript(projectRoot: string): void {
  let scripts: Record<string, unknown> = {};
  try {
    scripts = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    // No package.json, or one that cannot be read: the script is missing either way.
  }

  if (scripts[EAS_HOOK_SCRIPT]) return;

  throwError({
    message:
      `Can't build on EAS: package.json has no "${EAS_HOOK_SCRIPT}" script.\n` +
      'EAS builds upload to Sherlo through it. Add it to "scripts":\n' +
      `"${EAS_HOOK_SCRIPT}": "sherlo ${EAS_HOOK_SCRIPT}"`,
  });
}
