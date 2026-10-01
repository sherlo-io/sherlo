/**
 * The stillness decision, run in the C core compiled for the machine running the suite.
 *
 * A step here hands the core two tiny screenshots: the same colour twice is a pair with no
 * differing pixel, two colours a pair that differs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  STILL_CONTINUE,
  STILL_STABLE,
  STILL_UNSTABLE,
  StillParams,
  StillStep,
  compileHostCore,
  decideStillness,
  removeHostCore,
  solidImage,
} from './host/hostCore';

const WHITE = solidImage(2, 2, [255, 255, 255, 255]);
const BLACK = solidImage(2, 2, [0, 0, 0, 255]);

const PARAMS: StillParams = {
  requiredStillPairs: 3,
  minimumScreenshots: 4,
  countsFirstScreenshot: false,
  timeLimitMs: 1000,
  threshold: 0.1,
  includeAA: true,
};

/** A step at `nowMs`: `still` hands an identical pair, otherwise one that differs. */
function step(nowMs: number, still: boolean, focusWasCleared = false): StillStep {
  return { nowMs, focusWasCleared, previous: WHITE, current: still ? WHITE : BLACK };
}

let driver: string;

beforeAll(() => {
  driver = compileHostCore();
});

afterAll(() => removeHostCore(driver));

describe('the stillness decision', () => {
  it('a screen is still after the required number of pairs in a row with no differing pixel', () => {
    const answers = decideStillness(driver, PARAMS, 0, [
      step(100, true),
      step(200, true),
      step(300, false), // a differing pair starts the count again
      step(400, true),
      step(500, true),
      step(600, true),
    ]);
    expect(answers.map((answer) => answer.verdict)).toEqual([
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_STABLE,
    ]);
    expect(answers.map((answer) => answer.differentPixels)).toEqual([0, 0, 4, 0, 0, 0]);

    // A cleared focus starts the count again too.
    const withFocus = decideStillness(driver, PARAMS, 0, [
      step(100, true),
      step(200, true, true),
      step(300, true),
      step(400, true),
      step(500, true),
    ]);
    expect(withFocus.map((answer) => answer.verdict)).toEqual([
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_STABLE,
    ]);
  });

  it('a screen is moving only once the time limit has passed, the minimum screenshots are taken, and the latest pair differed', () => {
    // Every pair differs. Before the time limit: undecided, however many screenshots.
    const beforeTheLimit = decideStillness(driver, PARAMS, 0, [
      step(200, false),
      step(400, false),
      step(600, false),
      step(800, false),
      step(999, false),
    ]);
    expect(beforeTheLimit.every((answer) => answer.verdict === STILL_CONTINUE)).toBe(true);

    // Past the time limit, but too few screenshots: undecided until the fourth.
    const tooFewScreenshots = decideStillness(driver, PARAMS, 0, [
      step(1500, false),
      step(1600, false),
      step(1700, false),
      step(1800, false),
    ]);
    expect(tooFewScreenshots.map((answer) => answer.verdict)).toEqual([
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_UNSTABLE,
    ]);

    // Where the first screenshot counts (Android), the minimum is reached one pair sooner.
    const firstCounts = decideStillness(driver, { ...PARAMS, countsFirstScreenshot: true }, 0, [
      step(1500, false),
      step(1600, false),
      step(1700, false),
    ]);
    expect(firstCounts.map((answer) => answer.verdict)).toEqual([
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_UNSTABLE,
    ]);

    // Past the limit with enough screenshots, but the latest pair was still: undecided.
    const latestStill = decideStillness(driver, PARAMS, 0, [
      step(1500, false),
      step(1600, false),
      step(1700, false),
      step(1800, true),
    ]);
    expect(latestStill[3].verdict).toBe(STILL_CONTINUE);
  });

  it('a screen that settles and moves again runs past the time limit until a pair differs', () => {
    const answers = decideStillness(driver, PARAMS, 0, [
      step(300, false),
      step(600, false),
      step(900, true), // settles...
      step(1200, true), // ...past the time limit, still pairs in a row: undecided
      step(1500, false), // moves again: the latest pair differs, so the screen is moving
    ]);
    expect(answers.map((answer) => answer.verdict)).toEqual([
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_CONTINUE,
      STILL_UNSTABLE,
    ]);
  });
});
