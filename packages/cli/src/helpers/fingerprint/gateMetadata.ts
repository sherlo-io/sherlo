/**
 * Gate metadata extraction from built binaries and project config.
 *
 * Extracted ONCE at base-registration time and stored with the base so later
 * staging-gate runs can validate compatibility without re-sniffing the binary.
 *
 * This module produces the canonical per-platform `GateMetadataInput` shape
 * that matches the sherlo-api #261 contract field-for-field.
 */
import fs from 'fs';
import path from 'path';
import { Platform } from '@sherlo/api-types';
import accessFileInArchive, {
  detectTarVersion,
} from '../getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInArchive';
import accessFileInDirectory from '../getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInDirectory';
import runShellCommand from '../runShellCommand';
import getPackageVersion from '../../commands/init/requirements/getPackageVersion';

// ---------------------------------------------------------------------------
// Types - canonical per-platform GateMetadataInput (matches sherlo-api #261)
// ---------------------------------------------------------------------------

/** Runtime JS engine class, derived from PROJECT CONFIG per platform. */
export type EngineClass = 'hermes' | 'jsc';

/** Bundle format detected from the embedded bundle bytes. */
export type BundleFormat = 'hbc' | 'plain-js' | 'ram';

export type GateMetadataInput = {
  /** Runtime engine of the shell - derived from project config, NOT bundle sniff. */
  engineClass: EngineClass;
  /** Bundle format sniffed from the embedded bundle header. */
  bundleFormat: BundleFormat;
  /** Whether an embedded JS bundle exists at the platform-default path. */
  hasEmbeddedBundle: boolean;
  /** Sorted list of asset paths/names recorded in the binary. */
  assetInventory: string[];
  /** Whether expo-updates is detected as enabled on this platform. */
  expoUpdatesEnabled: boolean;
  /** Sherlo SDK protocol version read from assets/sherlo.json. */
  sdkProtocolVersion?: string;
  /** RN / Expo SDK versions, build mode - best-effort. */
  buildMetadata: BuildMetadata;
};

