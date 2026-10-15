import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { runPose } from '../pose';
import type { CommandPose } from '../../../seams/commandPose';
import { readPoseDocument } from '../readPose';
import { POSES_ROOT } from '../catalogue';
import { bundler, installBundler, posedBundler } from '../../../seams/bundler';

/**
 * A POSE CAN STATE A BUNDLE THAT CAME WITH NO MODULE MAP.
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
      const result = await bundler().bundleFor('/project', 'android', {});

      // Exactly what the real bundler yields when Metro is configured without Sherlo's wrapper -
      // no manifest at all, not an empty one.
      expect(result.moduleManifest).toBeUndefined();
    } finally {
      uninstall();
    }
  });

  it('a preview posed with no module map prints all stories, with no count', async () => {
    // The preview (`--dry-run`) is gone, so the bundle with no module map is posed on a staged
    // push: the catalogue's bare push, its bundle stated with `storyClosureKeys: null` and its new
    // test capturing every story.
    const stagedPush = poseFrom(path.join(POSES_ROOT, 'test', 'staged-reuses-no-wait.pose.json'));
    const { storyTitles: _noTitlesWithoutAMap, ...androidBundle } = stagedPush.bundles.android!;
    const pose: CommandPose = {
      ...stagedPush,
      bundles: { android: { ...androidBundle, storyClosureKeys: null } },
      api: stagedPush.api.map((scripted) =>
        scripted.call === 'openBuild'
          ? {
              ...scripted,
              answer: {
                ...scripted.answer,
                captureDecision: {
                  platforms: { android: { full: true, storyFilePaths: [], reason: null } },
                },
              },
            }
          : scripted
      ) as CommandPose['api'],
    };

    const { screen, refusals } = await runPose(pose);

    expect(refusals).toEqual([]);
    expect(screen).toContain('Started: all stories');
    // The degrade is a BARE "all stories" - no "all N stories in this bundle", because there was
    // no manifest to count against.
    expect(screen).not.toMatch(/would capture all \d+ stor/);
  });
});

/* ========================================================================== */

function poseFrom(posePath: string): CommandPose {
  return readPoseDocument(fs.readFileSync(posePath, 'utf8'));
}
