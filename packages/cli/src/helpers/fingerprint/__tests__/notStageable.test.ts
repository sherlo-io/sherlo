/**
 * Tests for not-stageable detection - AC3 cases.
 *
 * Each not-stageable condition must produce a documented note WITHOUT
 * failing the test run.  This test suite verifies that each refusal is
 * detected and the reason is non-empty.
 *
 * The checkStageable function now receives gate metadata as a pre-computed
 * GateMetadataInput - it no longer re-sniffs the binary for RAM or embedded
 * bundle checks.  Tests control behavior through the metadata fields directly.
 */
import { describe, expect, it } from 'vitest';
import { checkStageable } from '../notStageable';
import type { GateMetadataInput } from '../gateMetadata';

// ---------------------------------------------------------------------------
// Minimal valid metadata used as the "passing" baseline.
// ---------------------------------------------------------------------------

const PASSING_METADATA: GateMetadataInput = {
  engineClass: 'hermes',
  bundleFormat: 'hbc',
  hasEmbeddedBundle: true,
  assetInventory: ['assets/index.android.bundle'],
  expoUpdatesEnabled: false,
  sdkProtocolVersion: '1.0.0',
  buildMetadata: { buildMode: 'release' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkStageable', () => {
  // --- AC3a: expo-updates-enabled Android APK → failReason: expo-updates-enabled-android ---

  it('refuses stageable on expo-updates-enabled Android APK (AC3a)', async () => {
    const result = await checkStageable({
      platform: 'android',
      gateMetadata: { ...PASSING_METADATA, expoUpdatesEnabled: true },
      buildType: 'preview',
    });

    expect(result.stageable).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toMatch(/expo-updates/i);
  });

  // expo-updates on iOS is NOT a refusal (only Android is gated by AC3a).
  it('allows expo-updates on iOS (no expo-updates refusal)', async () => {
    const result = await checkStageable({
      platform: 'ios',
      gateMetadata: { ...PASSING_METADATA, expoUpdatesEnabled: true },
      buildType: 'preview',
    });

    // On iOS with hasEmbeddedBundle: true and bundleFormat: 'hbc', should pass.
    expect(result.stageable).toBe(true);
  });

  // --- AC3b: RAM bundle → failReason: ram-bundle ---

  it('refuses stageable on RAM bundle (AC3b)', async () => {
    const result = await checkStageable({
      platform: 'android',
      gateMetadata: { ...PASSING_METADATA, bundleFormat: 'ram' },
      buildType: 'preview',
    });

    expect(result.stageable).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toMatch(/ram/i);
  });

  // --- AC3c: Debug build without an embedded bundle → failReason: missing-embedded-bundle ---

  it('refuses stageable on development build without embedded bundle (AC3c)', async () => {
    const result = await checkStageable({
      platform: 'ios',
      gateMetadata: { ...PASSING_METADATA, hasEmbeddedBundle: false },
      buildType: 'development',
    });

    expect(result.stageable).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toMatch(/debug|embedded bundle/i);
  });

  // --- AC3d: Preview build without an embedded bundle → failReason: missing-embedded-bundle (brownfield wording) ---

  it('refuses stageable on preview build without embedded bundle - brownfield (AC3d)', async () => {
    const result = await checkStageable({
      platform: 'android',
      gateMetadata: { ...PASSING_METADATA, hasEmbeddedBundle: false },
      buildType: 'preview',
    });

    expect(result.stageable).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.reason).toMatch(/default path|custom-bundle|brownfield/i);
  });

  // --- All checks pass ---

  it('passes stageable check when all conditions are met', async () => {
    const result = await checkStageable({
      platform: 'android',
      gateMetadata: PASSING_METADATA,
      buildType: 'preview',
    });

    expect(result.stageable).toBe(true);
  });
});
