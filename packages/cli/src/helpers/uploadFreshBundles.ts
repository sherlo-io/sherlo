/**
 * THE STANDARD ROAD'S FRESH BUNDLE - `sherlo test --android <apk> [--ios <app>]`.
 *
 * Every `sherlo test` run renders a JS bundle built from the tree it runs in,
 * never the bundle embedded in the native binary. On the staged road that is the
 * whole point; on this road it is what makes the binary and the bundle
 * independent: the binary is uploaded and registered as the native base, and the
 * bundle is built (or accepted from `--bundle-dir`), uploaded to the staged
 * slots and spliced into that binary by the runner before the app is installed.
 *
 * Both halves reuse the staged road's code unforked: the bundling loop and the
 * supplied-bundle checks (including the staleness check that refuses a
 * `--bundle-dir` built before the app's source last changed) come from
 * ../commands/test, and so does the upload step. Nothing here is a second
 * implementation of either.
 *
 * NOTHING HERE IS FAIL-SOFT. A run that cannot render its fresh bundle would
 * render the embedded one instead, which is exactly the run this road no longer
 * performs - so a bundling, supply, slot or upload failure ends the run rather
 * than degrading it. The bundling loop prints its own refusal and exits; every
 * other failure throws to the caller.
 */
import { Platform } from '@sherlo/api-types';
import sdkClient from '@sherlo/sdk-client';
import chalk from 'chalk';
import {
  buildBundles,
  REAL_BUNDLING_EFFECTS,
  type BundlingEffects,
} from '../commands/test/bundleAndPreview';
import type { BundleResult } from '../commands/test/buildBundle';
import { resolveSuppliedBundles } from '../commands/test/suppliedBundle';
import {
  realBundleUploadEffects,
  uploadBundles,
  type BundleUploadEffects,
} from '../commands/test/uploadBundles';
import type { StagedUploadKeys } from '../commands/test/uploadStagedArtifacts';
import type { GateMetadataInput } from './fingerprint';

/** One platform's uploaded bundle: where it landed, and how big it is. */
export type UploadedFreshBundle = {
  keys: StagedUploadKeys;
  bundleSizeMb: number;
};

/**
 * The effects this step performs, as parameters so an expectation producer runs
 * THIS function over scripted state rather than a re-implementation of it.
 */
export type FreshBundleEffects = {
  bundling: BundlingEffects;
  upload: BundleUploadEffects;
};

/**
 * This road registers the gate metadata read out of the binary itself, so the
 * bundle-derived probe the shared loops build alongside each bundle is not
 * wanted here. The loops are handed the "I derive nothing" marker instead of a
 * computation whose result would be thrown away.
 */
const NO_BUNDLE_DERIVED_GATE_METADATA: GateMetadataInput = { derivedFrom: 'none' };

export function realFreshBundleEffects(client: ReturnType<typeof sdkClient>): FreshBundleEffects {
  return {
    bundling: {
      bundleFor: REAL_BUNDLING_EFFECTS.bundleFor,
      gateMetadataFor: async () => NO_BUNDLE_DERIVED_GATE_METADATA,
    },
    upload: realBundleUploadEffects(client),
  };
}

/**
 * Build (or accept) and upload the bundle this run renders, for every platform
 * the user handed a binary for.
 */
export async function uploadFreshBundles({
  projectRoot,
  platforms,
  bundleDir,
  baseFingerprint,
  projectIndex,
  teamId,
  effects,
}: {
  projectRoot: string;
  platforms: Platform[];
  /** `--bundle-dir`: use this prebuilt bundle directory instead of bundling. */
  bundleDir?: string;
  /** The base fingerprint this run registers its binary under. */
  baseFingerprint: string;
  projectIndex: number;
  teamId: string;
  effects: FreshBundleEffects;
}): Promise<Partial<Record<Platform, UploadedFreshBundle>>> {
  let bundles: Partial<Record<Platform, BundleResult>>;

  if (bundleDir !== undefined) {
    console.log(chalk.bold('\n📦 Using the supplied bundle...\n'));

    ({ results: bundles } = await resolveSuppliedBundles({
      bundleDir,
      projectRoot,
      platformsToTest: platforms,
      nativeFingerprint: baseFingerprint,
      gateMetadataFor: effects.bundling.gateMetadataFor,
    }));
  } else {
    console.log(chalk.bold('\n📦 Bundling for this run...\n'));

    ({ results: bundles } = await buildBundles({
      projectRoot,
      platformsToTest: platforms,
      effects: effects.bundling,
    }));
  }

  const keys = await uploadBundles({
    platformsToTest: platforms,
    bundles,
    projectIndex,
    teamId,
    effects: effects.upload,
  });

  const uploaded: Partial<Record<Platform, UploadedFreshBundle>> = {};

  for (const platform of platforms) {
    const platformKeys = keys[platform];
    const bundleResult = bundles[platform];
    // Unreachable: uploadBundles throws for any platform it has no keys for.
    if (!platformKeys || !bundleResult) continue;

    uploaded[platform] = { keys: platformKeys, bundleSizeMb: bundleResult.bundleSizeMb };
  }

  return uploaded;
}

export default uploadFreshBundles;
