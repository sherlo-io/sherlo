/**
 * A BARE PUSH AGAINST A POSE - the staged gate answered by the pose, no binary read, and the screen
 * the shipped tool's own. Written as a skeleton in plan (epic legacy-road-closed, task
 * push-pose-staged-and-deadline); the worker fills the bodies and never renames a case.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { POSES_ROOT, renderPose } from '../catalogue';
import { runPose } from '../pose';
import { readPoseDocument, type CommandPose } from '../readPose';
import { EXIT_NATIVE_NEEDED } from '../../test/constants';

/** One catalogued `test/*.pose.json`, read the same way the catalogue itself reads it. */
function stagedPose(name: string) {
  const posePath = path.join(POSES_ROOT, 'test', `${name}.pose.json`);
  return { posePath, document: readPoseDocument(fs.readFileSync(posePath, 'utf8')) };
}

/**
 * The android platform's story count the catalogued base pose's bundle carries - never a literal.
 *
 * `storyClosureKeys` became optional when a pose gained the ability to state a bundle that came
 * with NO module map at all (epic diff-scope-closure, task pose-states-no-module-map), so the walk
 * to the count is optional the whole way down. A bundle with no map counts zero stories here, which
 * is the same answer this returned for a platform the pose does not state at all.
 */
function androidStoryCount(document: CommandPose): number {
  return document.bundles.android?.storyClosureKeys?.length ?? 0;
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
    expect(screen).toContain(
      'reason=the registered base still matches this commit - running JS-only'
    );
    expect(screen).toContain('🔗 Review:');
    expect(exitCode).toBe(0);
  });

  it('a staged gate that answers unregistered prints native-needed=true and exits with the native-needed code', async () => {
    const { document } = stagedPose('staged-needs-native');
    const { screen, exitCode, refusals } = await runPose(document);

    expect(refusals).toEqual([]);
    expect(screen).toContain('native-needed=true');
    expect(exitCode).toBe(EXIT_NATIVE_NEEDED);
  });

  it('a dry run against a pose prints native-needed and the base fingerprint and opens nothing', async () => {
    const { document } = stagedPose('staged-no-base');
    const { screen, exitCode, refusals } = await runPose(document);

    expect(refusals).toEqual([]);
    expect(screen).toContain('native-needed=true');
    expect(screen).toContain('base-fingerprint=');
    // Nothing was opened: the gate refused before a single byte was bundled or uploaded.
    expect(screen).not.toContain('Bundling for staged upload');
    expect(screen).not.toContain('🔗 Review:');
    expect(exitCode).toBe(EXIT_NATIVE_NEEDED);
  });

  it('a posed bare push whose openBuild answer states a full capture prints the capture plan and the Diff Scope line a real one prints', async () => {
    const { document } = stagedPose('staged-borrows-the-base');
    const { screen, refusals } = await runPose(document);
    const M = androidStoryCount(document);

    expect(refusals).toEqual([]);
    expect(screen).toContain('📸 Capture plan');
    expect(screen).toContain(`capturing all ${M} stories in this bundle`);
    expect(screen).toContain(
      'why: no main branch set for this project - every build captures every story'
    );
    expect(screen).toContain(
      `Diff Scope: capturing all ${M} stories: no main branch set for this project - every build captures every story`
    );
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
    expect(screen).not.toContain('📸 Capture plan');
    expect(screen).not.toContain('Diff Scope:');
    expect(screen).toContain('🔗 Review:');
  });
});
