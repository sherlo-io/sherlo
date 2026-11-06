/**
 * The line of each scene in `sherlo capture --all-scenes` and what the run remembers between
 * scenes: a cause repeated by three scenes in a row warns once, and stops the run only when asked to.
 */
import { describe, expect, it } from 'vitest';
import { renderAllScenesSummary } from '../capturedAllScenes';
import { lineAfterScene } from '../lineAfterScene';
import { outcomeOf } from '../sceneOutcome';
import { renderSceneRunLine } from '../sceneRunLine';

const OFFLINE_CHECK = { method: 'GET', url: 'https://clients3.google.com/generate_204' };
const NEVER_REACHED = { kind: 'never-reached', ready: 'chat.header', unanswered: [OFFLINE_CHECK] };

const CAUSE = 'ready view never showed on Chat';
const START = { count: 0, warned: false };

describe('the line a scene prints in a run of every scene', () => {
  it('reads the times and the refused count of a scene that came up', () => {
    const { line } = lineAfterScene(
      'kindred--chat',
      { kind: 'scene', bootMs: 2000, settled: { ms: 900 }, reached: { ms: 1500 } },
      undefined,
      3,
      false,
      START
    );

    expect(line).toMatchObject({ launchMs: 2000, settledMs: 900, readyMs: 1500, refused: 0 });
  });

  it('warns once when the second scene in a row never got ready for the same cause', () => {
    const first = lineAfterScene('a', NEVER_REACHED, CAUSE, 3, false, START);
    const second = lineAfterScene('b', NEVER_REACHED, CAUSE, 2, false, first.streak);
    const third = lineAfterScene('c', NEVER_REACHED, CAUSE, 1, false, second.streak);

    expect(first.line.sameCause).toBeUndefined();
    expect(second.line.sameCause).toMatchObject({ remaining: 2 });
    expect(third.line.sameCause).toBeUndefined();
  });

  it('stops the run at a repeated cause only when asked to', () => {
    const first = lineAfterScene('a', NEVER_REACHED, CAUSE, 3, true, START);
    const second = lineAfterScene('b', NEVER_REACHED, CAUSE, 2, true, first.streak);
    const notAsked = lineAfterScene('b', NEVER_REACHED, CAUSE, 2, false, first.streak);

    expect(first.stopping).toBe(false);
    expect(second.stopping).toBe(true);
    expect(second.line.sameCause).toMatchObject({ stopped: true });
    expect(notAsked.stopping).toBe(false);
  });

  it('prints the paste hint only when the shared cause brings a fake to paste', () => {
    const withFake = lineAfterScene('c', NEVER_REACHED, CAUSE, 1, false, {
      cause: CAUSE,
      count: 2,
      warned: false,
    });
    const noFake = lineAfterScene('c', { kind: 'never-reached' }, CAUSE, 1, false, {
      cause: CAUSE,
      count: 2,
      warned: false,
    });

    expect(renderSceneRunLine(withFake.line).join('\n')).toContain('Paste it once');
    expect(noFake.line.sameCause).toMatchObject({ cause: CAUSE });
    expect(renderSceneRunLine(noFake.line).join('\n')).not.toContain('Paste it once');
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
