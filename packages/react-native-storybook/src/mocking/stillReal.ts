import runLog from '../helpers/RunnerBridge/actions/log';
import type { UnansweredRequest } from './networkRules';

/**
 * SPIKE still-real-on-hermes: what the polyfill's recording stand-ins (metro/polyfill.js) saw while
 * a story rendered, written to the run's log - the log `sherlo capture --logs` prints - one line
 * per story, after the story has rendered and settled.
 *
 * The polyfill makes the watcher only in testing mode, and only when the bundler listed the app's
 * modules; in the story browser and in a store build there is none, and every function here does
 * nothing. Watching must never break what it watches, so each one swallows its own failure.
 */

export const STILL_REAL_PREFIX = '[Sherlo still-real]';

export type StillRealModule = { module: string; exports: string[] };

type Watcher = {
  isTesting: boolean;
  startedAt: number;
  paths: Record<string, string> | null;
  watchedCount: number;
  wrapMs: number;
  reads: number;
  now: () => number;
  startStory: () => number;
  readStory: () => StillRealModule[];
};

let startLineWritten = false;

function watcher(): Watcher | undefined {
  const found = (globalThis as { __sherloStillReal?: Watcher }).__sherloStillReal;
  return found && found.isTesting ? found : undefined;
}

/**
 * A story is about to start: forget what was read before, and - the first time - write the line
 * that says how many modules are watched and what installing the stand-ins cost.
 */
export function startStillRealStory(): void {
  try {
    const watching = watcher();
    if (!watching) return;

    if (!startLineWritten) {
      startLineWritten = true;
      const listed = watching.paths ? Object.keys(watching.paths).length : 0;
      if (watching.watchedCount === 0) {
        runLog(`${STILL_REAL_PREFIX} not watching, 0 modules`, {
          listed,
          sincePolyfillMs: round(watching.now() - watching.startedAt),
        });
      } else {
        runLog(
          `${STILL_REAL_PREFIX} watching ${watching.watchedCount} modules, installed in ${round(watching.wrapMs)} ms`,
          { listed, sincePolyfillMs: round(watching.now() - watching.startedAt) }
        );
      }
    }
    watching.startStory();
  } catch (_) {
    // Watching never breaks the story.
  }
}

/**
 * The story has rendered and settled: write one line - the modules still real (path and the
 * exports read) and the requests no rule answered.
 */
export function logStillRealOfStory(storyId: string, unanswered: UnansweredRequest[]): void {
  try {
    const watching = watcher();
    if (!watching) return;

    const started = watching.now();
    const modules = watching.readStory();
    runLog(`${STILL_REAL_PREFIX} story ${storyId}`, {
      modules,
      unanswered,
      reads: watching.reads,
      readMs: round(watching.now() - started),
    });
  } catch (_) {
    // Watching never breaks the story.
  }
}

/** Tests only: forget that the start line was written. */
export function resetStillRealForTests(): void {
  startLineWritten = false;
}

function round(milliseconds: number): number {
  return Math.round(milliseconds * 100) / 100;
}
