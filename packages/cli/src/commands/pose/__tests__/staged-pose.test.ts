/**
 * A BARE PUSH AGAINST A POSE - the staged gate answered by the pose, no binary read, and the screen
 * the shipped tool's own.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { POSES_ROOT, renderPose } from '../catalogue';
import { runPose } from '../pose';
import type { CommandPose } from '../../../seams/commandPose';
import { readPoseDocument } from '../readPose';

/** One catalogued `test/*.pose.json`, read the same way the catalogue itself reads it. */
function stagedPose(name: string) {
  const posePath = path.join(POSES_ROOT, 'test', `${name}.pose.json`);
  return { posePath, document: readPoseDocument(fs.readFileSync(posePath, 'utf8')) };
}

/**
 * The android platform's story count the catalogued base pose's bundle carries - never a literal.
 *
 * `storyClosureKeys` became optional when a pose gained the ability to state a bundle that came
 * with NO module map at all, so the walk
 * to the count is optional the whole way down. A bundle with no map counts zero stories here, which
 * is the same answer this returned for a platform the pose does not state at all.
 */
/** The stories the pose's Android bundle holds: each story file's own count, one where it names none. */
function androidStoryCount(document: CommandPose): number {
  const bundle = document.bundles.android;
  return (bundle?.storyClosureKeys ?? []).reduce(
    (total, file) => total + (bundle?.storyCounts?.[file] ?? 1),
    0
  );
}

describe('a bare push is posable', () => {
  it("a bare push runs against a pose: the staged gate is answered by the pose, no binary is read, and the screen is the shipped tool's own", async () => {
    const { posePath, document } = stagedPose('staged-borrows-the-base');
    const { refusals } = await runPose(document);

    // A refusal is what a read of the real machine would look like against a pose that states
    // no `push` - this pose states none, so an empty list here IS "no binary was read".
    expect(refusals).toEqual([]);

    // The catalogue's own committed bytes ARE the shipped tool's screen for this pose (the
    // catalogue law ratchets them); reading them back through the exact same renderer ties this
    // case to that evidence instead of a second, hand-written expectation of the same screen.
    const screenPath = path.join(POSES_ROOT, 'test', 'staged-borrows-the-base.txt');
    expect(await renderPose(posePath)).toBe(fs.readFileSync(screenPath, 'utf8'));
  });

  it('a staged gate that answers registered prints the borrowed base and opens a build', async () => {
    const { document } = stagedPose('staged-borrows-the-base');
    const { screen, exitCode, refusals } = await runPose(document);

    expect(refusals).toEqual([]);
    expect(screen).not.toContain('native-needed=');
    expect(screen).not.toContain('running JS-only');
    expect(screen).toContain('🔗 Review:');
    expect(exitCode).toBe(0);
  });

  it('a posed bare push whose openBuild answer states a full capture prints the capture plan a real one prints', async () => {
    const { document } = stagedPose('staged-borrows-the-base');
    const { screen, refusals } = await runPose(document);
    const M = androidStoryCount(document);

    expect(refusals).toEqual([]);
    // The plan is one count on the test's row; a full capture for want of a main branch drops that
    // reason from the row, because the branching-off warning under it says so. No plan step of its own.
    expect(screen).toContain(`all ${M} stories on 1 device (Pixel 7)\n`);
    expect(screen).not.toContain('no main branch is set');
    expect(screen).toContain('! Branching is off: this project has no main branch.');
    expect(screen).not.toContain('Planned the capture');
    // The one-line "Diff Scope:" summary repeated the plan in internal words, and is gone.
    expect(screen).not.toContain('Diff Scope');
  });

  it('a posed bare push whose openBuild answer states no capture decision prints no plan, as it does today', async () => {
    const { document } = stagedPose('staged-borrows-the-base');
    // The SAME scripted run, minus the one fact this test is about - so the only thing that could
    // change the screen is the field this test removes.
    const withoutDecision: CommandPose = JSON.parse(JSON.stringify(document));
    const openBuildCall = withoutDecision.api.find((call) => call.call === 'openBuild');
    const answer = openBuildCall?.answer as { captureDecision?: unknown } | undefined;
    delete answer?.captureDecision;

    const { screen, refusals } = await runPose(withoutDecision);

    expect(refusals).toEqual([]);
    expect(screen).not.toContain('stories on');
    expect(screen).toContain('🔗 Review:');
  });
});
