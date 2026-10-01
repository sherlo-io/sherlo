/**
 * THE ONE-TIME RECORDER of the parity fixtures: what the Objective-C and Java code the C core
 * replaced answered, written to ../pixel-compare.json and ../stillness.json for parity.test.ts.
 *
 * Run once, on macOS with Xcode and a JDK: `node native/__tests__/fixtures/recorder/record.js`.
 *
 * The code it runs is taken from git, from the commit just before this change (ORIGINALS_COMMIT):
 *
 * - The pixel compare is the original code, run. iOS: Pixelmatch.m, compiled for macOS against
 *   CoreGraphics, with a two-line UIImage in place of UIKit's (ios/UIKit/UIKit.h). Android:
 *   Pixelmatch.java on the JVM, with a stand-in android.graphics.Bitmap
 *   (android/android/graphics/Bitmap.java) whose getPixels un-premultiplies as Skia's float
 *   pipeline does. Each is handed the same premultiplied RGBA bytes the C core is.
 * - The stillness loops are each platform's decision lines, transcribed into ios/record.m and
 *   android/Record.java around the original Pixelmatch, with the timer, the screenshots and the
 *   focus clearing replaced by a scripted timeline. That part is recorded by reading the code.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HERE = __dirname;
const REPO_ROOT = path.join(HERE, '..', '..', '..', '..', '..', '..');
const FIXTURES = path.join(HERE, '..');

// The commit just before the C core replaced them: the recorder reads the original
// ios/Pixelmatch.{h,m} and android/.../Pixelmatch.java from it.
const ORIGINALS_COMMIT = '21bfac82674cbbe91bdf6101607addcc09ad56b2';
const SDK = 'packages/react-native-storybook';
const ORIGINAL_IOS_HEADER = SDK + '/ios/Pixelmatch.h';
const ORIGINAL_IOS_SOURCE = SDK + '/ios/Pixelmatch.m';
const ORIGINAL_JAVA_SOURCE =
  SDK + '/android/src/main/java/io/sherlo/storybookreactnative/Pixelmatch.java';

// ---- The inputs ----------------------------------------------------------------------------------

// A small seeded random number generator (mulberry32), so a re-recording draws the same images.
function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Premultiplied RGBA bytes from one straight [r, g, b, a] per pixel. */
function premultiplied(straightPixels) {
  const bytes = Buffer.alloc(straightPixels.length * 4);
  straightPixels.forEach(([red, green, blue, alpha], index) => {
    bytes[index * 4] = Math.round((red * alpha) / 255);
    bytes[index * 4 + 1] = Math.round((green * alpha) / 255);
    bytes[index * 4 + 2] = Math.round((blue * alpha) / 255);
    bytes[index * 4 + 3] = alpha;
  });
  return bytes;
}

function image(width, height, straightPixels) {
  return { width, height, pixels: premultiplied(straightPixels).toString('hex') };
}

function solid(width, height, rgba) {
  return image(width, height, Array.from({ length: width * height }, () => rgba));
}

function noise(width, height, random, { opaque }) {
  return Array.from({ length: width * height }, () => [
    Math.floor(random() * 256),
    Math.floor(random() * 256),
    Math.floor(random() * 256),
    opaque ? 255 : Math.floor(random() * 256),
  ]);
}

/** A copy of `straightPixels` with `count` random pixels nudged by up to `strength` a channel. */
function nudged(straightPixels, random, count, strength) {
  const copy = straightPixels.map((pixel) => [...pixel]);
  for (let changed = 0; changed < count; changed++) {
    const pixel = copy[Math.floor(random() * copy.length)];
    for (let channel = 0; channel < 3; channel++) {
      const shift = Math.round((random() * 2 - 1) * strength);
      pixel[channel] = Math.min(255, Math.max(0, pixel[channel] + shift));
    }
  }
  return copy;
}

