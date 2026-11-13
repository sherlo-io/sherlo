/**
 * What each platform captures, read straight off the openBuild response for the test's Started row
 * (./startTheTest printTestStarted).
 */
import type { Platform } from '@sherlo/api-types';
import { DEVICES } from '@sherlo/shared';
import type { OpenBuildAnswer, PosedDiffScope } from '../../seams/serverCalls';
import type { PlatformCapture } from '../../render/testSteps';
import type { Config } from '../../types';
import {
  bundleStoryFiles,
  countBundleScenes,
  countBundleStories,
  countScenesIn,
  countStoriesIn,
  titledStoryFilesIn,
  type ValidatedModuleManifest,
} from './readModuleManifest';

/** A platform the server made no decision for (no `captureScope`) is left out, never invented. */
export function capturePerPlatform({
  openBuildReturn,
  moduleManifests,
  platformsToTest,
}: {
  openBuildReturn: OpenBuildAnswer;
  moduleManifests: Partial<Record<Platform, ValidatedModuleManifest>>;
  platformsToTest: Platform[];
}): PlatformCapture[] {
  const diffScopeInfo = openBuildReturn.build.diffScopeInfo;

  const capture: PlatformCapture[] = [];
  for (const platform of platformsToTest) {
    const captureScope = openBuildReturn.buildRun?.config?.[platform]?.captureScope;
    if (!captureScope) continue;

    const manifest = moduleManifests[platform];
    capture.push({
      platform,
      // INVERSION GUARD: full === true is "every story", regardless of the list.
      full: captureScope.full,
      // A project's first build that took only the stories the push named (./firstLook).
      ...(diffScopeInfo?.isFirstLook && !captureScope.full ? { firstLook: true } : {}),
      capturedStories: captureScope.full
        ? 0
        : manifest
          ? countStoriesIn(manifest, captureScope.storyFilePaths ?? [])
          : (captureScope.storyFilePaths ?? []).length,
      // A partial capture's scene files count as their scenes, off the same module map.
      capturedScenes:
        captureScope.full || !manifest
          ? 0
          : countScenesIn(manifest, captureScope.storyFilePaths ?? []),
      // The whole bundle's story set, counted the ONE canonical way.
      storiesInBundle: manifest ? countBundleStories(manifest) : undefined,
      scenesInBundle: manifest ? countBundleScenes(manifest) : undefined,
      // The server's own prose, verbatim - never the build-wide `fullCaptureTriggerReason`, which is
      // a machine code. The line prints it only for a full capture.
      reason: diffScopeInfo?.platforms?.[platform]?.reason,
      diffScope: (
        diffScopeInfo?.platforms?.[platform] as { diffScope?: PosedDiffScope } | undefined
      )?.diffScope,
      // A full capture takes every story file the bundle holds.
      storyFiles: captureScope.full
        ? manifest
          ? bundleStoryFiles(manifest)
          : []
        : (captureScope.storyFilePaths ?? []),
      newStoryFiles: captureScope.newStoryFilePaths ?? [],
      ...(manifest ? { storyTitles: titledStoryFilesIn(manifest) } : {}),
      // A partial capture takes exactly what a change reaches.
      changedStoryFiles: captureScope.full
        ? (captureScope.changedStoryFilePaths ?? [])
        : (captureScope.storyFilePaths ?? []),
    });
  }
  return capture;
}

/**
 * How many pictures the plan takes: each platform's stories and scenes, once on every device of
 * that platform. What the bundle could not count adds none.
 */
export function picturesInPlan(capture: PlatformCapture[], devices: Config['devices']): number {
  return capture.reduce((pictures, platformCapture) => {
    const screens = platformCapture.full
      ? (platformCapture.storiesInBundle ?? 0) + (platformCapture.scenesInBundle ?? 0)
      : platformCapture.capturedStories + (platformCapture.capturedScenes ?? 0);
    const devicesOfPlatform = devices.filter(
      ({ id }) => DEVICES[id]?.os === platformCapture.platform
    ).length;
    return pictures + screens * devicesOfPlatform;
  }, 0);
}