export type BuildMetadata = {
  reactNativeVersion?: string;
  expoSdkVersion?: string;
  buildMode: 'debug' | 'release';
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hermes bytecode header magic - the first 8 bytes of any HBC bundle.
 * Hermes writes 0x1F1903C103BC1FC6 in LITTLE-endian, so the on-disk bytes are:
 *   c6 1f bc 03 c1 03 19 1f
 */
export const HBC_MAGIC = Buffer.from([0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f]);

/** Number of bytes to read from the bundle header for format detection. */
const BUNDLE_SNIFF_BYTES = 16;

// iOS binary plist marker - expo-updates stores config in Expo.plist
const EXPO_PLIST_IOS_PATH = 'EXUpdates.bundle/Expo.plist';
const EXPO_PLIST_IOS_APP_PATH = 'Expo.plist';

// Android expo-updates metadata key in AndroidManifest.xml (binary XML)
const EXPO_UPDATES_ENABLED_ANDROID = 'expo.modules.updates.ENABLED';
const EXPO_UPDATES_METADATA_ANDROID = 'expo.modules.updates';

// iOS tar prefix
const IOS_TAR_BUNDLE_PREFIX = '*.app/';

// RN version threshold at which Hermes became the default engine
const RN_HERMES_DEFAULT_VERSION = '0.70.0';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract gate metadata from a built binary + project config.
 *
 * @param binaryPath  Absolute path to the .apk, .app, .tar, or .tar.gz file.
 * @param platform    'android' or 'ios'.
 * @param projectRoot Project root (used for shell commands and config reads).
 * @param bundlePath  Path to the JS bundle within the binary (platform default).
 */
export async function extractGateMetadata({
  binaryPath,
  platform,
  projectRoot,
  bundlePath,
}: {
  binaryPath: string;
  platform: Platform;
  projectRoot: string;
  /** Path to the JS bundle within the binary. */
  bundlePath: string;
}): Promise<GateMetadataInput> {
  const fileName = path.basename(binaryPath);

  const engineClass = await deriveEngineClass({ platform, projectRoot });

  const bundleFormat = await sniffBundleFormat({
    binaryPath,
    bundlePath,
    fileName,
    projectRoot,
  });

  const hasEmbeddedBundle = await checkHasEmbeddedBundle({
    binaryPath,
    bundlePath,
    fileName,
    projectRoot,
  });

  const assetInventory = await listAssetInventory({
    binaryPath,
    fileName,
    platform,
    projectRoot,
  });

  const expoUpdatesEnabled = await detectExpoUpdates({
    binaryPath,
    fileName,
    platform,
    projectRoot,
  });

  const { sdkProtocolVersion, buildMetadata } = await getBuildMetadata({
    binaryPath,
    fileName,
    platform,
    projectRoot,
  });

  return {
    engineClass,
    bundleFormat,
    hasEmbeddedBundle,
    assetInventory,
    expoUpdatesEnabled,
    sdkProtocolVersion,
    buildMetadata,
  };
}

// ---------------------------------------------------------------------------
// Engine class derivation - from PROJECT CONFIG, per platform
// ---------------------------------------------------------------------------

/**
 * Derive the shell's JS engine class from project configuration.
 *
 * Managed:     app config `jsEngine` (default `hermes`).
 * Bare Android: android/gradle.properties `hermesEnabled` (true → hermes).
 * Bare iOS:    Podfile `:hermes_enabled` (true → hermes).
 * Fallback:    `hermes` on RN >= 0.70, else `jsc`.
 */
export async function deriveEngineClass({
  platform,
  projectRoot,
}: {
  platform: Platform;
  projectRoot: string;
}): Promise<EngineClass> {
  const workflow = detectWorkflow(projectRoot);

  if (workflow === 'managed') {
    return await deriveManagedEngineClass(projectRoot);
  }

  if (platform === 'android') {
    return await deriveBareAndroidEngineClass(projectRoot);
  }
  return await deriveBareIosEngineClass(projectRoot);
}

async function deriveManagedEngineClass(projectRoot: string): Promise<EngineClass> {
  try {
    const config = await readAppConfig(projectRoot);
    if (config) {
      const expo = (config as Record<string, unknown>).expo as Record<string, unknown> | undefined;
      const jsEngine: unknown = expo?.jsEngine ?? (config as Record<string, unknown>).jsEngine;
      if (jsEngine === 'jsc') return 'jsc';
    }
    // 'hermes' or any other value defaults to hermes
    return 'hermes';
  } catch {
    // Can't read config - fall through to RN-version default.
  }
  return await defaultEngineClass(projectRoot);
}

async function deriveBareAndroidEngineClass(projectRoot: string): Promise<EngineClass> {
  try {
    const gradlePropsPath = path.join(projectRoot, 'android', 'gradle.properties');
    const content = await fs.promises.readFile(gradlePropsPath, 'utf8');
    // Match `hermesEnabled=true` (ignoring whitespace).
    if (/^\s*hermesEnabled\s*=\s*true\s*$/m.test(content)) {
      return 'hermes';
    }
    // Explicitly disabled or absent - fall through.
  } catch {
    // No gradle.properties - fall through.
  }
  return await defaultEngineClass(projectRoot);
}

async function deriveBareIosEngineClass(projectRoot: string): Promise<EngineClass> {
  try {
    const podfilePath = path.join(projectRoot, 'ios', 'Podfile');
    const content = await fs.promises.readFile(podfilePath, 'utf8');
    // Match `:hermes_enabled => true` (Ruby symbol, optional parens, fat arrow).
    if (/:hermes_enabled\s*=>\s*true/.test(content)) {
      return 'hermes';
    }
    // Explicitly disabled or absent - fall through.
  } catch {
    // No Podfile - fall through.
  }
  return await defaultEngineClass(projectRoot);
}

/**
 * Fallback: return 'hermes' when RN >= 0.70, else 'jsc'.
 */
async function defaultEngineClass(_projectRoot: string): Promise<EngineClass> {
  try {
    const rnVersion = getPackageVersion('react-native');
    if (rnVersion && isVersionGte(rnVersion, RN_HERMES_DEFAULT_VERSION)) {
      return 'hermes';
    }
  } catch {
    // Can't determine RN version - assume modern.
    return 'hermes';
  }
  return 'jsc';
}

// ---------------------------------------------------------------------------
// Workflow detection (shared logic with baseFingerprint.ts)
// ---------------------------------------------------------------------------

type Workflow = 'managed' | 'bare';

function detectWorkflow(projectRoot: string): Workflow {
  const bareIndicators = [
    path.join(projectRoot, 'android', 'app', 'build.gradle'),
    path.join(projectRoot, 'android', 'app', 'build.gradle.kts'),
    path.join(projectRoot, 'ios'),
  ];

  for (const indicator of bareIndicators) {
    if (fs.existsSync(indicator)) return 'bare';
  }

  return 'managed';
}

// ---------------------------------------------------------------------------
// App config reader (managed projects)
// ---------------------------------------------------------------------------

async function readAppConfig(projectRoot: string): Promise<Record<string, unknown> | null> {
  // Try static app.json first.
  const appJsonPath = path.join(projectRoot, 'app.json');
  try {
    const raw = await fs.promises.readFile(appJsonPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    // No static config - may be app.config.js/ts.
  }

  // Try dynamic config via `npx expo config --json`.
  try {
    const output = await runShellCommand({
      command: 'npx expo config --json',
      projectRoot,
    });
    return JSON.parse(output);
  } catch {
    // expo not available or config failed.
  }

  return null;
}

// ---------------------------------------------------------------------------
// Bundle format sniffing (was engineClass sniff; now renamed)
// ---------------------------------------------------------------------------

async function sniffBundleFormat({
  binaryPath,
  bundlePath,
  fileName,
  projectRoot,
}: {
  binaryPath: string;
  bundlePath: string;
  fileName: string;
  projectRoot: string;
}): Promise<BundleFormat> {
  // Check for RAM/indexed bundle indicators first.
  const isRam = await checkRamBundle({ binaryPath, bundlePath, fileName, projectRoot });
  if (isRam) return 'ram';

  // Sniff the bundle header for HBC magic.
  try {
    let headerBytes: Buffer;

    if (fileName.endsWith('.apk')) {
      // APK: extract first bytes from the bundle entry inside the zip.
      headerBytes = (await runShellCommand({
        command: `unzip -p "${binaryPath}" "${bundlePath}" | head -c ${BUNDLE_SNIFF_BYTES}`,
        projectRoot,
        encoding: 'buffer',
      })) as Buffer;
    } else if (fileName.endsWith('.tar') || fileName.endsWith('.tar.gz')) {
      // tar archive (iOS from EAS): the bundle path is nested under <AppName>.app/
      const tarVersion = await detectTarVersion(projectRoot);
      const useWildcards = tarVersion === 'GNU' ? '--wildcards ' : '';
      const tarBundlePath = IOS_TAR_BUNDLE_PREFIX + bundlePath;
      headerBytes = (await runShellCommand({
        command: `tar ${useWildcards}-xOf "${binaryPath}" "${tarBundlePath}" 2>/dev/null | head -c ${BUNDLE_SNIFF_BYTES}`,
        projectRoot,
        encoding: 'buffer',
      })) as Buffer;
    } else if (fileName.endsWith('.app')) {
      // .app directory
      const bundleFullPath = path.join(binaryPath, bundlePath);
      const fd = await fs.promises.open(bundleFullPath, 'r');
      try {
        const buf = Buffer.alloc(BUNDLE_SNIFF_BYTES);
        await fd.read(buf, 0, BUNDLE_SNIFF_BYTES, 0);
        headerBytes = buf;
      } finally {
        await fd.close();
      }
    } else {
      return 'plain-js';
    }

    // Check for HBC magic
    if (headerBytes.length >= 8 && headerBytes.subarray(0, 8).equals(HBC_MAGIC)) {
      return 'hbc';
    }
    return 'plain-js';
  } catch {
    return 'plain-js';
  }
}

// ---------------------------------------------------------------------------
// RAM / indexed bundle detection
// ---------------------------------------------------------------------------

/**
 * Detect whether the bundle is a RAM/indexed bundle (multiple JS files
 * instead of a single bundled file).
 *
 * Exported so both extractGateMetadata and checkStageable can use it.
 */
export async function checkRamBundle({
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
    let content: string | undefined;

    if (fileName.endsWith('.apk')) {
      // For APK, check if there are sibling entries indicating RAM bundle format
      // (e.g. "assets/index.android.bundle/js-modules/...").
      const ramIndicator = bundlePath.replace(/\.bundle$/, '') + '/';
      const exists = (await accessFileInArchive({
        operation: 'exists',
        file: ramIndicator,
        archive: binaryPath,
        type: 'unzip',
        projectRoot,
      })) as boolean;
      if (exists) return true;

      // Also read the first bytes of the bundle for RAM/indexed magic
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
      // - First line references `require.unbundle` (RAM format)
      if (
        content.startsWith('__jac_') ||
        content.includes('"magicMapping"') ||
        content.includes('require.unbundle')
      ) {
        return true;
      }
    }
  } catch {
    // Can't read bundle - assume single-file.
  }

  return false;
}

// ---------------------------------------------------------------------------
// Embedded bundle existence check
// ---------------------------------------------------------------------------

/**
 * Check whether the binary has an embedded JS bundle at the expected path.
 *
 * Exported so both extractGateMetadata and checkStageable can use it.
 */
export async function checkHasEmbeddedBundle({
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

// ---------------------------------------------------------------------------
// Asset inventory
// ---------------------------------------------------------------------------

async function listAssetInventory({
  binaryPath,
  fileName,
  platform,
  projectRoot,
}: {
  binaryPath: string;
  fileName: string;
  platform: Platform;
  projectRoot: string;
}): Promise<string[]> {
  try {
    if (platform === 'android') {
      return await listAndroidAssets({ binaryPath, fileName, projectRoot });
    }
    return await listIosAssets({ binaryPath, fileName, projectRoot });
  } catch {
    return [];
  }
}

async function listAndroidAssets({
  binaryPath,
  fileName,
  projectRoot,
}: {
  binaryPath: string;
  fileName: string;
  projectRoot: string;
}): Promise<string[]> {
  if (!fileName.endsWith('.apk')) return [];

  try {
    // List entries under res/ and resources.arsc (resource table).
    const output = await runShellCommand({
      command: `unzip -l "${binaryPath}" "res/*" "resources.arsc"`,
      projectRoot,
    });

    const entries: string[] = [];
    for (const line of output.split('\n')) {
      // Match entries in unzip -l output format
      const resMatch = line.match(/\s+(res\/.*)$/);
      if (resMatch) {
        entries.push(resMatch[1]);
        continue;
      }
      if (line.includes('resources.arsc')) {
        entries.push('resources.arsc');
      }
    }
    return entries.sort();
  } catch (err: any) {
    // exit code 11 = no matching entries
    if (err?.code === 11) return [];
    return [];
  }
}

async function listIosAssets({
  binaryPath,
  fileName,
  projectRoot,
}: {
  binaryPath: string;
  fileName: string;
  projectRoot: string;
}): Promise<string[]> {
  const assetsPath = 'assets/';

  if (fileName.endsWith('.app')) {
    // .app directory - list files under .app/assets/
    const fullAssetsPath = path.join(binaryPath, assetsPath);
    try {
      const { readdir, stat } = await import('fs').then((fs) => fs.promises);
      const entries = await readdir(fullAssetsPath);
      const result: string[] = [];
      for (const entry of entries) {
        const entryPath = path.join(fullAssetsPath, entry);
        try {
          const s = await stat(entryPath);
          result.push(s.isDirectory() ? `${assetsPath}${entry}/` : `${assetsPath}${entry}`);
        } catch {
          result.push(`${assetsPath}${entry}`);
        }
      }
      return result.sort();
    } catch {
      return [];
    }
  }

  // tar archive
  try {
    const tarVersion = await detectTarVersion(projectRoot);
    const useWildcards = tarVersion === 'GNU' ? '--wildcards ' : '';
    const output = await runShellCommand({
      command: `tar ${useWildcards}-tf "${binaryPath}" "${IOS_TAR_BUNDLE_PREFIX}${assetsPath}*" 2>/dev/null`,
      projectRoot,
    });
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => line.replace(new RegExp(`^${IOS_TAR_BUNDLE_PREFIX.replace('*', '')}`), ''))
      .sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Expo-updates detection
// ---------------------------------------------------------------------------

/**
 * Parse the EXUpdatesEnabled value from an Expo.plist text (XML) plist.
 * Returns true only when the key is present AND its value is truthy
 * (e.g. `<true/>` or `<string>YES</string>`).
 */
export function parseExpoUpdatesEnabledFromPlist(content: string): boolean {
  // Match the value tag after EXUpdatesEnabled key - handles both
  // self-closing tags (<true/>) and tags with content (<string>YES</string>).
  const match = content.match(/<key>EXUpdatesEnabled<\/key>\s*(<[^>]+>.*?<\/[^>]+>|<[^>]+\/>)/);
  if (!match) return false;
  const valueTag = match[1];
  if (/<true\s*\/?>/.test(valueTag)) return true;
  if (/<false\s*\/?>/.test(valueTag)) return false;
  // Handle <string>YES/NO</string>
  const stringMatch = valueTag.match(/<string>(YES|NO)<\/string>/i);
  if (stringMatch) return stringMatch[1].toUpperCase() === 'YES';
  return false;
}

async function detectExpoUpdates({
  binaryPath,
  fileName,
  platform,
  projectRoot,
}: {
  binaryPath: string;
  fileName: string;
  platform: Platform;
  projectRoot: string;
}): Promise<boolean> {
  try {
    if (platform === 'ios') {
      return await detectExpoUpdatesIos({ binaryPath, fileName, projectRoot });
    }
    return await detectExpoUpdatesAndroid({ binaryPath, fileName, projectRoot });
  } catch {
    return false;
  }
}

async function detectExpoUpdatesIos({
  binaryPath,
  fileName,
  projectRoot,
}: {
  binaryPath: string;
  fileName: string;
  projectRoot: string;
}): Promise<boolean> {
  // Check for EXUpdatesEnabled in Expo.plist
  if (fileName.endsWith('.app')) {
    try {
      const content = await accessFileInDirectory({
        operation: 'read',
        file: EXPO_PLIST_IOS_PATH,
        directory: binaryPath,
      });
      return parseExpoUpdatesEnabledFromPlist(content);
    } catch {
      try {
        const content = await accessFileInDirectory({
          operation: 'read',
          file: EXPO_PLIST_IOS_APP_PATH,
          directory: binaryPath,
        });
        return parseExpoUpdatesEnabledFromPlist(content);
      } catch {
        return false;
      }
    }
  }

  // tar archive
  try {
    const content = (await accessFileInArchive({
      operation: 'read',
      file: IOS_TAR_BUNDLE_PREFIX + EXPO_PLIST_IOS_PATH,
      archive: binaryPath,
      type: 'tar',
      projectRoot,
    })) as string | undefined;
    if (content) return parseExpoUpdatesEnabledFromPlist(content);
  } catch {
    // try alternative path
  }

  try {
    const content = (await accessFileInArchive({
      operation: 'read',
      file: IOS_TAR_BUNDLE_PREFIX + EXPO_PLIST_IOS_APP_PATH,
      archive: binaryPath,
      type: 'tar',
      projectRoot,
    })) as string | undefined;
    if (content) return parseExpoUpdatesEnabledFromPlist(content);
  } catch {
    // not found
  }

  return false;
}

async function detectExpoUpdatesAndroid({
  binaryPath,
  fileName,
  projectRoot,
}: {
  binaryPath: string;
  fileName: string;
  projectRoot: string;
}): Promise<boolean> {
  if (!fileName.endsWith('.apk')) return false;

  try {
    // Read the binary AndroidManifest.xml and search for expo-updates metadata
    // in UTF-16LE encoding (Android binary XML uses this for its string pool).
    const manifestBuffer = await runShellCommand({
      command: `unzip -p "${binaryPath}" AndroidManifest.xml`,
      projectRoot,
      encoding: 'buffer',
    });

    // Search for "expo.modules.updates.ENABLED" in UTF-16LE
    // Android binary XML stores strings as UTF-16LE in the string pool.
    const searchEnabled = Buffer.from(EXPO_UPDATES_ENABLED_ANDROID, 'utf16le');
    const searchMetadata = Buffer.from(EXPO_UPDATES_METADATA_ANDROID, 'utf16le');

    // Cast to Buffer for includes check
    const buf = manifestBuffer as Buffer;
    return buf.includes(searchEnabled) || buf.includes(searchMetadata);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Build metadata + SDK protocol version
// ---------------------------------------------------------------------------

async function getBuildMetadata({
  binaryPath,
  fileName,
  platform,
  projectRoot,
}: {
  binaryPath: string;
  fileName: string;
  platform: Platform;
  projectRoot: string;
}): Promise<{ sdkProtocolVersion?: string; buildMetadata: BuildMetadata }> {
  const buildMetadata: BuildMetadata = { buildMode: 'release' };
  let sdkProtocolVersion: string | undefined;

  // Try to read sherlo.json for SDK protocol version (promoted from buildMetadata.sdkVersion).
  const sherloPath = 'assets/sherlo.json';

  try {
    let sherloContent: string | undefined;

    if (fileName.endsWith('.app')) {
      sherloContent = (await accessFileInDirectory({
        operation: 'read',
        file: sherloPath,
        directory: binaryPath,
      })) as string | undefined;
    } else if (fileName.endsWith('.apk')) {
      sherloContent = (await accessFileInArchive({
        operation: 'read',
        file: sherloPath,
        archive: binaryPath,
        type: 'unzip',
        projectRoot,
      })) as string | undefined;
    } else {
      sherloContent = (await accessFileInArchive({
        operation: 'read',
        file: IOS_TAR_BUNDLE_PREFIX + sherloPath,
        archive: binaryPath,
        type: 'tar',
        projectRoot,
      })) as string | undefined;
    }

    if (sherloContent) {
      const parsed = JSON.parse(sherloContent);
      sdkProtocolVersion = parsed.version;
    }
  } catch {
    // No sherlo.json - that's fine.
  }

  // Try to read expo app.config for expo SDK version
  const expoAppConfigPath =
    platform === 'android' ? 'assets/app.config' : 'EXConstants.bundle/app.config';

  try {
    let configContent: string | undefined;

    if (fileName.endsWith('.app')) {
      configContent = (await accessFileInDirectory({
        operation: 'read',
        file: expoAppConfigPath,
        directory: binaryPath,
      })) as string | undefined;
    } else if (fileName.endsWith('.apk')) {
      configContent = (await accessFileInArchive({
        operation: 'read',
        file: expoAppConfigPath,
        archive: binaryPath,
        type: 'unzip',
        projectRoot,
      })) as string | undefined;
    } else {
      const tarConfigPath = IOS_TAR_BUNDLE_PREFIX + expoAppConfigPath;
      configContent = (await accessFileInArchive({
        operation: 'read',
        file: tarConfigPath,
        archive: binaryPath,
        type: 'tar',
        projectRoot,
      })) as string | undefined;
    }

    if (configContent) {
      try {
        const parsed = JSON.parse(configContent);
        buildMetadata.expoSdkVersion = parsed.sdkVersion;
      } catch {
        // Might be binary plist on iOS - skip.
      }
    }
  } catch {
    // Not found.
  }

  return { sdkProtocolVersion, buildMetadata };
}

// ---------------------------------------------------------------------------
// Version comparison helper
// ---------------------------------------------------------------------------

function isVersionGte(version: string, minVersion: string): boolean {
  const a = parseSemver(version);
  const b = parseSemver(minVersion);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true; // equal
}

function parseSemver(version: string): [number, number, number] {
  const parts = version
    .replace(/[^0-9.]/g, '')
    .split('.')
    .map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}
