/**
 * The line of each scene in `sherlo capture --all-scenes` and what the run remembers between
 * scenes: a cause repeated by the next scene warns once, and stops the run only when asked to.
 */
import { describe, expect, it } from 'vitest';
import { renderAllScenesSummary } from '../capturedAllScenes';
import { lineAfterScene } from '../lineAfterScene';
import { outcomeOf } from '../sceneOutcome';
import { renderSceneRunLine } from '../sceneRunLine';

const OFFLINE_CHECK = { method: 'GET', url: 'https://clients3.google.com/generate_204' };
const NEVER_REACHED = { kind: 'never-reached', ready: 'chat.header', unanswered: [OFFLINE_CHECK] };

describe('the line a scene prints in a run of every scene', () => {
  it('reads the times and the refused count of a scene that came up', () => {
    const { line } = lineAfterScene(
      'kindred--chat',
      { kind: 'scene', bootMs: 2000, settled: { ms: 900 }, reached: { ms: 1500 } },
      3,
      false,
      { warned: false }
    );

    expect(line).toMatchObject({ launchMs: 2000, settledMs: 900, readyMs: 1500, refused: 0 });
  });

  it('warns once when the next scene never got ready for the same cause', () => {
    const first = lineAfterScene('a', NEVER_REACHED, 2, false, { warned: false });
    const second = lineAfterScene('b', NEVER_REACHED, 1, false, first.memory);
    const third = lineAfterScene('c', NEVER_REACHED, 0, false, second.memory);

    expect(first.line.sameCause).toBeUndefined();
    expect(second.line.sameCause).toMatchObject({ remaining: 1 });
    expect(third.line.sameCause).toBeUndefined();
  });

  it('stops the run at a repeated cause only when asked to', () => {
    const first = lineAfterScene('a', NEVER_REACHED, 2, true, { warned: false });
    const second = lineAfterScene('b', NEVER_REACHED, 1, true, first.memory);

    expect(first.stopping).toBe(false);
    expect(second.stopping).toBe(true);
    expect(second.line.sameCause).toMatchObject({ stopped: true });
  });
});

describe('the four outcomes a run counts scenes by', () => {
  it('counts an unknown answer kind as failed', () => {
    expect(outcomeOf('scene')).toBe('captured');
    expect(outcomeOf('never-settled')).toBe('never-settled');
    expect(outcomeOf('never-reached')).toBe('never-reached');
    expect(outcomeOf('crashed-at-boot')).toBe('failed');
  });
});

describe('the line one scene prints as it finishes', () => {
  it('names the ready view a scene never showed', () => {
    const [line] = renderSceneRunLine({
      sceneId: 'a',
      ending: 'never-reached',
      ready: 'x',
      refused: 2,
    });

    expect(line).toContain('never reached - no view x showed');
    expect(line).toContain('2 refused');
  });
});

describe('the closing summary of a run of every scene', () => {
  it('counts the scenes and names the folder', () => {
    const lines = renderAllScenesSummary({
      folder: '.sherlo/captures',
      captured: 2,
      neverSettled: 1,
      neverReached: 0,
      failed: 0,
    });

    expect(lines[1]).toBe('3 scenes: 2 captured, 1 never settled, 0 never reached, 0 failed');
    expect(lines[2]).toContain('.sherlo/captures');
  });
});
