/**
 * The C core against what the Objective-C and Java code it replaced answered. The inputs and the
 * answers were recorded once, beside each other, in fixtures/ (fixtures/recorder/record.js says
 * how).
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import inspectorFixture from './fixtures/inspector.json';
import pixelCompareFixture from './fixtures/pixel-compare.json';
import {
  ANDROID_SIMPLE_NAMES,
  androidInspectorTrees,
  androidScrollCases,
  iosInspectorTrees,
  iosScrollCases,
} from './fixtures/recorder/viewCases.js';
import scrollFixture from './fixtures/scroll.json';
import stillnessFixture from './fixtures/stillness.json';
import {
  ERROR_SIZE_MISMATCH,
  Image,
  InspectorNode,
  InspectorTree,
  PIXELS_RGBA8_PREMULTIPLIED,
  PLATFORM_ANDROID,
  PLATFORM_IOS,
  STILL_STABLE,
  STILL_UNSTABLE,
  ScrollCandidate,
  ScrollMetrics,
  ScrollPosition,
  StillAnswer,
  StillParams,
  StillStep,
  compileHostCore,
  countDifferentPixels,
  decideStillness,
  inspectorHasRoom,
  inspectorIsOnScreen,
  inspectorJson,
  isScrollable,
  nudgeMoved,
  nudgeTarget,
  planAndReadBackCheckpoint,
  removeHostCore,
  solidImage,
  walkScrollCandidates,
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

  it('filters scroll candidates, checks metrics and clamps checkpoints as the recorded iOS and Android scroll engines did', () => {
    let picked = 0;
    forEachScrollCase('pick', (platform, scrollCase, answer) => {
      const words = answer.split(' ');
      const recordedIndex = Number(words[0]);
      const candidates = candidatesAsGlueReads(platform, scrollCase, words.slice(1));
      // The recorders wrote -1 when no view was picked.
      const expectedIndex = recordedIndex === -1 ? null : recordedIndex;
      // The walk both glues run, asking of each candidate as it reaches it.
      const index = walkScrollCandidates(driver, platform, ...screenOf(platform, scrollCase), candidates);
      expect(index, scrollCase.name).toBe(expectedIndex);
      if (recordedIndex >= 0) picked++;
    });
    expect(picked).toBeGreaterThan(10);

    forEachScrollCase('check', (platform, scrollCase, answer) => {
      expect(isScrollable(driver, platform, metricsAsGlueReads(platform, scrollCase)), scrollCase.name).toBe(
        Number(answer)
      );
    });

    forEachScrollCase('checkpoint', (platform, scrollCase, answer) => {
      const recorded = recordedCheckpoint(platform, scrollCase, answer);
      const { plan } = checkpointAsGlueRuns(platform, scrollCase, recorded.actualOffset);
      expect(plan.answer, scrollCase.name).toBe(0);
      expect(plan.appliedIndex, scrollCase.name).toBe(recorded.appliedIndex);
      if (platform === PLATFORM_IOS) {
        // iOS set the content offset to the plan's target.
        expect(plan.targetOffset, scrollCase.name).toBe(recorded.offsetAskedFor);
      } else {
        // Android scrolled by the plan's target less where the view was, when that was not 0.
        const distance = plan.targetOffset - scrollCase.scrolling.offset;
        expect(distance === 0 ? null : distance, scrollCase.name).toBe(recorded.offsetAskedFor);
      }
    });
  });

  it('plans and judges scroll nudges and finds the bottom as the recorded iOS and Android scroll engines did', () => {
    let moved = 0;
    forEachScrollCase('nudge', (platform, scrollCase, answer) => {
      const [recordedMoved, ...recordedMoves] = answer.split(' ');
      const nudge = nudgeAsGlueRuns(platform, scrollCase, recordedMoves);
      expect(nudge.moves, scrollCase.name).toEqual(
        recordedMoves.map((move) => Number(move.split('>')[0]))
      );
      expect(nudge.moved, scrollCase.name).toBe(recordedMoved === '1');
      if (nudge.moved) moved++;
    });
    expect(moved).toBeGreaterThan(4);

    let atTheBottom = 0;
    forEachScrollCase('checkpoint', (platform, scrollCase, answer) => {
      const recorded = recordedCheckpoint(platform, scrollCase, answer);
      const { result } = checkpointAsGlueRuns(platform, scrollCase, recorded.actualOffset);
      expect(result.answer, scrollCase.name).toBe(0);
      expect(result.reachedBottom, scrollCase.name).toBe(recorded.reachedBottom);
      expect(result.appliedIndex, scrollCase.name).toBe(recorded.appliedIndex);
      expect(result.appliedOffsetPx, scrollCase.name).toBe(recorded.appliedOffsetPx);
      expect(result.viewportPx, scrollCase.name).toBe(recorded.viewportPx);
      expect(result.contentPx, scrollCase.name).toBe(recorded.contentPx);
      if (result.reachedBottom) atTheBottom++;
    });
    expect(atTheBottom).toBeGreaterThan(4);
  });

  it('limits, culls and writes the inspector tree as the recorded iOS and Android inspectors did', () => {
    const recordedTrees: Array<[number, Array<Record<string, unknown>>, RecordedInspectorAnswer[]]> = [
      [PLATFORM_IOS, iosInspectorTrees(), inspectorFixture.ios as RecordedInspectorAnswer[]],
      [PLATFORM_ANDROID, androidInspectorTrees(), inspectorFixture.android as RecordedInspectorAnswer[]],
    ];
    for (const [platform, trees, answers] of recordedTrees) {
      expect(trees.map((tree) => tree.name)).toEqual(answers.map((answer) => answer.name));
      trees.forEach((tree, index) => {
        const recorded = answers[index];
        const json = inspectorJson(driver, inspectorTreeAsGlueFills(platform, tree));
        const name = recorded.name + (platform === PLATFORM_IOS ? ' (iOS)' : ' (Android)');
        if (recorded.error !== undefined) {
          expect(json, name).toBeNull();
        } else if (recorded.json !== undefined) {
          expect(json, name).toBe(recorded.json);
        } else {
          expect(Buffer.byteLength(json ?? '', 'utf8'), name).toBe(recorded.jsonLength);
          expect(createHash('sha256').update(json ?? '', 'utf8').digest('hex'), name).toBe(
            recorded.jsonSha256
          );
        }
      });
    }

    // The two rules the glue asks before it walks into a child, at their edges.
    expect(
      inspectorHasRoom(driver, [
        [50, 9999],
        [51, 0],
        [1, 10000],
        [0, 0],
      ])
    ).toEqual([1, 0, 0, 1]);
    expect(
      inspectorIsOnScreen(driver, [
        [0, 10, 0, 844],
        [-10, 0, 0, 844],
        [844, 900, 0, 844],
        [843.5, 900, 0, 844],
        [NaN, 10, 0, 844],
        [-Infinity, Infinity, 0, 844],
      ])
    ).toEqual([1, 0, 0, 1, 1, 1]);
  });
});

// ---- The scroll cases, as each platform's glue reads them ----------------------------------------

type ScrollCase = Record<string, any> & { name: string; kind: string };

/** A number from the recorder's script, where NaN, Infinity and -0 are strings. */
function scripted(value: number | string): number {
  return typeof value === 'string' ? Number(value) : value;
}

