import type { Platform } from '@sherlo/api-types';
import { readBuildSettings } from '../commands/test/appBuild/buildSettings';
import { stageTheModuleMap } from '../commands/test/stageTheModuleMap';
import { PLATFORM_LABEL } from '../constants';
import { bundler } from '../seams/bundler';
import type { CommandParams } from '../types';
import logWarning from './logWarning';

/**
 * THE MODULE MAP OF AN APP BUILT HERE WITH NO FINGERPRINT. Such an app is tested with the JS bundle
 * built into it, so no fresh bundle is made for it and no Sherlo bundler step wrote a module map -
 * and a run opened without one is planned by the runner from its fallback of 300 screens, with five
 * phones started at once. So one extra bundling pass writes the map, and only the map is staged: the
 * bundle itself is thrown away. The key goes into that platform's `manifestS3Key` of the build run
 * config, as on every other road.
 *
 * Says once why the fingerprint was skipped, as the push always has.
 *
 * BAIL-OPEN, as on every road: a pass that fails or a map that cannot be staged opens the build
 * without the key, with a warning, and never fails the test.
 */
export async function stageModuleMapsOfBuiltApps({
  platforms,
  whyNoFingerprint,
  buildRunConfig,
  commandParams,
}: {
  /** The platforms built here with no fingerprint. */
  platforms: Platform[];
  /** Why a platform has no fingerprint, worded as the push words it. */
  whyNoFingerprint: (platform: Platform) => string;
  /** The config the open build carries; each staged key is written into its platform's entry. */
  buildRunConfig: Partial<Record<Platform, { manifestS3Key?: string }>>;
  commandParams: CommandParams;
}): Promise<void> {
  if (platforms.length === 0) return;

  const { projectRoot } = commandParams;
  const { token: ticket, teamId, projectIndex } = commandParams.credential;
  const buildSettings = readBuildSettings(commandParams);

  logWarning({
    message:
      `Fingerprint skipped - ${whyNoFingerprint(platforms[0])}. The app ` +
      'this run built is tested with its own JS bundle, and it is not kept in the build cache.',
  });

  for (const platform of platforms) {
    const platformConfig = buildRunConfig[platform];
    if (!platformConfig) continue;

    try {
      const { moduleManifest } = await bundler().bundleFor(projectRoot, platform, buildSettings);
      if (!moduleManifest) {
        logWarning({
          message: `The ${PLATFORM_LABEL[platform]} bundle holds no module manifest; continuing without it.`,
        });
      }
      const manifestS3Key = await stageTheModuleMap({
        moduleMap: moduleManifest,
        platform,
        ticket,
        teamId,
        projectIndex,
      });
      if (manifestS3Key) platformConfig.manifestS3Key = manifestS3Key;
    } catch (error) {
      logWarning({
        message:
          `Could not make the ${PLATFORM_LABEL[platform]} module manifest ` +
          `(${error instanceof Error ? error.message : String(error)}); continuing without it.`,
      });
    }
  }
}
