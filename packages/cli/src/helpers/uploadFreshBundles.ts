/**
 * THE STANDARD ROAD'S FRESH BUNDLE - the bundle a push of app binaries uploads next to them.
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
import { buildBundles, type BundlingEffects } from '../commands/test/bundleAndPreview';
import { bundler } from '../seams/bundler';
import type { BundleResult } from '../commands/test/buildBundle';
import { resolveSuppliedBundles } from '../commands/test/suppliedBundle';
import {
  realBundleUploadEffects,
  uploadBundles,
  type BundleUploadEffects,
} from '../commands/test/uploadBundles';
import type { StagedUploadKeys } from '../commands/test/uploadStagedArtifacts';
import type { BuildSettings } from '../commands/test/appBuild/buildSettings';
import { countBundleStories } from '../commands/test/readModuleManifest';
import { renderBundleHoldsNoStories } from '../render/appBuild';
import throwError from './throwError';
import type { GateMetadataInput } from './fingerprint';

/**
 * One platform's uploaded bundle: where it landed, how big it is, and its module map - which the
 * started test's line counts the bundle's stories from.
 */
export type UploadedFreshBundle = {
  keys: StagedUploadKeys;
  bundleSizeMb: number;
  moduleManifest?: BundleResult['moduleManifest'];
  /**
   * The gate facts derived from this bundle, the staged road's way - set only for a platform that
   * keeps its stored app build, which the service checks this bundle fits.
   */
  storedBuildGateMetadata?: GateMetadataInput;
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
 * An uploaded platform registers the gate metadata read out of its binary, so the
 * bundle-derived facts the shared loops build alongside each bundle are not
 * wanted for it. The loops are handed the "I derive nothing" marker instead of a
 * computation whose result would be thrown away.
 */
const NO_BUNDLE_DERIVED_GATE_METADATA: GateMetadataInput = { derivedFrom: 'none' };

export function realFreshBundleEffects(token: string): FreshBundleEffects {
  return {
    // The bundler IN FORCE, asked for at call time - a posed run installs its own (../seams/bundler).
    bundling: {
      bundleFor: (projectRoot, platform, buildSettings) =>
        bundler().bundleFor(projectRoot, platform, buildSettings),
      gateMetadataFor: (projectRoot, platform, bundleResult) =>
        bundler().gateMetadataFor(projectRoot, platform, bundleResult),
    },
    upload: realBundleUploadEffects(token),
  };
}

/**
 * Build (or accept) and upload the bundle this run renders, for every platform
 * it uploads an app build for or keeps the stored one of.
 */
export async function uploadFreshBundles({
  projectRoot,
  platforms,
  platformsOnStoredBuild,
  bundleDir,
  buildSettings,
  baseFingerprints,
  projectIndex,
  teamId,
  effects,
}: {
  projectRoot: string;
  /** Every platform this run renders a fresh bundle for, uploaded or stored. */
  platforms: Platform[];
  /** Of those, the ones that keep their stored app build: only their gate facts are derived. */
  platformsOnStoredBuild: Platform[];
  /** `--bundle-dir`: use this prebuilt bundle directory instead of bundling. */
  bundleDir?: string;
  /** The config's `build` block, whose `env` and eas.json profile the bundler runs with. */
  buildSettings: BuildSettings;
  /** Per platform, the base fingerprint this run registers its binary under. */
  baseFingerprints: Partial<Record<Platform, string>>;
  projectIndex: number;
  teamId: string;
  effects: FreshBundleEffects;
}): Promise<Partial<Record<Platform, UploadedFreshBundle>>> {
  let bundles: Partial<Record<Platform, BundleResult>>;
  let gateMetadata: Partial<Record<Platform, GateMetadataInput>>;

  // No header of its own: bundling is a step in progress the bundling loop shows (a spinner in a
  // terminal, one plain line in a log), and a supplied bundle says so on its own line.
  //
  // A stored platform's gate facts are derived from its fresh bundle as the staged road derives
  // them (../commands/test/stagedRun): the sidecar's recorded ones for a supplied bundle, the
  // bundler's for a built one. An uploaded platform's come out of its binary, so it derives none.
  if (bundleDir !== undefined) {
    ({ results: bundles, gateMetadata } = await resolveSuppliedBundles({
      bundleDir,
      projectRoot,
      platformsToTest: platforms,
      baseFingerprints,
      gateMetadataFor: async (platform, _bundleResult, recorded) =>
        platformsOnStoredBuild.includes(platform) ? recorded : NO_BUNDLE_DERIVED_GATE_METADATA,
    }));
  } else {
    ({ results: bundles, gateMetadata } = await buildBundles({
      projectRoot,
      platformsToTest: platforms,
      buildSettings,
      effects: {
        bundleFor: effects.bundling.bundleFor,
        gateMetadataFor: async (root, platform, bundleResult) =>
          platformsOnStoredBuild.includes(platform)
            ? effects.bundling.gateMetadataFor(root, platform, bundleResult)
            : NO_BUNDLE_DERIVED_GATE_METADATA,
      },
    }));
  }

  refuseABundleWithNoStories(bundles);

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

    const storedBuildGateMetadata = platformsOnStoredBuild.includes(platform)
      ? gateMetadata[platform]
      : undefined;
    uploaded[platform] = {
      keys: platformKeys,
      bundleSizeMb: bundleResult.bundleSizeMb,
      moduleManifest: bundleResult.moduleManifest,
      ...(storedBuildGateMetadata ? { storedBuildGateMetadata } : {}),
    };
  }

  return uploaded;
}

export default uploadFreshBundles;

/**
 * A bundle whose module map counts no stories is refused before anything is uploaded: Storybook
 * was switched off by a variable the build never saw, and a run that photographed nothing would
 * read green. A bundle with no module map says nothing about its stories, and goes on.
 */
function refuseABundleWithNoStories(bundles: Partial<Record<Platform, BundleResult>>): void {
  const holdsNoStories = Object.values(bundles).some(
    (bundle) => bundle?.moduleManifest && countBundleStories(bundle.moduleManifest) === 0
  );
  if (holdsNoStories) throwError(renderBundleHoldsNoStories());
}