function forEachScrollCase(
  kind: string,
  check: (platform: number, scrollCase: ScrollCase, answer: string) => void
) {
  const recorded: Array<[number, ScrollCase[], Array<{ name: string; answer: string }>]> = [
    [PLATFORM_IOS, iosScrollCases(), scrollFixture.ios],
    [PLATFORM_ANDROID, androidScrollCases(), scrollFixture.android],
  ];
  for (const [platform, cases, answers] of recorded) {
    expect(cases.map((scrollCase) => scrollCase.name)).toEqual(answers.map((answer) => answer.name));
    cases.forEach((scrollCase, index) => {
      if (scrollCase.kind !== kind) return;
      check(platform, { ...scrollCase, name: scrollCase.name + (platform === PLATFORM_IOS ? ' (iOS)' : ' (Android)') }, answers[index].answer);
    });
  }
}

/** A scroll view's numbers as the glue reads them: iOS a UIScrollView's, Android a View's. */
function metricsAsGlueReads(platform: number, scrollCase: Record<string, any>): ScrollMetrics {
  if (platform === PLATFORM_IOS) {
    const scrollView = scrollCase.scrollView;
    return {
      canScroll: scrollView.scrollEnabled,
      isShown: scrollView.inWindow,
      viewportHeight: scripted(scrollView.viewportHeight),
      contentHeight: scripted(scrollView.contentHeight),
      insetTop: scripted(scrollView.insetTop),
      insetBottom: scripted(scrollView.insetBottom),
      scrollExtent: -1,
    };
  }
  const view = scrollCase.view;
  return {
    canScroll: view.canScrollDown || view.canScrollUp,
    isShown: view.visibility === 0,
    viewportHeight: view.height,
    contentHeight: view.range,
    insetTop: 0,
    insetBottom: 0,
    scrollExtent: scrollCase.extent ?? -1,
  };
}

