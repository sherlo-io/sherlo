/**
 * A PUSH WITH NO WAIT, read off two catalogue poses: what the pose scripts and what its run prints.
 * They sit apart from the catalogue law (./catalogue.test.ts) so each file keeps to its five seconds.
 */
import fs from 'fs';
import { describe, expect, it, vi } from 'vitest';
import { catalogue } from '../catalogue';
import { runPose } from '../pose';
import { readPoseDocument } from '../readPose';
import type { CommandPose } from '../../../seams/commandPose';
import type { PosedCaptureDecision } from '../../../seams/serverCalls';

/**
 * A POSED PUSH FINGERPRINTS THE PROJECT, and the fingerprint asks `npx` about the project's native
 * modules - a real process, 60 to 130 ms each, on a scratch folder that has no such modules. In
 * that folder the ask fails and the fingerprint takes its no-modules road, so it fails here at
 * once, with the same answer and none of the wait. Every other command still runs for real.
 */
vi.mock('../../../helpers/runShellCommand', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../helpers/runShellCommand')>();

  return {
    default: (...args: Parameters<typeof original.default>) =>
      String(args[0].command).startsWith('npx ')
        ? Promise.reject(new Error('npx is not run by the pose catalogue'))
        : original.default(...args),
  };
});

describe('a push with no wait', () => {
  it('a staged push that closed at open, with no wait, ends on Nothing needed capturing and prints no link', async () => {
    // Every platform is a partial capture of no story, so the server closed the test at open. The
    // run did not wait, so its one status read is the bypass closer's (fetchServerBypassReason),
    // and that read is answered only when its `with: { buildIndex }` is the test the push opened.
    const pose = poseNamed('test/staged-nothing-to-capture');
    const openBuild = pose.api.find(({ call }) => call === 'openBuild');
    const statusRead = pose.api.find(({ call }) => call === 'getBuildStatus');

    expect(pose.argv).not.toContain('--wait');
    const decision = (openBuild?.answer as { captureDecision: PosedCaptureDecision })
      .captureDecision;
    for (const platform of Object.values(decision.platforms)) {
      expect(platform).toMatchObject({ full: false, storyFilePaths: [] });
    }
    expect(statusRead?.with).toEqual({
      buildIndex: (openBuild?.answer as { buildIndex: number }).buildIndex,
    });

    const { screen, exitCode, refusals, unusedCalls } = await runPose(pose);

    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
    // The finished step the tool prints for a test with nothing to capture is its last line.
    expect(screen.trimEnd().split('\n').pop()).toContain('Finished: nothing to test');
    expect(screen).not.toContain('🔗');
    expect(exitCode).toBe(0);
  });

  it('a bare push with no wait opens the test, prints its address and exits 0 with no status read', async () => {
    const pose = poseNamed('test/staged-reuses-no-wait');

    expect(pose.argv).not.toContain('--wait');
    // A status read the pose does not script would be refused, so no refusal is no status read.
    expect(pose.api.map(({ call }) => call)).not.toContain('getBuildStatus');

    const { screen, exitCode, refusals, unusedCalls } = await runPose(pose);

    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
    expect(screen).toContain('🔗 Review:');
    expect(exitCode).toBe(0);
  });
});

/** The catalogue pose at `<folder>/<name>`, read as the catalogue reads it. */
function poseNamed(name: string): CommandPose {
  const entry = catalogue().find((pose) => pose.posePath.endsWith(`${name}.pose.json`));
  if (!entry) throw new Error(`the catalogue has no pose ${name}`);
  return readPoseDocument(fs.readFileSync(entry.posePath, 'utf8'));
}
