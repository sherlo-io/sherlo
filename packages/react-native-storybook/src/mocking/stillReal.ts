import { activeMockLookups } from './registry';

/**
 * What the polyfill's recording stand-ins (metro/polyfill.js) saw while a story rendered: the
 * app's own modules that ran as real code, and the exports of each that were read.
 *
 * The polyfill makes the watcher when the JavaScript starts in testing mode, and it watches only in
 * a capture: when the bundle also carries the bundler's list of the app's modules, which only a
 * bundle the bundler served does (metro/stillReal.js). In the story browser, in a cloud test run
 * and in a store build nothing is watched, and every function here answers nothing. Watching must
 * never break what it watches, so each one swallows its own failure.
 */

export type StillRealModule = { module: string; exports: string[] };

type Watcher = {
  isTesting: boolean;
  isCapture?: () => boolean;
  startStory: () => void;
  readStory: () => StillRealModule[];
};

function watcher(): Watcher | undefined {
  const found = (globalThis as { __sherloStillReal?: Watcher }).__sherloStillReal;
  return found && found.isTesting ? found : undefined;
}

/**
 * Whether this JavaScript runs in a capture, the one place that lists what ran real: the polyfill's
 * own answer, so the network and the modules are watched by the same sign. A cloud test run
 * reports testing mode too, and is never a capture.
 */
export function isACapture(): boolean {
  try {
    return watcher()?.isCapture?.() === true;
  } catch (_) {
    // Watching never breaks the story: no answer is no capture.
    return false;
  }
}

/** A story is about to start: forget what was read before. */
export function startStillRealStory(): void {
  try {
    watcher()?.startStory();
  } catch (_) {
    // Watching never breaks the story.
  }
}

/** The modules the current story ran as real code, with the exports read, sorted by path. */
export function stillRealModulesWithExports(): StillRealModule[] {
  try {
    return watcher()?.readStory() ?? [];
  } catch (_) {
    // Watching never breaks the story.
    return [];
  }
}

/**
 * The paths of the modules the current story ran as real code, from the project root with no
 * leading './' - and never a module the story mocks.
 */
export function stillRealModulesOfStory(): string[] {
  const mockedKeys = Object.keys(activeMockLookups()?.mocks ?? {}).map(withoutExtension);
  return stillRealModulesWithExports()
    .map(({ module }) => module)
    .filter((module) => !mockedKeys.some((key) => isMockedBy(withoutExtension(module), key)));
}

// A mock key names an app module as the story wrote it ('./src/chat', 'src/chat') or, when the
// bundler resolved it beside a file, by the absolute path without extension.
function isMockedBy(modulePath: string, key: string): boolean {
  const bare = key.replace(/^\.\//, '');
  const names = modulePath.endsWith('/index')
    ? [modulePath, modulePath.slice(0, -6)]
    : [modulePath];
  return names.some((name) => bare === name || (bare.startsWith('/') && bare.endsWith(`/${name}`)));
}

function withoutExtension(path: string): string {
  return path.replace(/(\.(android|ios|native|web))?\.[cm]?[jt]sx?$/, '');
}

/**
 * The libraries that carry a private copy of the package `key` names
 * (node_modules/amp-lib/node_modules/pkg), which a mock of the app's copy never reaches. The
 * bundler hands them over keyed by package name (metro/stillReal.js, privateCopiesOf) beside the
 * app's modules; none when it did not.
 */
export function privateCopiesHandedByBundler(key: string): string[] {
  const listed = (globalThis as { __sherloPrivateCopies?: Record<string, string[]> })
    .__sherloPrivateCopies;
  return listed?.[key] ?? [];
}