function screenOf(platform: number, scrollCase: ScrollCase): [number, number] {
  return platform === PLATFORM_IOS
    ? [scrollCase.windowWidth, scrollCase.windowHeight]
    : [scrollCase.rootWidth, scrollCase.rootHeight];
}

/**
 * The candidates as the glue hands them over. iOS: each UIScrollView, with what
 * CGRectIntersection made of its frame and the window (the recording's words: "null", or a width
 * and a height). Android: each view, with its class name (the recording's words).
 */
function candidatesAsGlueReads(platform: number, scrollCase: ScrollCase, words: string[]): ScrollCandidate[] {
  if (platform === PLATFORM_IOS) {
    let at = 0;
    return scrollCase.candidates.map((candidate: Record<string, any>) => {
      const isOnScreen = words[at] !== 'null';
      const visibleWidth = isOnScreen ? Number(words[at]) : 0;
      const visibleHeight = isOnScreen ? Number(words[at + 1]) : 0;
      at += isOnScreen ? 2 : 1;
      return {
        className: candidate.className,
        isHidden: candidate.hidden,
        alpha: scripted(candidate.alpha),
        metrics: metricsAsGlueReads(platform, candidate),
        isOnScreen,
        visibleWidth,
        visibleHeight,
      };
    });
  }
  return scrollCase.candidates.map((candidate: Record<string, any>, index: number) => ({
    className: words[index],
    isHidden: false,
    alpha: 1,
    metrics: metricsAsGlueReads(platform, candidate),
    isOnScreen: candidate.globallyVisible,
    visibleWidth: candidate.visible[0],
    visibleHeight: candidate.visible[1],
  }));
}

/**
 * A nudge as each platform's glue makes it around the core's two calls, the view answering as it
 * did in the recording. Returns every move the glue made - iOS the offsets it set, Android the
 * distances it scrolled by, the moves that put the view back included - and the verdict.
 */
function nudgeAsGlueRuns(
  platform: number,
  scrollCase: ScrollCase,
  recordedMoves: string[]
): { moves: number[]; moved: boolean } {
  const metrics = metricsAsGlueReads(platform, scrollCase);
  const before: ScrollPosition =
    platform === PLATFORM_IOS
      ? { offset: scripted(scrollCase.offset), scrollY: 0 }
      : { offset: scrollCase.scrolling.offset, scrollY: scrollCase.scrolling.scrollY };
  const moves: number[] = [];
  // Where the view went after the glue's next move, as the recording says.
  const whereTheViewWent = (): ScrollPosition => {
    const kept = recordedMoves[moves.length - 1]?.split('>')[1] ?? '';
    if (platform === PLATFORM_IOS) return { offset: Number(kept), scrollY: 0 };
    const [scrollY, offset] = kept.split(',').map(Number);
    return { offset, scrollY };
  };

  for (let attempt = 0; ; attempt++) {
    const { answer, target } = nudgeTarget(driver, platform, attempt, metrics, before);
    if (answer !== 1) return { moves, moved: false };
    moves.push(target);
    const after = whereTheViewWent();
    // Putting it back: iOS sets the offset it had; Android scrolls back by what its scrollY moved.
    moves.push(platform === PLATFORM_IOS ? before.offset : 0 - (after.scrollY - before.scrollY));
    if (nudgeMoved(driver, platform, before, after) === 1) return { moves, moved: true };
  }
}

