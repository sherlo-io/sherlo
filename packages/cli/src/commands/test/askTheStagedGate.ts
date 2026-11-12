/**
 * The staged road's questions to the service's gate, one call per tested platform
 * (see ./stagedRun for when it asks, and why it asks twice).
 */
import type { Device, GateMetadata, Platform } from '@sherlo/api-types';
import { handleClientError, reporting } from '../../helpers';
import type { GateMetadataInput } from '../../helpers/fingerprint';
import { serverCalls } from '../../seams/serverCalls';
import { type BuildSettings, buildSettingsDigest } from './appBuild/buildSettings';
import type { StagedGateRefusal } from './stagedGateRefusal';

/** What the gate answered for every platform: the ones it refused, and the test each stored app build came from. */
export type GateAnswers = {
  refusals: StagedGateRefusal[];
  /** Per platform, the test its stored app build was built in - absent where nothing is stored. */
  storedBuildIndexOf: Partial<Record<Platform, number>>;
  /** Per platform, the branch's last test that ran this very code - absent where there is none. */
  sameCodeBuildIndexOf: Partial<Record<Platform, number>>;
};

/**
 * Ask the staged gate about every platform and return the ones that answered
 * anything other than "fast". checkStagedGate is per platform, and a single
 * non-fast platform takes the whole run off the fast path.
 *
 * `gateMetadata` is a per-platform lookup rather than a value because the two
 * callers know DIFFERENT things: the pre-bundle probe knows only that it knows
 * nothing, while the post-bundle check carries the real bundle-derived identity.
 * Only the post-bundle check can name the bundle, so only it passes `sameCode`.
 */
export async function checkGate({
  token,
  platformsToTest,
  baseFingerprints,
  buildSettings,
  gateMetadata,
  sameCode,
  projectIndex,
  teamId,
}: {
  /** The token the push spends - the seam builds its own sdk client from it (../../seams/serverCalls). */
  token: string;
  platformsToTest: Platform[];
  /** Each platform's own base fingerprint, which its stored app build is looked up by. */
  baseFingerprints: Partial<Record<Platform, string>>;
  /** The build settings, whose digest a stored app build is looked up by beside its fingerprint. */
  buildSettings: BuildSettings;
  gateMetadata: (platform: Platform) => GateMetadataInput;
  /** The branch and each platform's bundle hash, which the service compares with the branch's last test. */
  sameCode?: {
    gitBranch: string;
    bundleHashOf: (platform: Platform) => string | undefined;
    devicesOf: (platform: Platform) => Device[] | undefined;
    /** The test scope (the config's include and exclude): a push that only widens it must not share the earlier test. */
    include?: string[];
    exclude?: string[];
  };
  projectIndex: number;
  teamId: string;
}): Promise<GateAnswers> {
  reporting.addBreadcrumb({
    category: 'api',
    message: 'Calling checkStagedGate API',
    data: { teamId, projectIndex, platforms: platformsToTest },
    level: 'info',
  });

  const refusals: StagedGateRefusal[] = [];
  const storedBuildIndexOf: GateAnswers['storedBuildIndexOf'] = {};
  const sameCodeBuildIndexOf: GateAnswers['sameCodeBuildIndexOf'] = {};

  try {
    for (const platform of platformsToTest) {
      const bundleHash = sameCode?.bundleHashOf(platform);

      // Through the server seam, so a posed run answers the gate from its pose (the tester's
      // staged storyline) and never reaches the network.
      const { outcome, diff, storedBase, storedBuildIndex, sameCodeBuildIndex } =
        await serverCalls().checkStagedGate({
          token,
          baseFingerprint: baseFingerprints[platform] ?? '',
          buildSettingsDigest: buildSettingsDigest(buildSettings, platform),
          gateMetadata: gateMetadata(platform) as GateMetadata,
          platform,
          projectIndex,
          teamId,
          ...(sameCode && bundleHash
            ? {
                bundleHash,
                gitBranch: sameCode.gitBranch,
                devices: sameCode.devicesOf(platform),
                // A config with no list is an empty list: deleting one widens the scope.
                include: sameCode.include ?? [],
                exclude: sameCode.exclude ?? [],
              }
            : {}),
        });

      if (storedBuildIndex !== undefined) storedBuildIndexOf[platform] = storedBuildIndex;
      if (typeof sameCodeBuildIndex === 'number') {
        sameCodeBuildIndexOf[platform] = sameCodeBuildIndex;
      }
      if (outcome !== 'fast') {
        refusals.push({ outcome, platform, diff, ...(storedBase ? { storedBase } : {}) });
      }
    }
  } catch (error) {
    handleClientError(error, token); // always throws (bad token, network, ...)
    throw error; // unreachable - satisfies control flow / typing
  }

  return { refusals, storedBuildIndexOf, sameCodeBuildIndexOf };
}
