/**
 * THE BUNDLING LOOP.
 *
 * Lifted out of ./stagedRun so an expectation producer can run THIS code rather
 * than a re-implementation of it, and so importing it does not drag the staged
 * road (and its sdk-client) along. Every literal it prints lives in ../../render,
 * reached through the segment sink.
 */
import { Platform } from '@sherlo/api-types';
import { emit } from '../../helpers/transcriptSink';
import { reporting } from '../../helpers';
import type { GateMetadataInput } from '../../helpers/fingerprint';
import type { BundleResult } from './buildBundle';
import type { BuildSettings } from './appBuild/buildSettings';
import { bundler, liveBundler, type Bundler } from '../../seams/bundler';
import { whileShowing } from '../shared/terminal';

/**
 * Build the production bundle + assets for every platform and, alongside each,
 * the REAL gate metadata derived from it. The live run bundles through this
 * exact path.
 *
 * A bundling failure is user-facing, so it is printed and exits here rather than
 * propagating as a crash.
 *
 * THE TWO EFFECTS ARE A SEAM SO AN EXPECTATION PRODUCER RUNS THIS EXACT LOOP.
 * The transcript's per-platform block is emitted from HERE, in this order, around
 * these two awaits - so a producer that re-implemented the loop could drift from
 * it silently. Instead it installs a bundler (../../seams/bundler) and runs the
 * shipped code: `bundleFor` resolves a {@link BundleResult} - the same type the
 * real bundler returns - and `gateMetadataFor` returns nothing a transcript can
 * see. Nothing else here is substitutable, and nothing else needs to be.
 */
export const REAL_BUNDLING_EFFECTS: BundlingEffects = liveBundler;

/**
 * The two awaits the bundling loop wraps its transcript around. Declared by the seam that owns
 * them (../../seams/bundler) and named here for every existing caller.
 */
export type BundlingEffects = Bundler;

export async function buildBundles({
  projectRoot,
  platformsToTest,
  buildSettings,
  // The bundler IN FORCE, not the real one by name: a posed run installs its own and this loop
  // never learns which it got.
  effects = bundler(),
}: {
  projectRoot: string;
  platformsToTest: Platform[];
  /** The config's `build` block, whose `env` and eas.json profile the bundler runs with. */
  buildSettings: BuildSettings;
  effects?: BundlingEffects;
}): Promise<{
  results: Partial<Record<Platform, BundleResult>>;
  gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput };
}> {
  const results: Partial<Record<Platform, BundleResult>> = {};
  const gateMetadata: { android?: GateMetadataInput; ios?: GateMetadataInput } = {};

  for (const platform of platformsToTest) {
    try {
      // A spinner in a terminal, gone when the bundle is made; one plain line in a log.
      const result = await whileShowing({ kind: 'platform-bundle-start', platform }, () =>
        effects.bundleFor(projectRoot, platform, buildSettings)
      );
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
      // buildBundleForPlatform throws user-facing messages.
      const message = err instanceof Error ? err.message : String(err);
      emit({ kind: 'platform-bundle-failed', message });
      await reporting.flush().finally(() => process.exit(1));
    }
  }

  return { results, gateMetadata };
}
