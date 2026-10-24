/**
 * What each platform captures, read straight off the openBuild response for the test's Started row
 * (./stagedRun printTestStarted).
 */
import type { Platform } from '@sherlo/api-types';
import type { OpenBuildAnswer } from '../../seams/serverCalls';
import type { PlatformCapture } from '../../render/testSteps';
import {
  bundleStoryFiles,
  countBundleStories,
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
      capturedStories: captureScope.full
        ? 0
        : manifest
          ? countStoriesIn(manifest, captureScope.storyFilePaths ?? [])
          : (captureScope.storyFilePaths ?? []).length,
      // The whole bundle's story set, counted the ONE canonical way.
      storiesInBundle: manifest ? countBundleStories(manifest) : undefined,
      // The server's own prose, verbatim - never the build-wide `fullCaptureTriggerReason`, which is
      // a machine code. The line prints it only for a full capture.
      reason: diffScopeInfo?.platforms?.[platform]?.reason,
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
