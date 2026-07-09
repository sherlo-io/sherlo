/**
 * Not-stageable detection.
 *
 * Each check returns a human-readable reason string when the artifact CANNOT
 * be a staging base, or `null` when it passes.  All checks are non-fatal -
 * they produce a printed note and let the test run proceed untouched.
 *
 * Reasons are aligned with the API's failReason derivation so local and
 * server agree:
 *   - expo-updates-enabled-android
 *   - ram-bundle
 *   - missing-embedded-bundle
 */
import { Platform } from '@sherlo/api-types';
import type { GateMetadataInput } from './gateMetadata';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type StageableCheck = {
  /** `true` when the artifact CAN be registered as a base. */
  stageable: boolean;
  /** When not stageable, a precise reason to print; undefined otherwise. */
  reason?: string;
};

/**
 * Run all not-stageable checks against a binary's gate metadata.
 *
 * Returns the FIRST failing reason, or `{ stageable: true }` when all pass.
 * Each failing case corresponds to one API failReason and includes a
 * documented one-line config change where applicable.
 *
 * Unlike the prior version, this does NOT re-sniff the binary for RAM or
 * embedded-bundle checks - those are already populated in gateMetadata by
 * extractGateMetadata().
 */
export async function checkStageable({
  platform,
  gateMetadata,
  buildType,
}: {
  platform: Platform;
  gateMetadata: GateMetadataInput;
  buildType: 'preview' | 'development';
}): Promise<StageableCheck> {
  // (a) expo-updates-enabled Android APK → API failReason: expo-updates-enabled-android
  if (platform === 'android' && gateMetadata.expoUpdatesEnabled) {
    return {
      stageable: false,
      reason:
        'Staged uploads are not supported on Android when expo-updates is enabled. ' +
        'Set "expo.updates.enabled: false" in your Android app config or use a ' +
        'test:standard build without expo-updates for staging.',
    };
  }

  // (b) RAM/indexed bundle → API failReason: ram-bundle
  if (gateMetadata.bundleFormat === 'ram') {
    return {
      stageable: false,
      reason:
        'RAM/indexed bundle format detected. Staged uploads require a ' +
        'single-file JS bundle. Disable RAM bundling in your Metro config.',
    };
  }

  // (c) + (d) Embedded bundle existence at the platform-default path.
  //   - development build → API failReason: missing-embedded-bundle (debug wording)
  //   - preview / release build → API failReason: missing-embedded-bundle (brownfield wording)
  if (!gateMetadata.hasEmbeddedBundle) {
    if (buildType === 'development') {
      return {
        stageable: false,
        reason:
          'Debug builds without an embedded JS bundle cannot be staged. ' +
          'Use a release/preview build with --minify enabled, or run a ' +
          'standard test without staging.',
      };
    }
    return {
      stageable: false,
      reason:
        'No embedded bundle found at the default path. ' +
        'Brownfield / custom-bundle-name projects cannot use staged uploads. ' +
        'Set the bundle asset name to the platform default or use standard testing.',
    };
  }

  // NOTE: Split-APK detection was dropped from this iteration.
  // The previous single-ABI heuristic (abis.size === 1) produced false
  // positives for legitimate arm64-only universal APKs.  A real split APK
  // is identified by manifest markers (android:isSplitRequired) or a
  // config.*.apk sibling set, not by ABI count.  Until we can detect those
  // cheaply, skip this check rather than ship false positives.

  return { stageable: true };
}
