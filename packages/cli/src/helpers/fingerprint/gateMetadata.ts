/**
 * Gate metadata extraction from built binaries.
 *
 * Extracted ONCE at base-registration time and stored with the base so later
 * staging-gate runs can validate compatibility without re-sniffing the binary.
 */
import path from 'path';
import { Platform } from '@sherlo/api-types';
import accessFileInArchive from '../getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInArchive';
import accessFileInDirectory from '../getValidatedBinariesInfoAndNextBuildIndex/getBinariesInfoAndNextBuildIndex/getLocalBinariesInfo/accessFileInDirectory';
import runShellCommand from '../runShellCommand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GateMetadata = {
  /** 'hermes' | 'plain-js' - sniffed from the embedded bundle. */
  engineClass: EngineClass;
  /** Sorted list of asset paths/names recorded in the binary. */
  assetInventory: string[];
  /** Whether expo-updates is detected as enabled. */
  expoUpdatesEnabled: boolean;
  /** RN / Expo / SDK versions, build mode - best-effort. */
  buildMetadata: BuildMetadata;
};

export type EngineClass = 'hermes' | 'plain-js';

export type BuildMetadata = {
  reactNativeVersion?: string;
  expoSdkVersion?: string;
  sdkVersion?: string;
  buildMode: 'debug' | 'release';
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hermes bytecode header magic - the first 8 bytes of any HBC bundle. */
const HBC_MAGIC = Buffer.from([0x1f, 0x19, 0x03, 0xc1, 0x03, 0xbc, 0x1f, 0xc6]);

/** Number of bytes to read from the bundle header for engine detection. */
const ENGINE_SNIFF_BYTES = 16;

// iOS binary plist marker - expo-updates stores config in Expo.plist
const EXPO_PLIST_IOS_PATH = 'EXUpdates.bundle/Expo.plist';
const EXPO_PLIST_IOS_APP_PATH = 'Expo.plist';

// Android expo-updates metadata key in AndroidManifest.xml (binary XML)
const EXPO_UPDATES_ENABLED_ANDROID = 'expo.modules.updates.ENABLED';
const EXPO_UPDATES_METADATA_ANDROID = 'expo.modules.updates';

// iOS tar prefix
const IOS_TAR_BUNDLE_PREFIX = '*.app/';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract gate metadata from a built binary.
 *
 * @param binaryPath  Absolute path to the .apk, .app, .tar, or .tar.gz file.
 * @param platform    'android' or 'ios'.
 * @param projectRoot Project root (used for shell commands).
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
}): Promise<GateMetadata> {
  const fileName = path.basename(binaryPath);

  const engineClass = await sniffEngineClass({
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

  const buildMetadata = await getBuildMetadata({
    binaryPath,
    fileName,
    platform,
    projectRoot,
  });

  return {
    engineClass,
    assetInventory,
    expoUpdatesEnabled,
    buildMetadata,
  };
}

// ---------------------------------------------------------------------------
// Engine class detection
// ---------------------------------------------------------------------------

async function sniffEngineClass({
  binaryPath,
  bundlePath,
  fileName,
  projectRoot,
}: {
  binaryPath: string;
  bundlePath: string;
  fileName: string;
  projectRoot: string;
}): Promise<EngineClass> {
  try {
    let headerBytes: Buffer;

    if (fileName.endsWith('.apk')) {
      // APK: extract first bytes from the bundle entry inside the zip.
      const hexOutput = await runShellCommand({
        command: `unzip -p "${binaryPath}" "${bundlePath}" | head -c ${ENGINE_SNIFF_BYTES} | xxd -p`,
        projectRoot,
      });
      headerBytes = Buffer.from(hexOutput.trim(), 'hex');
    } else if (fileName.endsWith('.tar') || fileName.endsWith('.tar.gz')) {
      // tar archive (iOS from EAS): the bundle path is nested under <AppName>.app/
      const tarBundlePath = IOS_TAR_BUNDLE_PREFIX + bundlePath;
      const hexOutput = await runShellCommand({
        command: `tar -xOf "${binaryPath}" "${tarBundlePath}" 2>/dev/null | head -c ${ENGINE_SNIFF_BYTES} | xxd -p`,
        projectRoot,
      });
      headerBytes = Buffer.from(hexOutput.trim(), 'hex');
    } else if (fileName.endsWith('.app')) {
      // .app directory
      const bundleFullPath = path.join(binaryPath, bundlePath);
      const fd = await import('fs').then((fs) => fs.promises.open(bundleFullPath, 'r'));
      try {
        const buf = Buffer.alloc(ENGINE_SNIFF_BYTES);
        await fd.read(buf, 0, ENGINE_SNIFF_BYTES, 0);
        headerBytes = buf;
      } finally {
        await fd.close();
      }
    } else {
      return 'plain-js';
    }

    // Check for HBC magic
    if (headerBytes.length >= 8 && headerBytes.subarray(0, 8).equals(HBC_MAGIC)) {
      return 'hermes';
    }
    return 'plain-js';
  } catch {
    return 'plain-js';
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
    const output = await runShellCommand({
      command: `tar -tf "${binaryPath}" "${IOS_TAR_BUNDLE_PREFIX}${assetsPath}*" 2>/dev/null`,
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
      return content.includes('EXUpdatesEnabled');
    } catch {
      try {
        const content = await accessFileInDirectory({
          operation: 'read',
          file: EXPO_PLIST_IOS_APP_PATH,
          directory: binaryPath,
        });
        return content.includes('EXUpdatesEnabled');
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
    if (content) return content.includes('EXUpdatesEnabled');
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
    if (content) return content.includes('EXUpdatesEnabled');
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
// Build metadata
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
}): Promise<BuildMetadata> {
  const result: BuildMetadata = { buildMode: 'release' };

  // Try to read sherlo.json for SDK version
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
      result.sdkVersion = parsed.version;
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
        result.expoSdkVersion = parsed.sdkVersion;
      } catch {
        // Might be binary plist on iOS - skip.
      }
    }
  } catch {
    // Not found.
  }

  return result;
}
