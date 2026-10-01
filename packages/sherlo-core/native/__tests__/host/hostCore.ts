/**
 * The C core, compiled for the machine running the suite, and the words to call it with.
 *
 * compileHostCore() builds the core's sources and driver.c with the host's C compiler (`cc`) into
 * a temporary folder; the functions below write the driver's commands and read its answers.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CORE_SOURCES, INCLUDE_DIR, coreVersion } from '../../build.js';

export const PIXELS_RGBA8_PREMULTIPLIED = 1;
export const ERROR_BAD_ARGUMENT = -1;
export const ERROR_SIZE_MISMATCH = -2;
export const STILL_CONTINUE = 0;
export const STILL_STABLE = 1;
export const STILL_UNSTABLE = 2;

/** A screenshot as the platform drew it: premultiplied RGBA8, `strideBytes` a row. */
export type Image = {
  width: number;
  height: number;
  strideBytes: number;
  format: number;
  pixels: Uint8Array;
};

export type StillParams = {
  requiredStillPairs: number;
  minimumScreenshots: number;
  countsFirstScreenshot: boolean;
  timeLimitMs: number;
  threshold: number;
  includeAA: boolean;
};

export type StillStep = {
  nowMs: number;
  focusWasCleared: boolean;
  previous: Image;
  current: Image;
};

export type StillAnswer = { verdict: number; differentPixels: number };

