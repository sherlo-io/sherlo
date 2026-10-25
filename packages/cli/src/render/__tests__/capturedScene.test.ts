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
