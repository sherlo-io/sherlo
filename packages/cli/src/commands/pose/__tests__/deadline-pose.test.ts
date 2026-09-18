/**
 * A WAIT THAT RUNS OUT AGAINST A POSE - the posed clock passes the deadline while the build is
 * still running, and the tool prints its deadline closer and exits 3. Written as a skeleton in
 * plan (epic legacy-road-closed, task push-pose-staged-and-deadline); the worker fills the bodies
 * and never renames a case.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { POSES_ROOT } from '../catalogue';
import { runPose } from '../pose';
import { readPoseDocument } from '../readPose';
import { EXIT_TIMEOUT } from '../../../helpers/exitCodes';

function waitRunsOutPose() {
  const posePath = path.join(POSES_ROOT, 'test', 'wait-runs-out.pose.json');
  return readPoseDocument(fs.readFileSync(posePath, 'utf8'));
}

describe('a wait that runs out is posable', () => {
  it('a wait whose deadline passes before the build finishes prints the deadline closer and exits 3', async () => {
    const { screen, exitCode, refusals } = await runPose(waitRunsOutPose());

    expect(refusals).toEqual([]);
    expect(screen).toContain('⏰ Timeout reached after 1 minutes.');
    expect(exitCode).toBe(EXIT_TIMEOUT);
  });

  it('a getBuildStatus answer of running is read as many times as the posed clock allows and no more', async () => {
    const startedAt = Date.now();
    const { refusals, unusedCalls } = await runPose(waitRunsOutPose());
    const elapsedMs = Date.now() - startedAt;

    // The pose scripts exactly one `getBuildStatus` answer, after the three calls that open the
    // build. Every scripted call consumed (`unusedCalls` empty) with none refused means the wait
    // polled it exactly once before its clock - not the wall clock - passed the deadline: never a
    // second read, and never a read the pose could not answer.
    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);

    // No timer was awaited: a posed wait's sleep resolves at once, so a run that actually sat out
    // a real 15-second poll interval (or the wait's own deadline) would blow this budget by orders
    // of magnitude.
    expect(elapsedMs).toBeLessThan(1000);
  });
});