/** Compiles the host core once and returns the driver's path. */
export function compileHostCore(): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-c-core-'));
  const driver = path.join(folder, 'driver');
  execFileSync(
    'cc',
    [
      '-std=c11',
      '-O2',
      '-ffp-contract=off',
      '-I',
      INCLUDE_DIR,
      '-DSHERLO_CORE_VERSION="' + coreVersion() + '"',
      ...CORE_SOURCES,
      path.join(__dirname, 'driver.c'),
      '-lm',
      '-o',
      driver,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  return driver;
}

/** Removes the temporary folder compileHostCore made for `driver`. */
export function removeHostCore(driver: string) {
  fs.rmSync(path.dirname(driver), { recursive: true, force: true });
}

/** An image of `width` x `height` from one [r, g, b, a] per pixel, rows packed tight. */
export function imageOf(width: number, height: number, rgbaPerPixel: number[][]): Image {
  const pixels = new Uint8Array(width * height * 4);
  rgbaPerPixel.forEach((rgba, index) => pixels.set(rgba, index * 4));
  return { width, height, strideBytes: width * 4, format: PIXELS_RGBA8_PREMULTIPLIED, pixels };
}

/** An image of one colour. */
export function solidImage(width: number, height: number, rgba: number[]): Image {
  return imageOf(width, height, Array.from({ length: width * height }, () => rgba));
}

function imageWords(image: Image): string {
  return [
    image.width,
    image.height,
    image.strideBytes,
    image.format,
    Buffer.from(image.pixels).toString('hex'),
  ].join(' ');
}

function runDriver(driver: string, commands: string[]): string[] {
  const output = execFileSync(driver, [], {
    input: commands.join('\n') + '\n',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.trim().split('\n');
}

/** What sherlo_core_abi() answers. */
export function reportedAbi(driver: string): number {
  return Number(runDriver(driver, ['abi'])[0]);
}

/** What sherlo_core_version() answers. */
export function reportedVersion(driver: string): string {
  return runDriver(driver, ['version'])[0];
}

/** sherlo_count_different_pixels for each pair, in one run of the driver. */
export function countDifferentPixels(
  driver: string,
  pairs: Array<{ a: Image; b: Image; threshold: number; includeAA: boolean }>
): number[] {
  const commands = pairs.map(
    ({ a, b, threshold, includeAA }) =>
      ['compare', threshold, includeAA ? 1 : 0, imageWords(a), imageWords(b)].join(' ')
  );
  return runDriver(driver, commands).map(Number);
}

/** One stillness decision: begin at `beginMs`, then every step in order, then end. */
export function decideStillness(
  driver: string,
  params: StillParams,
  beginMs: number,
  steps: StillStep[]
): StillAnswer[] {
  const begin = [
    'still_begin',
    params.requiredStillPairs,
    params.minimumScreenshots,
    params.countsFirstScreenshot ? 1 : 0,
    params.timeLimitMs,
    params.threshold,
    params.includeAA ? 1 : 0,
    beginMs,
  ].join(' ');
  const stepCommands = steps.map((step) =>
    [
      'still_step',
      step.nowMs,
      step.focusWasCleared ? 1 : 0,
      imageWords(step.previous),
      imageWords(step.current),
    ].join(' ')
  );
  const answers = runDriver(driver, [begin, ...stepCommands, 'still_end']);
  if (answers[0] !== 'begun') throw new Error('sherlo_still_begin refused: ' + answers[0]);
  return answers.slice(1, -1).map((line) => {
    const [verdict, differentPixels] = line.split(' ').map(Number);
    return { verdict, differentPixels };
  });
}

// ---- The scroll engine and the inspector ---------------------------------------------------------

export const PLATFORM_IOS = 1;
export const PLATFORM_ANDROID = 2;
export const SCROLL_NO_CANDIDATE = -3;

/** sherlo_scroll_metrics: what each number means on each platform is said in sherlo_core.h. */
export type ScrollMetrics = {
  canScroll: boolean;
  isShown: boolean;
  viewportHeight: number;
  contentHeight: number;
  insetTop: number;
  insetBottom: number;
  scrollExtent: number;
};

export type ScrollCandidate = {
  className: string;
  isHidden: boolean;
  alpha: number;
  metrics: ScrollMetrics;
  isOnScreen: boolean;
  visibleWidth: number;
  visibleHeight: number;
};

export type ScrollPosition = { offset: number; scrollY: number };

export type CheckpointPlan = { answer: number; appliedIndex: number; targetOffset: number };

export type CheckpointResult = {
  answer: number;
  reachedBottom: boolean;
  appliedIndex: number;
  appliedOffsetPx: number;
  viewportPx: number;
  contentPx: number;
};

export type InspectorNode = {
  depth: number;
  classIndex: number;
  isVisible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  hasId: boolean;
  id: number;
  top: number;
  bottom: number;
};

export type InspectorTree = {
  platform: number;
  density: number;
  fontScale: number;
  viewportTop: number;
  viewportBottom: number;
  classNames: string[];
  nodes: InspectorNode[];
};

/** A number as the driver reads and writes it: strtod's words, NaN, Infinity and -0 included. */
function numberWord(value: number): string {
  if (Object.is(value, -0)) return '-0';
  return String(value);
}

function flagWord(value: boolean): string {
  return value ? '1' : '0';
}

/** A class name as the driver reads it: "x" and its UTF-8 bytes in hex. */
function classNameWord(name: string): string {
  return 'x' + Buffer.from(name, 'utf8').toString('hex');
}

function metricsWords(metrics: ScrollMetrics): string[] {
  return [
    flagWord(metrics.canScroll),
    flagWord(metrics.isShown),
    ...[
      metrics.viewportHeight,
      metrics.contentHeight,
      metrics.insetTop,
      metrics.insetBottom,
      metrics.scrollExtent,
    ].map(numberWord),
  ];
}

function positionWords(position: ScrollPosition): string[] {
  return [numberWord(position.offset), numberWord(position.scrollY)];
}

function candidateWords(candidate: ScrollCandidate): string[] {
  return [
    classNameWord(candidate.className),
    flagWord(candidate.isHidden),
    numberWord(candidate.alpha),
    ...metricsWords(candidate.metrics),
    flagWord(candidate.isOnScreen),
    numberWord(candidate.visibleWidth),
    numberWord(candidate.visibleHeight),
  ];
}

/** sherlo_scroll_pick: the index picked, SCROLL_NO_CANDIDATE, or an error. */
export function pickScrollCandidate(
  driver: string,
  platform: number,
  screenWidth: number,
  screenHeight: number,
  candidates: ScrollCandidate[]
): number {
  const command = [
    'scroll_pick',
    platform,
    numberWord(screenWidth),
    numberWord(screenHeight),
    candidates.length,
    ...candidates.flatMap(candidateWords),
  ].join(' ');
  return Number(runDriver(driver, [command])[0]);
}

/**
 * The pick as the glue walks it: for each candidate in turn, sherlo_scroll_candidate_is_eligible,
 * then for an eligible one sherlo_scroll_candidate_fits, stopping at the first that fits. Returns
 * its index, or SCROLL_NO_CANDIDATE, and how many candidates the walk read in full.
 */
export function walkScrollCandidates(
  driver: string,
  platform: number,
  screenWidth: number,
  screenHeight: number,
  candidates: ScrollCandidate[]
): { index: number; readInFull: number } {
  // Each answer depends on its own candidate alone, so all of them are asked in one run.
  const ask = (question: string) =>
    runDriver(
      driver,
      candidates.map((candidate) =>
        [question, platform, numberWord(screenWidth), numberWord(screenHeight), ...candidateWords(candidate)].join(' ')
      )
    ).map(Number);
  const eligible = candidates.length > 0 ? ask('scroll_candidate_is_eligible') : [];
  const fits = candidates.length > 0 ? ask('scroll_candidate_fits') : [];
  let readInFull = 0;
  for (let index = 0; index < candidates.length; index++) {
    if (eligible[index] !== 1) continue;
    readInFull++;
    if (fits[index] === 1) return { index, readInFull };
  }
  return { index: SCROLL_NO_CANDIDATE, readInFull };
}

/** sherlo_scroll_is_scrollable: 1, 0, or an error. */
export function isScrollable(driver: string, platform: number, metrics: ScrollMetrics): number {
  return Number(
    runDriver(driver, [['scroll_is_scrollable', platform, ...metricsWords(metrics)].join(' ')])[0]
  );
}

/** sherlo_scroll_nudge_target: whether there is a move (1, 0, or an error), and the move. */
export function nudgeTarget(
  driver: string,
  platform: number,
  attempt: number,
  metrics: ScrollMetrics,
  before: ScrollPosition
): { answer: number; target: number } {
  const command = [
    'scroll_nudge_target',
    platform,
    attempt,
    ...metricsWords(metrics),
    ...positionWords(before),
  ].join(' ');
  const [answer, target] = runDriver(driver, [command])[0].split(' ').map(Number);
  return { answer, target };
}

/** sherlo_scroll_nudge_moved: 1, 0, or an error. */
export function nudgeMoved(
  driver: string,
  platform: number,
  before: ScrollPosition,
  after: ScrollPosition
): number {
  const command = ['scroll_nudge_moved', platform, ...positionWords(before), ...positionWords(after)];
  return Number(runDriver(driver, [command.join(' ')])[0]);
}

/**
 * sherlo_checkpoint_plan_for, then sherlo_checkpoint_read_back with `actualOffset`: where the view
 * was once the glue scrolled it to the plan's target.
 */
export function planAndReadBackCheckpoint(
  driver: string,
  platform: number,
  checkpoint: { index: number; stepPx: number; lastIndex: number; metrics: ScrollMetrics; pixelsPerPoint: number },
  actualOffset: number
): { plan: CheckpointPlan; result: CheckpointResult } {
  const planCommand = [
    'checkpoint_plan',
    platform,
    numberWord(checkpoint.index),
    numberWord(checkpoint.stepPx),
    numberWord(checkpoint.lastIndex),
    ...metricsWords(checkpoint.metrics),
    numberWord(checkpoint.pixelsPerPoint),
  ].join(' ');
  const [planLine, resultLine] = runDriver(driver, [
    planCommand,
    'checkpoint_read_back ' + numberWord(actualOffset),
  ]);
  const [planAnswer, appliedIndex, targetOffset] = planLine.split(' ').map(Number);
  const [answer, reachedBottom, resultIndex, appliedOffsetPx, viewportPx, contentPx] = resultLine
    .split(' ')
    .map(Number);
  return {
    plan: { answer: planAnswer, appliedIndex, targetOffset },
    result: {
      answer,
      reachedBottom: reachedBottom === 1,
      appliedIndex: resultIndex,
      appliedOffsetPx,
      viewportPx,
      contentPx,
    },
  };
}

/** sherlo_inspector_has_room for each [depth, nodesKept]. */
export function inspectorHasRoom(driver: string, queries: Array<[number, number]>): number[] {
  return runDriver(
    driver,
    queries.map(([depth, nodesKept]) => ['inspector_has_room', depth, nodesKept].join(' '))
  ).map(Number);
}

/** sherlo_inspector_is_on_screen for each [top, bottom, viewportTop, viewportBottom]. */
export function inspectorIsOnScreen(
  driver: string,
  queries: Array<[number, number, number, number]>
): number[] {
  return runDriver(
    driver,
    queries.map((query) => ['inspector_is_on_screen', ...query.map(numberWord)].join(' '))
  ).map(Number);
}

/** sherlo_inspector_json: the JSON, or null when the core refused. */
export function inspectorJson(driver: string, tree: InspectorTree): string | null {
  const command = [
    'inspector_json',
    tree.platform,
    ...[tree.density, tree.fontScale, tree.viewportTop, tree.viewportBottom].map(numberWord),
    tree.classNames.length,
    ...tree.classNames.map(classNameWord),
    tree.nodes.length,
    ...tree.nodes.flatMap((node) => [
      node.depth,
      node.classIndex,
      flagWord(node.isVisible),
      ...[node.x, node.y, node.width, node.height].map(numberWord),
      flagWord(node.hasId),
      numberWord(node.id),
      numberWord(node.top),
      numberWord(node.bottom),
    ]),
  ].join(' ');
  const [length, hex] = runDriver(driver, [command])[0].split(' ');
  if (length === 'null') return null;
  const bytes = Buffer.from(hex ?? '', 'hex');
  if (bytes.length !== Number(length)) throw new Error('sherlo_inspector_json: the length is wrong');
  return bytes.toString('utf8');
}
