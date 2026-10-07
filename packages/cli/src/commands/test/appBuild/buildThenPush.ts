/**
 * WHERE `sherlo test` USED TO STOP, IT BUILDS - the staged gate said a platform needs a new app
 * build, so the tool builds it here and pushes it down the standard road, exactly as if the
 * developer had built it and passed `--android`/`--ios` themselves.
 *
 * `--no-build` keeps the old answer: `native-needed=true`, nothing built, exit 4 - the question a
 * CI pipeline asks first on a cheap Linux job, so a JavaScript-only change never starts a Mac.
 *
 * ------------------------------------------------------------------------
 * PLAN-LAYER DEBT, NAMED (epic sherlo-test-builds-apps). A MIXED run - one platform needs a new
 * app build and the other can still take the stored one - is drawn in plan only as its first line;
 * the push that stages one platform and uploads the other needs the server's per-platform slots,
 * which are a build task. Until then this module refuses it by name rather than build both.
 */
import fs from 'fs';
import path from 'path';
import type { Platform } from '@sherlo/api-types';
import {
  getValidatedCommandParams,
  uploadOrReuseBuildsAndRunTests,
} from '../../../helpers';
import { emit } from '../../../helpers/transcriptSink';
import type { Options } from '../../../types';
import type { AppBuildReason } from '../../../render/appBuild';
import { THIS_COMMAND } from '../constants';
import type { StagedGateRefusal } from '../stagedGateRefusal';
import { buildApps } from './buildApps';
import { type BuildFlags, type BuildSettings, readBuildSettings } from './buildSettings';
import { easRun } from './easRun';

/** Build what the gate refused, then run the standard road on the fresh app builds. */
export async function buildThenPush({
  passedOptions,
  platformsToTest,
  refusals,
  baseFingerprint,
}: {
  passedOptions: Options<THIS_COMMAND> & BuildFlags;
  platformsToTest: Platform[];
  refusals: StagedGateRefusal[];
  baseFingerprint: string;
}): Promise<{ url: string }> {
  const refused = new Set(refusals.map(({ platform }) => platform));
  const storedStillMatches = platformsToTest.filter((platform) => !refused.has(platform));

  for (const platform of storedStillMatches) {
    emit({ kind: 'app-build-stored-reused', platform });
  }

  if (storedStillMatches.length > 0) {
    // PLAN-LAYER DEBT - see this module's header.
    throw new Error(
      'a mixed run (one platform built, one staged) is drawn in plan and not built yet ' +
        '(epic sherlo-test-builds-apps)'
    );
  }

  const commandParams = getValidatedCommandParams(
    { command: THIS_COMMAND, passedOptions },
    { requirePlatformPaths: false }
  );
  const settings = readBuildSettings(commandParams);

  // EAS MODE: the refused platforms are built on Expo's servers, and the run waits for them.
  if (settings.tool === 'eas') {
    return easRun({ commandParams, platforms: [...refused], settings });
  }

  warnAboutVariablesOnExpo(commandParams.projectRoot, settings);

  const builtPaths = await buildApps({
    projectRoot: commandParams.projectRoot,
    toBuild: refusals.map((refusal) => ({ platform: refusal.platform, reason: reasonOf(refusal) })),
    settings,
    baseFingerprint,
    cacheDirFlag: passedOptions.buildCache,
    savedToCache: false,
  });

  // THE STANDARD ROAD, ON THE BUILDS JUST MADE: the same validation and the same push spine a
  // developer gets by passing the paths themselves, so nothing below this line knows who built them.
  return uploadOrReuseBuildsAndRunTests({
    commandParams: getValidatedCommandParams(
      { command: THIS_COMMAND, passedOptions: { ...passedOptions, ...builtPaths } },
      { requirePlatformPaths: true }
    ),
  });
}

/**
 * A local build borrows the eas.json profile's `env`, and cannot borrow the variables a profile
 * keeps on Expo's servers (`environment`) without an Expo login. Said once, before the build, so a
 * developer whose app needs them knows where to put them.
 */
function warnAboutVariablesOnExpo(projectRoot: string, settings: BuildSettings): void {
  const profileName = settings.easProfile;
  if (!profileName) return;

  let environment: unknown;
  try {
    const easJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'eas.json'), 'utf8'));
    environment = easJson.build?.[profileName]?.environment;
  } catch {
    return; // No eas.json, or one that cannot be read: there is nothing to borrow.
  }

  if (typeof environment === 'string') {
    emit({ kind: 'eas-hosted-variables', profile: profileName, environment });
  }
}

/**
 * The gate's refusal, in the developer's words: a refusal that names what moved is native code
 * that changed since the stored app build, and one that names nothing is a project Sherlo holds no
 * app build for yet - the gate has nothing to compare with.
 *
 * PLAN-LAYER DEBT: a moved base fingerprint is refused with an empty diff too, so today the gate
 * cannot tell "nothing stored" from "native code changed". The build task gives the gate's answer
 * a field that says no base is stored, and this reads it instead of the empty diff.
 */
function reasonOf(refusal: StagedGateRefusal): AppBuildReason {
  return refusal.diff.length > 0 ? 'native-changed' : 'nothing-stored';
}
