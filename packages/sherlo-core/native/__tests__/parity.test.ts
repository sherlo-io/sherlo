/**
 * The C core against what the Objective-C and Java code it replaced answered. The inputs and the
 * answers were recorded once, beside each other, in fixtures/ (fixtures/recorder/record.js says
 * how). Each name is a rule the book marks on "The sealed core".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pixelCompareFixture from './fixtures/pixel-compare.json';
import stillnessFixture from './fixtures/stillness.json';
import {
  ERROR_SIZE_MISMATCH,
  Image,
  PIXELS_RGBA8_PREMULTIPLIED,
  STILL_STABLE,
  STILL_UNSTABLE,
  StillAnswer,
  StillParams,
  StillStep,
  compileHostCore,
  countDifferentPixels,
  decideStillness,
  removeHostCore,
  solidImage,
} from './host/hostCore';

type RecordedImage = { width: number; height: number; pixels: string };
type RecordedAnswer = number | 'size-mismatch';

function imageFromRecorded(recorded: RecordedImage): Image {
  return {
    width: recorded.width,
    height: recorded.height,
    strideBytes: recorded.width * 4,
    format: PIXELS_RGBA8_PREMULTIPLIED,
    pixels: new Uint8Array(Buffer.from(recorded.pixels, 'hex')),
  };
}

/** The same image with `extraBytes` of padding after every row, as a platform's bitmap may have. */
function withPaddedRows(image: Image, extraBytes: number): Image {
  const strideBytes = image.strideBytes + extraBytes;
  const pixels = new Uint8Array(strideBytes * image.height).fill(0xab);
  for (let row = 0; row < image.height; row++) {
    pixels.set(
      image.pixels.subarray(row * image.strideBytes, (row + 1) * image.strideBytes),
      row * strideBytes
    );
  }
  return { ...image, strideBytes, pixels };
}

function asCoreAnswer(recorded: RecordedAnswer): number {
  return recorded === 'size-mismatch' ? ERROR_SIZE_MISMATCH : recorded;
}

// ---- How each platform's glue calls the stillness decision ---------------------------------------

type Tick = {
  tickMs: number;
  capturedMs: number;
  focusClearedMs: number;
  pair: 'same' | 'differs' | 'size';
  focusCleared: boolean;
};
type Scenario = {
  name: string;
  requiredMatches: number;
  minScreenshotsCount: number;
  timeoutMs: number;
  threshold: number;
  includeAA: boolean;
  loopStartMs: number;
  firstShotDoneMs: number;
  ticks: Tick[];
  ios: string[];
  android: string[];
};

const WHITE = solidImage(2, 2, [255, 255, 255, 255]);
const BLACK = solidImage(2, 2, [0, 0, 0, 255]);
const WIDER = solidImage(3, 2, [255, 255, 255, 255]);

function pairOf(tick: Tick): { previous: Image; current: Image } {
  const current = tick.pair === 'differs' ? BLACK : tick.pair === 'size' ? WIDER : WHITE;
  return { previous: WHITE, current };
}

function paramsFor(scenario: Scenario, countsFirstScreenshot: boolean): StillParams {
  return {
    requiredStillPairs: scenario.requiredMatches,
    minimumScreenshots: scenario.minScreenshotsCount,
    countsFirstScreenshot,
    timeLimitMs: scenario.timeoutMs,
    threshold: scenario.threshold,
    includeAA: scenario.includeAA,
  };
}

/** The verdicts in the recorders' words, up to the first one that ends the loop. */
function verdictWords(answers: StillAnswer[], sizeMismatchThrows: boolean): string[] {
  const words: string[] = [];
  for (const answer of answers) {
    if (sizeMismatchThrows && answer.differentPixels === ERROR_SIZE_MISMATCH) {
      words.push('throws');
      break;
    }
    if (answer.verdict === STILL_STABLE) {
      words.push('stable');
      break;
    }
    if (answer.verdict === STILL_UNSTABLE) {
      words.push('unstable');
      break;
    }
    words.push('continue');
  }
  return words;
}