/** Dark left, light right, with a one-pixel grey edge between them at column `edge`. */
function edgeImage(width, height, edge) {
  const pixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < edge) pixels.push([20, 20, 20, 255]);
      else if (x === edge) pixels.push([128, 128, 128, 255]);
      else pixels.push([240, 240, 240, 255]);
    }
  }
  return pixels;
}

/** Flat blocks of a few colours, like a screen of text and buttons: many flat neighbourhoods. */
function blocks(width, height, random) {
  const palette = [
    [255, 255, 255, 255],
    [30, 30, 30, 255],
    [0, 122, 255, 255],
    [242, 242, 247, 255],
  ];
  const blockColours = Array.from({ length: 16 }, () => palette[Math.floor(random() * 4)]);
  const pixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels.push(blockColours[Math.floor(y / (height / 4)) * 4 + Math.floor(x / (width / 4))]);
    }
  }
  return pixels;
}

function pixelCompareCases() {
  const random = randomFrom(20261001);
  const cases = [];
  const add = (name, a, b, threshold, includeAA) => cases.push({ name, threshold, includeAA, a, b });

  const white = solid(8, 8, [255, 255, 255, 255]);
  add('identical opaque', white, white, 0.1, false);

  const onePixel = Array.from({ length: 64 }, () => [255, 255, 255, 255]);
  onePixel[27] = [255, 0, 0, 255];
  add('one red pixel', white, image(8, 8, onePixel), 0.1, false);

  const faint = Array.from({ length: 64 }, () => [255, 255, 255, 255]);
  faint[27] = [250, 250, 250, 255];
  add('one faint pixel, under the threshold', white, image(8, 8, faint), 0.1, false);
  add('one faint pixel, threshold 0', white, image(8, 8, faint), 0, false);

  const opaqueNoise = noise(16, 16, random, { opaque: true });
  add('opaque noise, nudged', image(16, 16, opaqueNoise), image(16, 16, nudged(opaqueNoise, random, 40, 30)), 0.1, false);
  add('opaque noise, nudged, with anti-aliasing', image(16, 16, opaqueNoise), image(16, 16, nudged(opaqueNoise, random, 40, 30)), 0.1, true);
  add('opaque noise against other noise, threshold 1', image(16, 16, opaqueNoise), image(16, 16, noise(16, 16, random, { opaque: true })), 1, false);

  add('an anti-aliased edge moved by one pixel', image(12, 6, edgeImage(12, 6, 5)), image(12, 6, edgeImage(12, 6, 6)), 0.1, false);
  add('an anti-aliased edge moved by one pixel, counted', image(12, 6, edgeImage(12, 6, 5)), image(12, 6, edgeImage(12, 6, 6)), 0.1, true);

  const screen = blocks(24, 24, random);
  add('blocks, a few pixels changed', image(24, 24, screen), image(24, 24, nudged(screen, random, 12, 120)), 0.05, false);
  add('blocks against other blocks', image(24, 24, screen), image(24, 24, blocks(24, 24, random)), 0.1, false);

  const translucent = noise(12, 12, random, { opaque: false });
  add('translucent noise, nudged', image(12, 12, translucent), image(12, 12, nudged(translucent, random, 30, 40)), 0.1, false);
  add('translucent noise, nudged, with anti-aliasing', image(12, 12, translucent), image(12, 12, nudged(translucent, random, 30, 40)), 0.1, true);
  add('translucent against other translucent noise', image(12, 12, translucent), image(12, 12, noise(12, 12, random, { opaque: false })), 0.2, false);

  add('different sizes', solid(4, 4, [255, 255, 255, 255]), solid(4, 5, [255, 255, 255, 255]), 0.1, false);
  return cases;
}

