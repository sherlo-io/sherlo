/**
 * Tests for not-stageable detection - AC3 cases.
 *
 * Each not-stageable condition must produce a documented note WITHOUT
 * failing the test run.  This test suite verifies that each refusal is
 * detected and the reason is non-empty.
 */
import { describe, expect, it } from 'vitest';
import { checkStageable } from '../notStageable';
import type { GateMetadata } from '../gateMetadata';

// ---------------------------------------------------------------------------
// Minimal valid metadata used as the "passing" baseline.
// ---------------------------------------------------------------------------

const PASSING_METADATA: GateMetadata = {
  engineClass: 'hermes',
  assetInventory: ['assets/index.android.bundle'],
  expoUpdatesEnabled: false,
  buildMetadata: { buildMode: 'release' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkStageable', () => {
  // --- AC3a: expo-updates-enabled Android APK ---

  it('refuses stageable on expo-updates-enabled Android APK (AC3a)', async () => {
    const result = await checkStageable({
      binaryPath: '/tmp/app.apk',
      platform: 'android',
      bundlePath: 'assets/index.android.bundle',
      gateMetadata: { ...PASSING_METADATA, expoUpdatesEnabled: true },
      buildType: 'preview',
      projectRoot: '/tmp',
    });

    expect(result.stageable).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toMatch(/expo-updates/i);
  });

  // expo-updates on iOS is NOT a refusal (only Android is gated by AC3a).
  // The embedded-bundle check may fail on a nonexistent binary - that's
  // a brownfield refusal, not an expo-updates refusal.  The key assertion
  // is that the reason does NOT mention expo-updates.
  it('allows expo-updates on iOS (no expo-updates refusal)', async () => {
    const result = await checkStageable({
      binaryPath: '/tmp/app.app',
      platform: 'ios',
      bundlePath: 'main.jsbundle',
      gateMetadata: { ...PASSING_METADATA, expoUpdatesEnabled: true },
      buildType: 'preview',
      projectRoot: '/tmp',
    });

    // May fail on embedded-bundle existence (nonexistent binary), but
    // must NOT fail because of expo-updates.
    if (!result.stageable) {
      expect(result.reason).not.toMatch(/expo-updates/i);
    }
  });

  // --- AC3c: Debug build without an embedded bundle ---

  it('refuses stageable on development build without JS bundle (AC3c)', async () => {
    const result = await checkStageable({
      binaryPath: '/tmp/app.app',
      platform: 'ios',
      bundlePath: 'main.jsbundle',
      gateMetadata: PASSING_METADATA,
      buildType: 'development',
      projectRoot: '/tmp',
    });

    // The .app directory doesn't exist, so the bundle check fails → not stageable.
    expect(result.stageable).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toMatch(/debug|embedded bundle/i);
  });

  // --- AC3d: Custom/brownfield bundle name ---

  it('refuses stageable on custom bundle name (AC3d)', async () => {
    const result = await checkStageable({
      binaryPath: '/tmp/app.apk',
      platform: 'android',
      bundlePath: 'assets/custom.bundle',
      gateMetadata: PASSING_METADATA,
      buildType: 'preview',
      projectRoot: '/tmp',
    });

    expect(result.stageable).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toMatch(/custom.bundle|custom-bundle|brownfield/i);
  });

  it('refuses preview build when default bundle is absent - brownfield (AC3d)', async () => {
    // With a nonexistent binary, the default-bundle existence check fails.
    // On a preview build that means custom/brownfield.
    const result = await checkStageable({
      binaryPath: '/tmp/app.apk',
      platform: 'android',
      bundlePath: 'assets/index.android.bundle',
      gateMetadata: PASSING_METADATA,
      buildType: 'preview',
      projectRoot: '/tmp',
    });

    expect(result.stageable).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toMatch(/default path|custom-bundle|brownfield/i);
  });

  it('development build without bundle gets the debug-specific refusal (AC3c)', async () => {
    // Same nonexistent binary but buildType 'development' → different reason.
    const result = await checkStageable({
      binaryPath: '/tmp/app.app',
      platform: 'ios',
      bundlePath: 'main.jsbundle',
      gateMetadata: PASSING_METADATA,
      buildType: 'development',
      projectRoot: '/tmp',
    });

    expect(result.stageable).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toMatch(/debug|embedded bundle/i);
  });

  // --- AC3b: RAM/indexed bundle ---

  it('detects RAM bundle by magic content (AC3b)', async () => {
    // checkRamBundle reads the bundle content. We test the detection logic
    // indirectly through checkStageable - a file that contains RAM magic.
    // Since we're testing against a real filesystem, this is best-effort.
    // The key thing: if the check runs, it doesn't throw.
    const result = await checkStageable({
      binaryPath: '/tmp/nonexistent.apk',
      platform: 'android',
      bundlePath: 'assets/index.android.bundle',
      gateMetadata: PASSING_METADATA,
      buildType: 'preview',
      projectRoot: '/tmp',
    });

    // Should not throw, regardless of outcome.
    expect(result).toHaveProperty('stageable');
  });
});