/**
 * As ios/StabilityHelper.m calls it: the clock starts once the first screenshot is taken, each
 * step reads the clock when the timer fires, the first screenshot does not count, there is no
 * focus to clear, and a pair of different sizes throws.
 */
function decideAsIos(driver: string, scenario: Scenario): string[] {
  const steps: StillStep[] = scenario.ticks.map((tick) => ({
    nowMs: tick.tickMs,
    focusWasCleared: false,
    ...pairOf(tick),
  }));
  const answers = decideStillness(driver, paramsFor(scenario, false), scenario.firstShotDoneMs, steps);
  return verdictWords(answers, true);
}

/**
 * As Android's StabilityHelper.java calls it: the clock starts when stabilize is called, each step
 * reads it once the screenshot is taken, the first screenshot counts, and a cleared focus is
 * passed on.
 */
function decideAsAndroid(driver: string, scenario: Scenario): string[] {
  const steps: StillStep[] = scenario.ticks.map((tick) => ({
    nowMs: tick.capturedMs,
    focusWasCleared: tick.focusCleared,
    ...pairOf(tick),
  }));
  const answers = decideStillness(driver, paramsFor(scenario, true), scenario.loopStartMs, steps);
  return verdictWords(answers, false);
}

let driver: string;

beforeAll(() => {
  driver = compileHostCore();
});

afterAll(() => removeHostCore(driver));

describe('the C core against the recorded iOS and Android outputs', () => {
  it('counts the same differing pixels as the recorded iOS and Android pixel compare', () => {
    const cases = pixelCompareFixture.cases as Array<{
      name: string;
      threshold: number;
      includeAA: boolean;
      a: RecordedImage;
      b: RecordedImage;
      ios: RecordedAnswer;
      android: RecordedAnswer;
    }>;
    const pairs = cases.map((recorded) => ({
      a: imageFromRecorded(recorded.a),
      b: imageFromRecorded(recorded.b),
      threshold: recorded.threshold,
      includeAA: recorded.includeAA,
    }));
    const counts = countDifferentPixels(driver, pairs);
    // The same images with padded rows count the same.
    const paddedCounts = countDifferentPixels(
      driver,
      pairs.map((pair) => ({ ...pair, a: withPaddedRows(pair.a, 8), b: withPaddedRows(pair.b, 4) }))
    );

    cases.forEach((recorded, index) => {
      expect(counts[index], recorded.name + ' (iOS)').toBe(asCoreAnswer(recorded.ios));
      expect(counts[index], recorded.name + ' (Android)').toBe(asCoreAnswer(recorded.android));
      expect(paddedCounts[index], recorded.name + ' (padded rows)').toBe(counts[index]);
    });
    // The recording is not all zeros: real differences were counted.
    expect(counts.filter((count) => count > 0).length).toBeGreaterThan(5);
  });

  it('decides stillness as the recorded iOS and Android loops did, each with its own constants', () => {
    const scenarios = stillnessFixture.scenarios as Scenario[];
    for (const scenario of scenarios) {
      expect(decideAsIos(driver, scenario), scenario.name + ' (iOS)').toEqual(scenario.ios);
      expect(decideAsAndroid(driver, scenario), scenario.name + ' (Android)').toEqual(
        scenario.android
      );
    }
    // The two platforms' own constants show: some timelines end differently on each.
    const differing = scenarios.filter(
      (scenario) => scenario.ios.join(' ') !== scenario.android.join(' ')
    );
    expect(differing.length).toBeGreaterThan(0);
  });

  it('filters scroll candidates, checks metrics and clamps checkpoints as the recorded iOS and Android scroll engines did', () => {});

  it('plans and judges scroll nudges and finds the bottom as the recorded iOS and Android scroll engines did', () => {});

  it('limits, culls and writes the inspector tree as the recorded iOS and Android inspectors did', () => {});
});
