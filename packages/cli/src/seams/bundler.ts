/**
 * THE BUNDLER SEAM - what bundling the app answers.
 *
 *     live   - the project's own bundler, run for real (../commands/test/buildBundle).
 *     posed  - the pose's `bundles`, one entry per platform.
 *
 * The bundling loop that prints `🤖 Building android bundle...` and the line under it is the
 * shipped one either way (../commands/test/bundleAndPreview): it wraps its transcript around
 * exactly these two awaits, so a posed run prints that block in that order for the same reason a
 * real one does. What a pose replaces is the two answers, and nothing about the loop.
 */
import { Platform } from '@sherlo/api-types';
import type { GateMetadataInput } from '../helpers/fingerprint';
import {
  buildBundleForPlatform,
  buildGateMetadata,
  type BundleResult,
} from '../commands/test/buildBundle';

/** The two awaits the bundling loop wraps its transcript around. */
export type Bundler = {
  bundleFor: (projectRoot: string, platform: Platform) => Promise<BundleResult>;
  gateMetadataFor: (
    projectRoot: string,
    platform: Platform,
    bundleResult: BundleResult
  ) => Promise<GateMetadataInput>;
};

/** The shipped answer: the project's own bundler. */
export const liveBundler: Bundler = {
  bundleFor: (projectRoot, platform) => buildBundleForPlatform({ projectRoot, platform }),
  gateMetadataFor: (projectRoot, platform, bundleResult) =>
    buildGateMetadata({ projectRoot, platform, bundleResult }),
};

let installed: Bundler = liveBundler;

/** The bundler in force. */
export function bundler(): Bundler {
  return installed;
}

/** Install a bundler for the duration of one posed run; the returned function undoes it. */
export function installBundler(next: Bundler): () => void {
  const previous = installed;
  installed = next;
  return () => {
    installed = previous;
  };
}

/** One platform's bundle as the bundler reports it - the same fields the dry-run plan prints. */
export type PosedBundle = {
  bundlePath: string;
  bundleSizeMb: number;
  bundleFormat: 'plain-js' | 'hermes-bytecode';
  bundler: 'expo' | 'metro';
  assets: string[];
  /**
   * The story-file source paths the bundler's module manifest closes over - what the dry-run
   * plan's "of N stories" counts. `null` poses a bundle that came with no module map at all,
   * which is what a real bundle is when Metro is configured without Sherlo's wrapper: the plan
   * line then reads "all stories", with no count.
   */
  storyClosureKeys: string[] | null;
};

/**
 * The bundler a pose declares. A platform the pose says nothing about is REFUSED rather than
 * bundled for real: a posed run that quietly shelled out to the project's bundler would be
 * reporting on this machine's node_modules, not on the pose.
 *
 * A POSE AND THE TOOL DO NOT HAVE TO USE THE SAME WORD, and twice here they do not: a pose says
 * `metro` and `hermes-bytecode`, and the tool prints `rn` and `hbc`. The pose states the input in
 * the vocabulary a person writing one knows; the tool keeps its own word for it on screen, which
 * is what a real run prints.
 *
 * The story files a pose lists become the manifest's closure keys, which is the one thing the
 * dry-run road reads out of a bundle: what it would diff, and how many stories the bundle holds.
 */
export function posedBundler(bundles: Record<string, PosedBundle>): Bundler {
  return {
    bundleFor: async (_projectRoot, platform) => {
      const posed = bundles[platform];

      if (!posed) {
        throw new Error(
          `This pose says nothing about bundling \`${platform}\`, and the command it poses reached ` +
            'the bundler. Add a `bundles` entry for it.'
        );
      }

      return {
        bundlePath: posed.bundlePath,
        bundleFormat: posed.bundleFormat === 'hermes-bytecode' ? 'hbc' : 'plain-js',
        bundleSizeMb: posed.bundleSizeMb,
        bundleHash: 'the hash this pose does not state',
        assetsDest: posed.assets.length > 0 ? 'assets' : undefined,
        assetInventory: posed.assets,
        bundler: posed.bundler === 'metro' ? 'rn' : 'expo',
        // `null` poses a bundle that came with no module map at all - the same shape a real
        // bundle carries when Metro is configured without Sherlo's wrapper.
        moduleManifest:
          posed.storyClosureKeys === null ? undefined : moduleManifestOf(posed.storyClosureKeys),
      };
    },

    // The gate metadata a real bundle carries is derived from the binary identity of what was
    // built. Nothing a transcript shows reads it, so a pose does not state one and this answers
    // with the tool's own marker for "I know nothing about this bundle's identity".
    gateMetadataFor: async () => ({ derivedFrom: 'none' }),
  };
}

/* ========================================================================== */

/** The module manifest a posed bundle carries: its story closures, and nothing invented. */
function moduleManifestOf(storyClosureKeys: string[]): BundleResult['moduleManifest'] {
  const parsed = {
    version: 1,
    header: {},
    moduleHashes: {},
    storyClosures: Object.fromEntries(storyClosureKeys.map((key) => [key, []])),
  };

  return { raw: Buffer.from(JSON.stringify(parsed)), parsed };
}
