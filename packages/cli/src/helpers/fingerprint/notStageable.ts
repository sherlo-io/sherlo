/**
 * Not-stageable detection.
 *
 * Each check returns a human-readable reason string when the artifact CANNOT
 * be a staging base, or `null` when it passes.  All checks are non-fatal -
 * they produce a printed note and let the test run proceed untouched.
 */
import path from 'path';
import { Platform } from '@sherlo/api-types';
import accessFileInArchive from '../getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInArchive';
import accessFileInDirectory from '../getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInDirectory';
import type { GateMetadata } from './gateMetadata';

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
 * Run all not-stageable checks against a binary.
 *
 * Returns the FIRST failing reason, or `{ stageable: true }` when all pass.
 * Each failing case corresponds to one AC3 sub-case and includes a documented
 * one-line config change where applicable.
 */
export async function checkStageable({
  binaryPath,
  platform,
  bundlePath,
  gateMetadata,
  buildType,
  projectRoot,
}: {
  binaryPath: string;
  platform: Platform;
  /** Bundle path within the binary (e.g. "assets/index.android.bundle"). */
  bundlePath: string;
  gateMetadata: GateMetadata;
  buildType: 'preview' | 'development';
  projectRoot: string;
}): Promise<StageableCheck> {
  const fileName = path.basename(binaryPath);

  // (a) expo-updates-enabled Android APK
  if (platform === 'android' && gateMetadata.expoUpdatesEnabled) {
    return {
      stageable: false,
      reason:
        'Staged uploads are not supported on Android when expo-updates is enabled. ' +
        'Set "expo.updates.enabled: false" in your Android app config or use a ' +
        'test:standard build without expo-updates for staging.',
    };
  }

  // (b) RAM/indexed bundle detection
  const ramBundleCheck = await checkRamBundle({ binaryPath, bundlePath, fileName, projectRoot });
  if (!ramBundleCheck.stageable) return ramBundleCheck;

  // (c) + (d) Embedded bundle existence at the platform-default path.
  // `bundlePath` is the fixed platform default (assets/index.android.bundle
  // or main.jsbundle).  If that file is absent:
  //   - development build → AC3c: Debug build without an embedded bundle
  //   - preview / release build → AC3d: custom/brownfield bundle name
  const hasBundle = await checkHasEmbeddedBundle({
    binaryPath,
    bundlePath,
    fileName,
    projectRoot,
  });
  if (!hasBundle) {
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
        `No embedded bundle found at the default path "${bundlePath}". ` +
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

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * RAM / indexed bundle: the bundle file is actually a directory with
 * multiple JS files rather than a single bundled file.
 */
async function checkRamBundle({
  binaryPath,
  bundlePath,
  fileName,
  projectRoot,
}: {
  binaryPath: string;
  bundlePath: string;
  fileName: string;
  projectRoot: string;
}): Promise<StageableCheck> {
  try {
    let content: string | undefined;

    if (fileName.endsWith('.apk')) {
      // For APK, the bundle is a single entry. Check if there are sibling
      // entries indicating RAM bundle format (e.g. "assets/index.android.bundle/js-modules/...").
      const ramIndicator = bundlePath.replace(/\.bundle$/, '') + '/';
      const exists = (await accessFileInArchive({
        operation: 'exists',
        file: ramIndicator,
        archive: binaryPath,
        type: 'unzip',
        projectRoot,
      })) as boolean;
      if (exists) {
        return {
          stageable: false,
          reason:
            'RAM/indexed bundle format detected. Staged uploads require a ' +
            'single-file JS bundle. Disable RAM bundling in your Metro config.',
        };
      }

      // Also check the first bytes of the bundle for RAM/ indexed magic
      content = (await accessFileInArchive({
        operation: 'read',
        file: bundlePath,
        archive: binaryPath,
        type: 'unzip',
        projectRoot,
      })) as string | undefined;
    } else if (fileName.endsWith('.app')) {
      content = (await accessFileInDirectory({
        operation: 'read',
        file: bundlePath,
        directory: binaryPath,
      })) as string | undefined;
    } else {
      // tar - try reading the bundle
      content = (await accessFileInArchive({
        operation: 'read',
        file: '*.app/' + bundlePath,
        archive: binaryPath,
        type: 'tar',
        projectRoot,
      })) as string | undefined;
    }

    if (content) {
      // RAM bundles start with a magic number or reference the RAM format.
      // Common indicators:
      // - `__jac_` prefix (jest/mock RAM format)
      // - Source map containing `magicMapping` (indexed RAM)
      // - First line is `var __BUNDLE_START_TIME__=...` followed by RAM modules
      if (
        content.startsWith('__jac_') ||
        content.includes('"magicMapping"') ||
        content.includes('require.unbundle')
      ) {
        return {
          stageable: false,
          reason:
            'RAM/indexed bundle format detected. Staged uploads require a ' +
            'single-file JS bundle. Disable RAM bundling in your Metro config.',
        };
      }
    }
  } catch {
    // Can't read bundle - assume single-file.
  }

  return { stageable: true };
}

/**
 * Check whether the binary has an embedded JS bundle at the expected path.
 */
async function checkHasEmbeddedBundle({
  binaryPath,
  bundlePath,
  fileName,
  projectRoot,
}: {
  binaryPath: string;
  bundlePath: string;
  fileName: string;
  projectRoot: string;
}): Promise<boolean> {
  try {
    if (fileName.endsWith('.apk')) {
      return (await accessFileInArchive({
        operation: 'exists',
        file: bundlePath,
        archive: binaryPath,
        type: 'unzip',
        projectRoot,
      })) as boolean;
    }
    if (fileName.endsWith('.app')) {
      return (await accessFileInDirectory({
        operation: 'exists',
        file: bundlePath,
        directory: binaryPath,
      })) as boolean;
    }
    // tar
    return (await accessFileInArchive({
      operation: 'exists',
      file: '*.app/' + bundlePath,
      archive: binaryPath,
      type: 'tar',
      projectRoot,
    })) as boolean;
  } catch {
    return false;
  }
}
