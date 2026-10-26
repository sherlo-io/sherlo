/**
 * How a scene settles: the native stability loops on iOS and Android, which end as soon as the
 * screen is still, and the clock the settle is timed on (../settleClock.ts). The native loops
 * cannot run here, so their rules are read from their sources; the device checks run them.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Before settleClock loads: the clock it takes at load is this one, moved only by the test.
const appClock = vi.hoisted(() => {
  const clock = { ms: 1_000, realNow: globalThis.performance.now };
  Object.defineProperty(globalThis.performance, 'now', {
    configurable: true,
    writable: true,
    value: () => clock.ms,
  });
  return clock;
});

import { monotonicNow } from '../settleClock';
import { installClock, restoreClock } from '../mocking/clock';

// packages/react-native-storybook root: this file is at src/__tests__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..');
const IOS_SOURCE = fs.readFileSync(path.join(SDK_ROOT, 'ios', 'StabilityHelper.m'), 'utf8');
const ANDROID_SOURCE = fs.readFileSync(
  path.join(SDK_ROOT, 'android/src/main/java/io/sherlo/storybookreactnative/StabilityHelper.java'),
  'utf8'
);

// The core counts pairs of screenshots in a row with no differing pixel; the run's config counts
// matching screenshots. The rule each platform turns one into the other with, read from its source.
function stillPairsRule(source: string): (matchingScreenshots: number) => number {
  const rule = source.match(
    /stillPairsForMatchingScreenshots\((?:double|int) matchingScreenshots\)\s*\{\s*return (?:MAX|Math\.max)\((?:\(int32_t\))?matchingScreenshots - (\d+), (\d+)\);/
  );
  if (!rule) throw new Error('no stillPairsForMatchingScreenshots rule in the source');
  const [, less, floor] = rule;
  return (matchingScreenshots) => Math.max(matchingScreenshots - Number(less), Number(floor));
}

afterAll(() => {
  Object.defineProperty(globalThis.performance, 'now', {
    configurable: true,
    writable: true,
    value: appClock.realNow,
  });
});

describe('a scene settles faster and honestly', () => {
  it('stops once 3 samples in a row match instead of taking 6', () => {
    for (const [platform, source] of [
      ['ios', IOS_SOURCE],
      ['android', ANDROID_SOURCE],
    ] as const) {
      const stillPairs = stillPairsRule(source)(3);
      // Three screenshots in a row that match are two still pairs: the loop ends at the third.
      expect(stillPairs, platform).toBe(2);
      expect(stillPairs + 1, platform).toBeLessThan(6);
    }
    // The core is handed the rule's pairs, and the old minimum stays as the run sent it.
    expect(IOS_SOURCE).toContain(
      'params.required_still_pairs = stillPairsForMatchingScreenshots(requiredMatches);'
    );
    expect(IOS_SOURCE).toContain('params.minimum_screenshots = (int32_t)minScreenshotsCount;');
    expect(ANDROID_SOURCE).toMatch(
      /StillnessDecision\.begin\(\s*stillPairsForMatchingScreenshots\(requiredMatches\),\s*minScreenshotsCount,/
    );
  });

  it('settle time reads on a monotonic clock the clock mock does not freeze', () => {
    installClock('2020-01-02T03:04:05.000Z');
    try {
      // A clock mocked after load, of the date or of performance, is not the clock the settle reads.
      Object.defineProperty(globalThis.performance, 'now', {
        configurable: true,
        writable: true,
        value: () => 0,
      });
      const startedAt = monotonicNow();
      appClock.ms += 250;
      expect(Date.now()).toBe(Date.parse('2020-01-02T03:04:05.000Z'));
      expect(monotonicNow() - startedAt).toBe(250);
      // A clock that steps back never makes a settle shorter.
      appClock.ms -= 1_000;
      expect(monotonicNow() - startedAt).toBe(250);
    } finally {
      restoreClock();
    }
    // The native loops time the settle on clocks that never step back either.
    expect(IOS_SOURCE).toContain('CACurrentMediaTime()');
    expect(ANDROID_SOURCE).not.toContain('System.currentTimeMillis()');
    expect(ANDROID_SOURCE).toContain('SystemClock.uptimeMillis()');
  });

  it("the boot reading counts from the scene's JavaScript start, never from the phone's own start", async () => {
    const clock = { ms: 356_130_293.7 };
    const priorNow = globalThis.performance.now;
    Object.defineProperty(globalThis.performance, 'now', {
      configurable: true,
      writable: true,
      value: () => clock.ms,
    });
    try {
      vi.resetModules();
      // Booting a scene loads the clock before the app's first module (sceneBoot imports it first).
      await import('../settleClock');
      clock.ms += 1_500;
      const { monotonicNow: freshMonotonicNow } = await import('../settleClock');
      expect(freshMonotonicNow()).toBe(1_500);
    } finally {
      Object.defineProperty(globalThis.performance, 'now', {
        configurable: true,
        writable: true,
        value: priorNow,
      });
    }
    expect(fs.readFileSync(path.join(SDK_ROOT, 'src', 'sceneBoot.ts'), 'utf8')).toMatch(
      /^import '\.\/settleClock';$/m
    );
  });

  it('a settle that times out fails the capture', () => {
    // Every verdict but still resolves the native promise false, on both platforms.
    expect(IOS_SOURCE).toContain('resolve(verdict == SHERLO_STILL_STABLE ? @YES : @NO);');
    expect(ANDROID_SOURCE).toMatch(
      /STILL_UNSTABLE\) \{\s*Log\.d\(TAG, "UI is not stable - timeout with no matches"\);\s*finish\(false\);/
    );
    expect(ANDROID_SOURCE).toMatch(/!= CompiledCore\.STILL_CONTINUE\) \{[^}]*finish\(false\);/);
    // A first screenshot that fails ends the settle false, never leaving the promise open.
    expect(ANDROID_SOURCE).not.toContain('throw firstCaptureFailed;');
    expect(ANDROID_SOURCE).toMatch(
      /catch \(RuntimeException firstCaptureFailed\) \{[^}]*onResult\(false\);/
    );
  });
});
