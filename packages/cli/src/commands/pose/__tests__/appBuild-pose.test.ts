/**
 * THE APP BUILDER SEAM, posed - `sherlo test` builds a platform the gate refused and `sherlo build`
 * builds into the local build cache, answered from the pose's `appBuild` (epic
 * sherlo-test-builds-apps). Each committed build pose runs with no refusal and no unused call, so
 * its screen is the tool's own road and not a pose that fell short of it.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { POSES_ROOT } from '../catalogue';
import { runPose } from '../pose';
import { readPoseDocument } from '../readPose';

const BUILD_POSES = [
  ...fs
    .readdirSync(path.join(POSES_ROOT, 'test'))
    .filter((name) => name.startsWith('build-') && name.endsWith('.pose.json'))
    .map((name) => path.join('test', name)),
  ...['build', 'eas-build-on-complete'].flatMap((folder) =>
    fs
      .readdirSync(path.join(POSES_ROOT, folder))
      .filter((name) => name.endsWith('.pose.json'))
      .map((name) => path.join(folder, name))
  ),
  // The pushes take their app build from the local build cache (operator decision 2026-10-07:
  // `sherlo test` takes no `--android`/`--ios`), and a Sherlo 2 command line that still passes one
  // is refused.
  ...[
    'push-android-first-build-review-required',
    'push-android-same-binary-again-no-changes',
    'push-android-wait-names-the-screens',
    'wait-runs-out',
    'refusal-binary-path-flag-gone',
  ].map((name) => path.join('test', `${name}.pose.json`)),
];

describe('the app build poses', () => {
  it.each(BUILD_POSES)('%s runs with no refusal and no unused call', async (posePath) => {
    const pose = readPoseDocument(fs.readFileSync(path.join(POSES_ROOT, posePath), 'utf8'));

    const { screen, refusals, unusedCalls } = await runPose(pose);

    if (process.env.PRINT_POSE_SCREENS === '1' || refusals.length > 0 || unusedCalls.length > 0) {
      console.log(`---- ${posePath}\n${screen}`);
    }
    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
  });
});
