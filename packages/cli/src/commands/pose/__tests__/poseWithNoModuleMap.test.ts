import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { runPose } from '../pose';
import { readPoseDocument, type CommandPose } from '../readPose';
import { POSES_ROOT } from '../catalogue';
import { bundler, installBundler, posedBundler } from '../../../seams/bundler';

/**
 * A POSE CAN STATE A BUNDLE THAT CAME WITH NO MODULE MAP - written as a skeleton in plan (epic
 * diff-scope-closure, task pose-states-no-module-map). The worker fills the bodies and never renames
 * a case.
 *
 * The posed bundler always made a map from `storyClosureKeys`, so a pose could not show what the
 * tool prints when Metro was configured without Sherlo's wrapper: "all stories", with no count.
 */
describe('a pose can state a bundle with no module map', () => {
  it('a posed bundle whose storyClosureKeys is null comes with no module map', async () => {
    const uninstall = installBundler(
      posedBundler({
        android: {
          bundlePath: 'node_modules/.cache/sherlo/bundle.android.js',
          bundleSizeMb: 4.29,
          bundleFormat: 'plain-js',
          bundler: 'metro',
          assets: [],
          storyClosureKeys: null,
        },
      })
    );

    try {
      const result = await bundler().bundleFor('/project', 'android');

      // Exactly what the real bundler yields when Metro is configured without Sherlo's wrapper -
      // no manifest at all, not an empty one.
      expect(result.moduleManifest).toBeUndefined();
    } finally {
      uninstall();
    }
  });

  it('a preview posed with no module map prints all stories, with no count', async () => {
    const pose = poseFrom(path.join(POSES_ROOT, 'test', 'dry-run-no-module-map.pose.json'));

    const { screen } = await runPose(pose);

    expect(screen).toContain('would capture all stories');
    // The degrade is a BARE "all stories" - no "all N stories in this bundle", because there was
    // no manifest to count against.
    expect(screen).not.toMatch(/would capture all \d+ stor/);
  });
});

/* ========================================================================== */

function poseFrom(posePath: string): CommandPose {
  return readPoseDocument(fs.readFileSync(posePath, 'utf8'));
}
