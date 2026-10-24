/**
 * The clock a settle is timed on. A scene may mock the clock (mockClock freezes `Date`), and a
 * settle timed on the mocked clock reads 0 ms however long it took. So the time read is taken here,
 * as this module loads, before any story's mock exists: a clock mocked later, of `Date` or of
 * `performance`, is not the one read.
 */

// `performance.now` where the runtime has it (React Native and Node do): it never steps back.
// Else `Date.now` as it was at load, which a later mock of `Date` does not reach.
const readClockAtLoad: () => number =
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now.bind(globalThis.performance)
    : Date.now;

let latestReadMs = -Infinity;

/** Milliseconds on a clock that only moves forward and that no story mock can freeze. */
export function monotonicNow(): number {
  latestReadMs = Math.max(latestReadMs, readClockAtLoad());
  return latestReadMs;
}
