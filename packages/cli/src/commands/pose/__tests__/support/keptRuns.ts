/**
 * RUNNING A POSE TWICE IS THE WASTE, and two cases read the same run of every pose: the
 * committed-bytes case and the leftover-calls case. So a run is kept the first time and handed
 * back after. The determinism case turns the keeping off, because it runs one pose twice to
 * compare. A test file hands `posesRunOnce` to its `vi.mock` of `../pose`.
 *
 * THIS FILE IMPORTS NOTHING FROM THE POSE MODULE BUT ITS TYPE: the mock of that module loads this
 * file, so a real import here would wait on the mock that is waiting on it.
 */
let keepRuns = true;

/** The pose module with its `runPose` answering a pose it already ran from the first run. */
export function posesRunOnce(original: typeof import('../../pose')): typeof import('../../pose') {
  const runsKept = new Map<string, Promise<unknown>>();

  return {
    ...original,
    runPose: (...args: Parameters<typeof original.runPose>) => {
      if (!keepRuns) return original.runPose(...args);

      const key = JSON.stringify(args);
      if (!runsKept.has(key)) runsKept.set(key, original.runPose(...args));
      return runsKept.get(key) as ReturnType<typeof original.runPose>;
    },
  };
}

/** Turn the keeping of runs off or on. */
export function keepRunsOfPoses(keep: boolean): void {
  keepRuns = keep;
}
