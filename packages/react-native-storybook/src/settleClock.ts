/**
 * The clock a settle is timed on. A scene may mock the clock (mockClock freezes `Date`), and a
 * settle timed on the mocked clock reads 0 ms however long it took. So the time read is taken here,
 * as this module loads, before any story's mock exists: a clock mocked later, of `Date` or of
 * `performance`, is not the one read.
 *
 * Readings count from the scene's JavaScript start, not from the phone's own start (on iOS
 * `performance.now` is the phone's uptime): the core takes a reading at capture start as the app's
 * boot time. This module is the first import of ./sceneBoot, so it loads before the app's first
 * module and takes the start then. Every other caller subtracts two readings, which the start
 * leaves as they were.
 */

// `performance.now` where the runtime has it (React Native and Node do): it never steps back.
// Else `Date.now` as it was at load, which a later mock of `Date` does not reach.
const readClockAtLoad: () => number =
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now.bind(globalThis.performance)
    : Date.now;

const scriptStartMs = readClockAtLoad();

let latestReadMs = 0;

/**
 * Milliseconds since the scene's JavaScript started, on a clock that only moves forward and that
 * no story mock can freeze.
 */
export function monotonicNow(): number {
  latestReadMs = Math.max(latestReadMs, readClockAtLoad() - scriptStartMs);
  return latestReadMs;
}
