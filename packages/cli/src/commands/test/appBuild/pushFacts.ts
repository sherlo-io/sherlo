/**
 * WHAT ONLY THE PUSH KNOWS, composed in one place for every road that delivers a platform: how its
 * app build was made, why a new one was needed, what changed natively since the stored one, how many
 * stories its bundle holds, and the CI run the push ran in.
 *
 * The push reports these facts when it opens or joins the run, or when an EAS build delivers; the
 * service stores them and never checks them (../../../seams/serverCalls `PushFacts`). Every fact is
 * something the push already decided, so this only gathers them into the wire's shape: the build
 * road (./buildThenPush), the staged road, a split CI job (./joinTheRun) and the EAS hook.
 */
import type { Platform } from '@sherlo/api-types';
import { describeChange, type WhyANewAppBuild } from '../../../render/appBuild';
import type { PushFacts, PushFactsPlatform } from '../../../seams/serverCalls';
import { ciRunKey } from './ciRun';

/** How the push got one platform's app build, and why it was a new one; none for a stored one. */
export type AppBuildAccount = {
  madeBy: NonNullable<PushFactsPlatform['madeBy']>;
  why?: WhyANewAppBuild;
};

/** One platform's facts: its app build's account (a platform on a stored app build has none) and its bundle's stories. */
export function pushFactsPlatformOf({
  appBuild,
  storiesInBundle,
  scenesInBundle,
}: {
  appBuild?: AppBuildAccount;
  storiesInBundle?: number;
  scenesInBundle?: number;
}): PushFactsPlatform {
  const nativeChanges = appBuild?.why?.changesSince?.changes.map(describeChange);

  return {
    ...(appBuild ? { madeBy: appBuild.madeBy } : {}),
    ...(appBuild?.why ? { why: appBuild.why.reason } : {}),
    ...(nativeChanges ? { nativeChanges } : {}),
    ...(storiesInBundle !== undefined ? { storiesInBundle } : {}),
    // A bundle with no scenes reports none, so a push of stories alone sends what it always sent.
    ...(scenesInBundle ? { scenesInBundle } : {}),
  };
}

/** The facts of a whole push: each platform it delivers, and the CI run it ran in. */
export function pushFactsOf({
  appBuilds,
  storiesInBundle,
  scenesInBundle = {},
  env,
  runIdFlag,
}: {
  /** The platforms whose app build this push made or took from a cache. */
  appBuilds: Partial<Record<Platform, AppBuildAccount>>;
  /** How many stories each delivered platform's bundle holds. */
  storiesInBundle: Partial<Record<Platform, number>>;
  /** How many scenes each delivered platform's bundle holds. */
  scenesInBundle?: Partial<Record<Platform, number>>;
  env: NodeJS.ProcessEnv;
  /** `--run-id`, which names the CI run when the CI service does not. */
  runIdFlag?: string;
}): PushFacts {
  const platforms: PushFacts['platforms'] = {};
  for (const platform of ['android', 'ios'] as const) {
    if (!appBuilds[platform] && storiesInBundle[platform] === undefined) continue;

    platforms[platform] = pushFactsPlatformOf({
      appBuild: appBuilds[platform],
      storiesInBundle: storiesInBundle[platform],
      scenesInBundle: scenesInBundle[platform],
    });
  }

  const ciRun = ciRunOf(env, runIdFlag);
  return { platforms, ...(ciRun ? { ciRun } : {}) };
}

/** The CI run as the service names it: the key `github:acme/app/123` is provider `github`, run `acme/app/123`. */
function ciRunOf(env: NodeJS.ProcessEnv, runIdFlag?: string): PushFacts['ciRun'] {
  const key = ciRunKey(env, runIdFlag);
  if (!key) return undefined;

  const separator = key.indexOf(':');
  return { provider: key.slice(0, separator), runId: key.slice(separator + 1) };
}
