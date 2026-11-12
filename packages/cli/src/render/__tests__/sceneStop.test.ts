/**
 * Where a scene that never got ready stopped, and each block of lines that tells it. Colour is off.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { answerFindingLines } from '../answerFindingLines';
import { blankScreenLines } from '../blankScreenLines';
import { endedEarlyLines } from '../endedEarlyLines';
import { explainsTheStop } from '../explainsTheStop';
import { findingLine } from '../findingLine';
import { letThroughLines } from '../letThroughLines';
import { loggedErrorLines } from '../loggedErrorLines';
import { mockNotAppliedLines } from '../mockNotAppliedLines';
import { PARTIAL_READ } from '../partialRead';
import { partialFieldLines } from '../partialFieldLines';
import { phoneNotAppliedLines } from '../phoneNotAppliedLines';
import { quoted } from '../quotedText';
import { neverReachedLines } from '../sceneDiagnosis';
import type { SceneScreen } from '../sceneStop';
import { screenLines } from '../screenLines';
import { sinceLastRunLines } from '../sinceLastRunLines';
import { threwLines } from '../threwLines';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

const NEVER_REACHED = {
  kind: 'never-reached' as const,
  sceneId: 's',
  ready: 'r',
  stayedOn: ['Home'],
};

const EMPTY_SCREEN: SceneScreen = { views: 0, words: [] };

describe('the stop the record carries for a scene that never got ready', () => {
  it('guesses sign-in only when nothing else in the record explains the stop', () => {
    expect(explainsTheStop({})).toBe(false);
    expect(explainsTheStop({ stop: { kind: 'blank', screen: EMPTY_SCREEN } })).toBe(true);
    expect(explainsTheStop({ lastRun: { ending: 'captured', route: [], refused: 0 } })).toBe(false);
  });

  it('prints the blank-screen next step for a blank stop, and for a covered one that drew nothing', () => {
    const blank = neverReachedLines({
      ...NEVER_REACHED,
      stop: { kind: 'blank', screen: EMPTY_SCREEN },
    });
    const covered = neverReachedLines({
      ...NEVER_REACHED,
      stop: {
        kind: 'covered',
        early: { stuckOn: 'sign-in', afterMs: 4000 },
        screen: EMPTY_SCREEN,
      },
    });
    const other = neverReachedLines({
      ...NEVER_REACHED,
      stop: { kind: 'on-another-screen', screen: { views: 2, words: ['Hi'] } },
    });

    expect(blank).toEqual(['  The screen drew no views.', ...blankScreenLines('s')]);
    expect(covered.slice(-5)).toEqual(blankScreenLines('s'));
    expect(other).toEqual(screenLines({ views: 2, words: ['Hi'] }));
  });
});

describe('the blocks of lines under the ending of a scene', () => {
  it('say nothing when their case does not apply', () => {
    expect(phoneNotAppliedLines({})).toEqual([]);
    expect(endedEarlyLines(undefined)).toEqual([]);
    expect(threwLines(undefined, undefined)).toEqual([]);
    expect(sinceLastRunLines(undefined, { ending: 'captured', route: [], refused: 0 })).toEqual([]);
    expect(mockNotAppliedLines([])).toEqual([]);
    expect(letThroughLines([])).toEqual([]);
    expect(answerFindingLines([])).toEqual([]);
    expect(partialFieldLines(undefined)).toEqual([]);
    expect(loggedErrorLines(undefined)).toEqual([]);
  });

  it('name the module fakes that did not apply', () => {
    expect(
      mockNotAppliedLines([{ module: 'expo-camera', why: 'bundler-had-not-seen-it' }])[1]
    ).toContain('1 module fake declared, did not apply:');
  });

  it('give a finding its line', () => {
    expect(findingLine({ kind: 'no-query-text', operation: 'Feed' })).toBe(
      '  Feed: not checked, the request sent no query text'
    );
  });

  it('keep the partial reads out of the logged errors and name their fields', () => {
    const message = 'A scene read "name" of a partial object, and the scene does not name it. Fix.';
    const logged = {
      messages: [
        { message, times: 1 },
        { message: 'boom', times: 2 },
      ],
      moreLeftOut: 0,
    };

    expect(PARTIAL_READ.exec(message)?.[1]).toBe('name');
    expect(partialFieldLines(logged)).toContain('     name: /* fill in */,');
    expect(loggedErrorLines(logged)).toContain('  boom (logged 2 times)');
    expect(loggedErrorLines(logged).join('\n')).not.toContain('partial object');
  });

  it('quote a text for a scene file', () => {
    expect(quoted("it's")).toBe("'it\\'s'");
  });
});