type RecordedCheckpoint = {
  /** iOS: the offset set. Android: the distance scrolled by, or null when the glue did not scroll. */
  offsetAskedFor: number | null;
  actualOffset: number;
  reachedBottom: boolean;
  appliedIndex: number;
  appliedOffsetPx: number;
  viewportPx: number;
  contentPx: number;
};

function recordedCheckpoint(platform: number, scrollCase: ScrollCase, answer: string): RecordedCheckpoint {
  const [moveWords, resultWords] = answer.split('|').map((part) => part.trim());
  const [reachedBottom, appliedIndex, appliedOffsetPx, viewportPx, contentPx] = resultWords
    .split(' ')
    .map(Number);
  const move = moveWords === '' ? null : moveWords.split('>');
  let actualOffset: number;
  if (platform === PLATFORM_IOS) {
    actualOffset = Number(move?.[1]);
  } else {
    actualOffset = move === null ? scrollCase.scrolling.offset : Number(move[1].split(',')[1]);
  }
  return {
    offsetAskedFor: move === null ? null : Number(move[0]),
    actualOffset,
    reachedBottom: reachedBottom === 1,
    appliedIndex,
    appliedOffsetPx,
    viewportPx,
    contentPx,
  };
}

function checkpointAsGlueRuns(platform: number, scrollCase: ScrollCase, actualOffset: number) {
  return planAndReadBackCheckpoint(
    driver,
    platform,
    {
      index: scrollCase.index,
      stepPx: scripted(scrollCase.offsetPx),
      lastIndex: scrollCase.maxIndex,
      metrics: metricsAsGlueReads(platform, scrollCase),
      pixelsPerPoint: platform === PLATFORM_IOS ? scrollCase.scale : 1,
    },
    actualOffset
  );
}

// ---- The inspector trees, as each platform's glue fills them -------------------------------------

type RecordedInspectorAnswer = {
  name: string;
  json?: string;
  jsonLength?: number;
  jsonSha256?: string;
  error?: string;
};

/** The flat node array and the class-name table each platform's glue fills from its walk. */
function inspectorTreeAsGlueFills(platform: number, tree: Record<string, any>): InspectorTree {
  const classNames: string[] = [];
  const classIndexOf = (name: string) => {
    if (!classNames.includes(name)) classNames.push(name);
    return classNames.indexOf(name);
  };

  if (platform === PLATFORM_IOS) {
    const scale = scripted(tree.nativeScale);
    const nodes = tree.views.map((view: Record<string, any>): InspectorNode => {
      const [x, y, width, height] = view.frame.map(scripted);
      const hasReactTag = view.reactTag !== null;
      return {
        depth: view.depth,
        classIndex: classIndexOf(view.className),
        isVisible: !view.hidden && view.alpha > 0.01 && view.inWindow,
        x: x * scale,
        y: y * scale,
        width: width * scale,
        height: height * scale,
        hasId: hasReactTag || view.tag > 0,
        id: hasReactTag ? view.reactTag : view.tag,
        top: y,
        bottom: y + height,
      };
    });
    return {
      platform,
      density: scale,
      fontScale: tree.bodyPointSize / tree.systemFontSize,
      viewportTop: 0,
      viewportBottom: tree.windowHeight,
      classNames,
      nodes,
    };
  }

  const nodes = tree.views.map((view: Record<string, any>): InspectorNode => {
    const [left, top, right, bottom] = view.rect;
    return {
      depth: view.depth,
      classIndex: classIndexOf(ANDROID_SIMPLE_NAMES[view.viewClass as keyof typeof ANDROID_SIMPLE_NAMES]),
      isVisible: view.globallyVisible,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      hasId: view.id > 0,
      id: view.id,
      top: view.screen[1],
      bottom: view.screen[1] + view.height,
    };
  });
  return {
    platform,
    // The glue hands the core Java's floats, widened to doubles.
    density: Math.fround(Number(tree.density)),
    fontScale: Math.fround(Number(tree.fontScale)),
    viewportTop: tree.viewportTop,
    viewportBottom: tree.viewportBottom,
    classNames,
    nodes,
  };
}