// A stillness scenario is a scripted timeline of one loop: when stabilize was called
// (`loopStartMs`, Android's clock start), when the first screenshot was done (`firstShotDoneMs`,
// iOS's), and for each tick when the timer fired (`tickMs`, iOS reads its clock then), when the
// screenshot was taken (`capturedMs`, Android reads its clock then), how the pair compared, and
// whether Android cleared a focused field (when it restarted its clock: `focusClearedMs`).
function stillnessScenarios() {
  const tick = (tickMs, pair, focusCleared = false) => ({
    tickMs,
    capturedMs: tickMs + 20,
    focusClearedMs: tickMs + 25,
    pair,
    focusCleared,
  });
  const ticksEvery = (intervalMs, pairs, firstMs = intervalMs) =>
    pairs.map((pair, index) => tick(firstMs + index * intervalMs, pair));

  const settings = (requiredMatches, minScreenshotsCount, timeoutMs) => ({
    requiredMatches,
    minScreenshotsCount,
    timeoutMs,
    threshold: 0,
    includeAA: true,
  });

  return [
    {
      name: 'settles at once',
      ...settings(3, 1, 5000),
      loopStartMs: 0,
      firstShotDoneMs: 60,
      ticks: ticksEvery(200, ['same', 'same', 'same']),
    },
    {
      name: 'never settles: the minimum screenshots differ by the first one',
      ...settings(3, 6, 500),
      loopStartMs: 0,
      firstShotDoneMs: 60,
      ticks: ticksEvery(200, Array(8).fill('differs')),
    },
    {
      name: 'settles, then moves again past the time limit',
      ...settings(5, 1, 1000),
      loopStartMs: 0,
      firstShotDoneMs: 60,
      ticks: ticksEvery(250, ['differs', 'same', 'same', 'same', 'same', 'same', 'differs', 'same']),
    },
    {
      name: 'the clocks start at different moments',
      ...settings(3, 1, 1000),
      loopStartMs: 0,
      firstShotDoneMs: 200,
      ticks: [tick(1000, 'differs'), tick(1100, 'differs'), tick(1300, 'differs')],
    },
    {
      name: 'a cleared focus starts the count and the clock again',
      ...settings(3, 1, 1000),
      loopStartMs: 0,
      firstShotDoneMs: 60,
      ticks: [
        tick(200, 'same'),
        tick(400, 'same', true),
        tick(1100, 'differs'),
        tick(1300, 'differs'),
        tick(1500, 'same'),
        tick(1700, 'same'),
        tick(1900, 'same'),
      ],
    },
    {
      name: 'the screen changes size',
      ...settings(3, 1, 5000),
      loopStartMs: 0,
      firstShotDoneMs: 60,
      ticks: ticksEvery(200, ['same', 'same', 'size', 'same', 'same', 'same']),
    },
    {
      name: 'one still pair is enough',
      ...settings(1, 1, 1000),
      loopStartMs: 0,
      firstShotDoneMs: 60,
      ticks: ticksEvery(200, ['differs', 'differs', 'same']),
    },
  ];
}

// ---- The words the two recorders read ------------------------------------------------------------

function pixelCompareInput(cases) {
  return cases
    .map((pixelCase) =>
      [
        pixelCase.a.width,
        pixelCase.a.height,
        pixelCase.b.width,
        pixelCase.b.height,
        pixelCase.threshold,
        pixelCase.includeAA ? 1 : 0,
        pixelCase.a.pixels,
        pixelCase.b.pixels,
      ].join(' ')
    )
    .join('\n');
}

function stillnessInput(scenarios) {
  return scenarios
    .map((scenario) =>
      [
        scenario.requiredMatches,
        scenario.minScreenshotsCount,
        scenario.timeoutMs,
        scenario.threshold,
        scenario.includeAA ? 1 : 0,
        scenario.loopStartMs,
        scenario.firstShotDoneMs,
        scenario.ticks.length,
        ...scenario.ticks.flatMap((tick) => [
          tick.tickMs,
          tick.capturedMs,
          tick.focusClearedMs,
          tick.pair,
          tick.focusCleared ? 1 : 0,
        ]),
      ].join(' ')
    )
    .join('\n');
}

// ---- Running the originals -----------------------------------------------------------------------

