/**
 * Replaces Node's default "exit immediately" SIGINT behavior for the duration
 * of a wait (./waitForBuildResult): the returned promise resolves on the first
 * Ctrl-C, letting the poll loop stop cleanly and exit with EXIT_SIGINT.
 * `cleanup` restores the default by removing the listener.
 */
export function createSigintSignal(): { promise: Promise<void>; cleanup: () => void } {
  let resolveSignal: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveSignal = resolve;
  });

  const handler = () => resolveSignal();
  process.once('SIGINT', handler);

  return { promise, cleanup: () => process.off('SIGINT', handler) };
}
