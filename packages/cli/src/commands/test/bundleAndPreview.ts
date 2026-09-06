/**
 * THE BUNDLING LOOP AND THE WHOLE \`--dry-run\` TRANSCRIPT.
 *
 * Lifted out of ./stagedRun so an expectation producer can run THIS code rather
 * than a re-implementation of it, and so importing it does not drag the staged
 * road (and its sdk-client) along. Nothing about what these functions print
 * changed on the way here: every literal they used to spell inline now lives in
 * ../../render, reached through the segment sink.
 */
import { Platform } from '@sherlo/api-types';
import { emit } from '../../helpers/transcriptSink';
import { reporting } from '../../helpers';
import type { GitInfo } from '../../helpers/getGitInfo';
import type { GateMetadataInput } from '../../helpers/fingerprint';
import { buildBundleForPlatform, buildGateMetadata, type BundleResult } from './buildBundle';
import { runDryRunPreview } from './dryRun';
import type { DryRunDecisionClient } from './dryRunDecision';

/**
 * Build the production bundle + assets for every platform and, alongside each,
 * the REAL gate metadata derived from it. Both the dry run and the live run
 * bundle through this exact path, so a preview can never diverge from the run
 * it is previewing.
 *
 * A bundling failure is user-facing and already carries the fallback line, so it
 * is printed and exits here rather than propagating as a crash.
 *
 * THE TWO EFFECTS ARE PARAMETERS SO AN EXPECTATION PRODUCER RUNS THIS EXACT LOOP.
 * The transcript's per-platform block is emitted from HERE, in this order, around
 * these two awaits - so a producer that re-implemented the loop could drift from
 * it silently. Instead it supplies the two effects and runs the shipped code:
 * `bundleFor` resolves a scripted {@link BundleResult} (the same type the bundler
 * returns) and `gateMetadataFor` returns nothing a transcript can see. Nothing
 * else here is substitutable, and nothing else needs to be.
 */
export const REAL_BUNDLING_EFFECTS: BundlingEffects = {
  bundleFor: (projectRoot, platform) => buildBundleForPlatform({ projectRoot, platform }),
  gateMetadataFor: (projectRoot, platform, bundleResult) =>
    buildGateMetadata({ projectRoot, platform, bundleResult }),
};

/**
 * THE WHOLE `--dry-run` TRANSCRIPT, from the bundling header to the closer.
 *
 * Extracted out of {@link stagedRun}'s dry-run branch so an expectation producer
 * runs THIS function rather than a re-implementation of it. The producer supplies
 * the three effects a dry run performs - bundling, the git read, and the
 * read-only decision query (which reaches this code as `client`, a parameter
 * `runDryRunPreview` already had) - and the segment order, the bail-open
 * branching and every literal come from the shipped code, unforked.
 */
export async function runDryRunFlow({
  projectRoot,
  platformsToTest,
  client,
  projectIndex,
  teamId,
  baseFingerprint,
  resolveGitInfo,
  effects,
}: {
  projectRoot: string;
  platformsToTest: Platform[];
  client: DryRunDecisionClient;
  projectIndex: number;
  teamId: string;
  baseFingerprint: string;
  resolveGitInfo: () => Promise<GitInfo>;
  effects?: BundlingEffects;
}): Promise<void> {
  emit({ kind: 'dry-run-bundling-header' });

  const bundles = await buildBundles({
    projectRoot,
    platformsToTest,
    ...(effects ? { effects } : {}),
  });

  const gitInfo = await resolveGitInfo();

  await runDryRunPreview({
    client,
    bundles: bundles.results,
    platformsToTest,
    projectIndex,
    teamId,
    gitInfo,
    baseReference: baseFingerprint,
  });
}

/** The two awaits the bundling loop wraps its transcript around. */
export type BundlingEffects = {
  bundleFor: (projectRoot: string, platform: Platform) => Promise<BundleResult>;
  gateMetadataFor: (
    projectRoot: string,
    platform: Platform,
    bundleResult: BundleResult
  ) => Promise<GateMetadataInput>;
};

export async function buildBundles({
  projectRoot,
  platformsToTest,
  effects = REAL_BUNDLING_EFFECTS,
}: {
  projectRoot: string;
  platformsToTest: Platform[];
  effects?: BundlingEffects;
}): Promise<{
  results: Partial<Record<Platform, BundleResult>>;
  gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput };
}> {
  const results: Partial<Record<Platform, BundleResult>> = {};
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};

  for (const platform of platformsToTest) {
    emit({ kind: 'platform-bundle-start', platform });

    try {
      const result = await effects.bundleFor(projectRoot, platform);
      results[platform] = result;

      emit({
        kind: 'platform-bundle-built',
        bundlePath: result.bundlePath,
        bundleSizeMb: result.bundleSizeMb,
        bundleFormat: result.bundleFormat,
        bundler: result.bundler,
      });
      if (result.assetsDest) {
        emit({ kind: 'platform-bundle-assets', assetCount: result.assetInventory.length });
      }

      gateMetadata[platform] = await effects.gateMetadataFor(projectRoot, platform, result);
    } catch (err) {
      // buildBundleForPlatform throws user-facing messages that already include
      // the fallback line.
      const message = err instanceof Error ? err.message : String(err);
      emit({ kind: 'platform-bundle-failed', message });
      await reporting.flush().finally(() => process.exit(1));
    }
  }

  return { results, gateMetadata };
}
