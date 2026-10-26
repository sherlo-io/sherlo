/**
 * What `sherlo capture --scene` prints for a scene whose play could not go on: the words name what
 * the missed step looked for. Colour is off; the bytes are pinned in renderLayerLiterals.test.ts.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderCapturedScene } from '../capturedScene';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

function missedTap(tap: string): string {
  return renderCapturedScene({
    kind: 'play-target-missing',
    sceneId: 'inbox--full',
    route: ['SignIn'],
    done: [],
    missing: { tap },
    limitMs: 10_000,
  }).join('\n');
}

describe('a scene whose app started over while it was captured', () => {
  const restarted = (restarts: number) =>
    renderCapturedScene({ kind: 'restarted-mid-capture', sceneId: 'inbox--full', restarts });

  it('a scene whose app started over prints the approved line, with 1 time when once, and the hint', () => {
    expect(restarted(3)[0]).toContain(
      'Scene inbox--full never finished: the app started over 3 times while Sherlo captured it'
    );
    expect(restarted(1)[0]).toContain(
      'Scene inbox--full never finished: the app started over 1 time while Sherlo captured it'
    );
    expect(restarted(1)).toContain(
      '  Add --json or --logs to see the log lines of each restart and what the bundler saw before it.'
    );
  });
});

describe('a scene whose play could not go on', () => {
  it('a missed tap by test id names the testID', () => {
    expect(missedTap('Inbox')).toContain('tap Inbox found no view with that testID within 10s.');
  });

  it('a missed tap by text names the text, not a testID', () => {
    const printed = missedTap('text "Row"');

    expect(printed).toContain('tap Row found no view with that text within 10s.');
    expect(printed).not.toContain('testID');
  });
});
