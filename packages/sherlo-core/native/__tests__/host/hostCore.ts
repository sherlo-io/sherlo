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