function original(file) {
  return execFileSync('git', ['show', ORIGINALS_COMMIT + ':' + file], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function recordIos(workDir, inputs) {
  const iosDir = path.join(workDir, 'ios');
  fs.mkdirSync(iosDir, { recursive: true });
  fs.writeFileSync(path.join(iosDir, 'Pixelmatch.h'), original(ORIGINAL_IOS_HEADER));
  fs.writeFileSync(path.join(iosDir, 'Pixelmatch.m'), original(ORIGINAL_IOS_SOURCE));
  const recorder = path.join(iosDir, 'record');
  execFileSync('xcrun', [
    'clang',
    '-fobjc-arc',
    '-O0',
    '-I',
    path.join(HERE, 'ios'),
    '-I',
    iosDir,
    path.join(iosDir, 'Pixelmatch.m'),
    path.join(HERE, 'ios', 'record.m'),
    '-framework',
    'Foundation',
    '-framework',
    'CoreGraphics',
    '-o',
    recorder,
  ]);
  return runRecorder(recorder, [], workDir, inputs);
}

function recordAndroid(workDir, inputs) {
  const javaDir = path.join(workDir, 'android');
  const packageDir = path.join(javaDir, 'io', 'sherlo', 'storybookreactnative');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'Pixelmatch.java'), original(ORIGINAL_JAVA_SOURCE));
  const classes = path.join(javaDir, 'classes');
  execFileSync('javac', [
    '-d',
    classes,
    path.join(packageDir, 'Pixelmatch.java'),
    path.join(HERE, 'android', 'android', 'graphics', 'Bitmap.java'),
    path.join(HERE, 'android', 'Record.java'),
  ]);
  return runRecorder('java', ['-cp', classes, 'Record'], workDir, inputs);
}

/** Runs a recorder with the two input files; returns its answers, one list per input file. */
function runRecorder(command, args, workDir, inputs) {
  const pixelFile = path.join(workDir, 'pixel-compare.txt');
  const stillnessFile = path.join(workDir, 'stillness.txt');
  fs.writeFileSync(pixelFile, inputs.pixelCompare + '\n');
  fs.writeFileSync(stillnessFile, inputs.stillness + '\n');
  const output = execFileSync(command, [...args, pixelFile, stillnessFile], { encoding: 'utf8' });
  const [pixelAnswers, stillnessAnswers] = output.trim().split('\n---\n');
  return { pixelCompare: pixelAnswers.split('\n'), stillness: stillnessAnswers.split('\n') };
}

function record() {
  const cases = pixelCompareCases();
  const scenarios = stillnessScenarios();
  const inputs = { pixelCompare: pixelCompareInput(cases), stillness: stillnessInput(scenarios) };

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-parity-recorder-'));
  const ios = recordIos(workDir, inputs);
  const android = recordAndroid(workDir, inputs);
  fs.rmSync(workDir, { recursive: true, force: true });

  const answer = (word) => (word === 'size-mismatch' ? word : Number(word));
  const pixelFixture = {
    recordedFrom: ORIGINALS_COMMIT,
    cases: cases.map((pixelCase, index) => ({
      ...pixelCase,
      ios: answer(ios.pixelCompare[index]),
      android: answer(android.pixelCompare[index]),
    })),
  };
  const stillnessFixture = {
    recordedFrom: ORIGINALS_COMMIT,
    scenarios: scenarios.map((scenario, index) => ({
      ...scenario,
      ios: ios.stillness[index].split(' '),
      android: android.stillness[index].split(' '),
    })),
  };
  fs.writeFileSync(path.join(FIXTURES, 'pixel-compare.json'), JSON.stringify(pixelFixture, null, 2) + '\n');
  fs.writeFileSync(path.join(FIXTURES, 'stillness.json'), JSON.stringify(stillnessFixture, null, 2) + '\n');
  console.log('recorded ' + cases.length + ' pixel compares and ' + scenarios.length + ' stillness loops');
}

module.exports = { record };

if (require.main === module) record();
