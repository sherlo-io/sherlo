/**
 * Bundle building, format sniffing, asset collection, and gate-metadata
 * construction for the staged road of `sherlo test`.
 *
 * Detects the project type via the same detectBundler that showError's
 * buildSourceMaps uses, calls the canonical bundler with --dev false
 * --minify true, sniffs the bundle format, collects the asset inventory,
 * and constructs the per-platform GateMetadataInput that the openBuild
 * resolver compares against the registered base.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Platform } from '@sherlo/api-types';
import {
  HBC_MAGIC,
  deriveEngineClass,
  parseExpoUpdatesEnabledFromPlist,
  type GateMetadataInput,
  type BundleFormat,
} from '../../helpers/fingerprint/gateMetadata';
import detectBundler from '../../commands/showError/detectBundler';
import { detectEntryFile } from '../../commands/showError/detectBundler';
import getPackageVersion from '../../commands/init/requirements/getPackageVersion';
import { FALLBACK_LINE as SHARED_FALLBACK_LINE } from './stagedGateRefusal';
import { readBundledSdkProtocolVersion } from './readBundledSdkProtocolVersion';
import {
  deleteModuleManifestSidecar,
  readValidatedModuleManifest,
  type ValidatedModuleManifest,
} from './readModuleManifest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { BundleFormat };

export type BundleResult = {
  /** Absolute path to the built bundle file. */
  bundlePath: string;
  /** Bundle format sniffed from the file header. */
  bundleFormat: BundleFormat;
  /** Bundle file size in megabytes. */
  bundleSizeMb: number;
  /** SHA-256 of the bundle content (diagnostics). */
  bundleHash: string;
  /** Path to the assets directory produced by the bundler. */
  assetsDest?: string;
  /** Sorted list of relative asset paths/names for gateMetadata.assetInventory. */
  assetInventory: string[];
  /** Which bundler was used. */
  bundler: 'expo' | 'rn';
  /**
   * The validated module-manifest sidecar the serializer emitted for THIS build
   * (SHERLO-1894 Phase B), or undefined when none was produced / it was invalid.
   * Bail-open: a missing or bad manifest is never an error - the build ships
   * without it. Uploaded (gzipped) to the staged `manifest` slot when present.
   */
  moduleManifest?: ValidatedModuleManifest;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of bytes read from the bundle header for HBC magic sniffing. */
const BUNDLE_SNIFF_BYTES = 12;

/** Minimum React Native version for staged uploads. */
const MIN_RN_VERSION = '0.71.0';

/** Minimum Expo SDK version for staged uploads. */
const MIN_EXPO_SDK = 50;

/**
 * The full-run fallback line appended to every refusal message. The sentence
 * itself is owned by ./stagedGateRefusal so every staged exit path says the same
 * thing; only the leading blank line is local formatting.
 */
const FALLBACK_LINE = `\n${SHARED_FALLBACK_LINE}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a production (dev=false, minify=true) plain-JS bundle for a single
 * platform and collect its metadata + asset inventory.
 *
 * Throws with a user-facing message that already includes the full-run fallback
 * line.  Callers catch, print, and exit.
 */
export async function buildBundleForPlatform({
  projectRoot,
  platform,
}: {
  projectRoot: string;
  platform: Platform;
}): Promise<BundleResult> {
  // ------------------------------------------------------------------
  // 0. Version-floor refusal - guard before we shell out to a bundler
  //    that might not exist in ancient projects.
  // ------------------------------------------------------------------
  const rnVersion = getPackageVersion('react-native');
  if (rnVersion && !isVersionGte(rnVersion, MIN_RN_VERSION)) {
    throw new Error(
      `React Native ${rnVersion} is below the minimum version ` +
        `(${MIN_RN_VERSION}) required for staged uploads.\n\n` +
        'Upgrade react-native or use a full build instead.' +
        FALLBACK_LINE
    );
  }

  const expoSdkVersion = getExpoSdkVersion(projectRoot);
  if (expoSdkVersion !== null && expoSdkVersion < MIN_EXPO_SDK) {
    throw new Error(
      `Expo SDK ${expoSdkVersion} is below the minimum version ` +
        `(${MIN_EXPO_SDK}) required for staged uploads.\n\n` +
        'Upgrade expo or use a full build instead.' +
        FALLBACK_LINE
    );
  }

  // ------------------------------------------------------------------
  // 1. Detect project type via the canonical detectBundler (same as
  //    showError's buildSourceMaps).  Branch explicitly - do NOT try
  //    expo export:embed blindly on bare-RN projects (triggers an
  //    interactive expo install and breaks the bare-RN fixture AC).
  // ------------------------------------------------------------------
  let projectType: 'expo' | 'rn';
  try {
    projectType = detectBundler(projectRoot);
  } catch {
    // detectBundler throws when it can't determine the project type.
    // Fall back to checking for expo in dependencies.
    projectType = hasExpoDep(projectRoot) ? 'expo' : 'rn';
  }

  const cacheDir = path.join(projectRoot, '.sherlo', 'bundled');
  fs.mkdirSync(cacheDir, { recursive: true });

  const entryFile = detectEntryFile(projectRoot);
  const bundleOut = path.join(cacheDir, `bundle.${platform}.js`);
  const assetsDest = path.join(cacheDir, `assets.${platform}`);

  // Clean stale output so we never read a previous run's bundle.
  for (const p of [bundleOut, `${bundleOut}.map`, assetsDest]) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  }

  // Delete any module-manifest sidecar left by a PREVIOUS platform's build before
  // we spawn this platform's bundler (SHERLO-1894 §2). The sidecar lives at ONE
  // fixed path with no platform recorded, and the loop reuses this projectRoot for
  // every platform, so a leftover would be read and uploaded as THIS platform's
  // manifest if this platform's serializer bails open and emits nothing. Deleting
  // here makes absence mean absence: anything read afterward came from this run.
  deleteModuleManifestSidecar(projectRoot);

  // ------------------------------------------------------------------
  // 2. Build the bundle with --dev false --minify true (design §5).
  // ------------------------------------------------------------------
  if (projectType === 'expo') {
    execBundler(platform, 'expo', {
      projectRoot,
      entryFile,
      bundleOut,
      assetsDest,
    });
  } else {
    execBundler(platform, 'rn', {
      projectRoot,
      entryFile,
      bundleOut,
      assetsDest,
    });
  }

  // ------------------------------------------------------------------
  // 3-8. Accept the artifacts the bundler just produced. These checks are
  //      NOT specific to a bundle we built - they are what makes ANY bundle
  //      safe to stage - so they live in one shared function that the
  //      supplied-bundle road runs too. See {@link inspectBundleArtifacts}.
  // ------------------------------------------------------------------
  return inspectBundleArtifacts({
    bundlePath: bundleOut,
    assetsDest,
    bundler: projectType,
    moduleManifest: readValidatedModuleManifest(projectRoot) ?? undefined,
  });
}

/**
 * THE ACCEPTANCE CHECKS - the single gate every staged bundle passes, whoever
 * built it.
 *
 * Steps 3-8 of {@link buildBundleForPlatform} used to live inline. They are
 * extracted here because `--bundle-dir` accepts a bundle this CLI did not build,
 * and a supplied bundle must be judged by THE SAME CODE, not by a second
 * implementation of the same intent. Two copies of a safety check drift, and the
 * copy that drifts is the one nobody is watching.
 *
 * Throws user-facing messages that already carry the full-run fallback line.
 */
export function inspectBundleArtifacts({
  bundlePath,
  assetsDest,
  bundler,
  moduleManifest,
}: {
  bundlePath: string;
  assetsDest?: string;
  bundler: 'expo' | 'rn';
  moduleManifest?: ValidatedModuleManifest;
}): BundleResult {
  // 3. Verify the bundle file exists and is non-empty.
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Bundle file was not produced at ${bundlePath}` + FALLBACK_LINE);
  }

  const bundleBuffer = fs.readFileSync(bundlePath);
  if (bundleBuffer.length === 0) {
    throw new Error(`Bundle file is empty: ${bundlePath}` + FALLBACK_LINE);
  }

  // 4. Sniff the bundle header for HBC magic (12-byte sniff, design §4).
  //    Hermes bytecode CANNOT be staged - the runner needs plain JS.
  const sniffBytes = bundleBuffer.subarray(0, Math.min(BUNDLE_SNIFF_BYTES, bundleBuffer.length));

  if (sniffBytes.length >= 8 && sniffBytes.subarray(0, 8).equals(HBC_MAGIC)) {
    throw new Error(
      'Hermes bytecode (.hbc) bundle detected.\n\n' +
        'Staged uploads require a plain-JS bundle (dev=false). ' +
        'Your project is configured to emit Hermes bytecode instead of ' +
        'plain JavaScript.\n\n' +
        'To fix:\n' +
        '  - Ensure --dev false is passed to the bundler (the CLI does ' +
        'this automatically).\n' +
        '  - Expo managed: "expo.jsEngine" must be "hermes" (not "jsc") - ' +
        'expo export:embed with --dev=false produces plain-JS even with ' +
        'Hermes.\n' +
        '  - If using a custom Metro config, disable Hermes bytecode ' +
        'precompilation for the staging build.\n' +
        FALLBACK_LINE
    );
  }

  // 5. Check for RAM/indexed bundle format.  Uses the same heuristic
  //    as checkRamBundle in gateMetadata.ts: the bundle file starts
  //    with __jac_ (RAM magic) or references require.unbundle /
  //    "magicMapping" in the first 4 KB.
  const ramSniff = bundleBuffer.subarray(0, Math.min(4096, bundleBuffer.length)).toString('utf8');
  if (
    ramSniff.startsWith('__jac_') ||
    ramSniff.includes('require.unbundle') ||
    ramSniff.includes('"magicMapping"')
  ) {
    throw new Error(
      'RAM/indexed bundle format detected.\n\n' +
        'Staged uploads require a single-file plain-JS bundle. ' +
        'Disable RAM bundling in your Metro config ' +
        '(set "ramBundle" to false or remove the option).\n' +
        FALLBACK_LINE
    );
  }

  // 6. Compute bundle metadata.
  const bundleSizeMb = parseFloat((bundleBuffer.length / (1024 * 1024)).toFixed(2));
  const bundleHash = crypto.createHash('sha256').update(bundleBuffer).digest('hex');
  const bundleFormat: BundleFormat = 'plain-js';

  // 7. Collect asset inventory from the Metro --assets-dest output.
  let assetsDestResult: string | undefined;
  let assetInventory: string[] = [];

  if (assetsDest && fs.existsSync(assetsDest)) {
    const files = collectAssetInventory(assetsDest);
    if (files.length > 0) {
      assetsDestResult = assetsDest;
      assetInventory = files;
    }
  }

  // 8. The module-manifest sidecar the serializer emitted for this build
  //    (SHERLO-1894 Phase B). Bail-open on the BUILT road: a missing /
  //    unreadable / shape-invalid sidecar yields undefined (the reader warns,
  //    never throws), so a manifest problem can never block a build.
  //
  //    The SUPPLIED road does not get that latitude, and refuses a missing
  //    manifest before it ever reaches here - see ./suppliedBundle. Bailing open
  //    is right when the alternative is failing a build that would have worked;
  //    it is wrong when a caller explicitly handed over a triple and one third of
  //    it is absent.
  return {
    bundlePath,
    bundleFormat,
    bundleSizeMb,
    bundleHash,
    assetsDest: assetsDestResult,
    assetInventory,
    bundler,
    moduleManifest,
  };
}

/**
 * Construct the per-platform {@link GateMetadataInput} for a bundled run.
 *
 * `sherlo test --android/--ios` extracts BINARY-derived gate metadata from a built APK/IPA via
 * {@link extractGateMetadata}. The bundled flow has no binary, so it marks its
 * metadata `derivedFrom: 'source'` and sends ONLY what the JS bundle + project
 * config honestly know:
 *   - `bundleFormat` sniffed from the bundle we just built,
 *   - `assetInventory` from Metro's `--assets-dest` output,
 *   - `engineClass` / `expoUpdatesEnabled` / `buildMetadata.*` read from project
 *     config (source signals; the gate excludes source-marked dims from the
 *     identity diff, so they are honest observability, never a fabricated match).
 *
 * It deliberately does NOT send the binary-only identity facts a bundle can only
 * guess: no `hasEmbeddedBundle` (always-true fabrication) and no baked
 * `sdkProtocolVersion`. Instead it sends the bundle-REQUIRED SDK protocol
 * version as the explicit `requiredSdkProtocolVersion` compat input, resolved
 * from the installed @sherlo/react-native-storybook package (whose version IS
 * the protocol version). If the package is not installed it is sent ABSENT -
 * never fabricated.
 */
export async function buildGateMetadata({
  projectRoot,
  platform,
  bundleResult,
}: {
  projectRoot: string;
  platform: Platform;
  bundleResult: BundleResult;
}): Promise<GateMetadataInput> {
  const engineClass = await deriveEngineClass({ platform, projectRoot });

  const expoUpdatesEnabled = await detectExpoUpdatesEnabled({
    projectRoot,
    platform,
  });

  const requiredSdkProtocolVersion = readBundledSdkProtocolVersion(projectRoot);

  const rnVersion = getPackageVersion('react-native');
  const expoSdkVer = getExpoSdkVersion(projectRoot);

  return {
    derivedFrom: 'source',
    engineClass,
    bundleFormat: bundleResult.bundleFormat,
    assetInventory: bundleResult.assetInventory,
    expoUpdatesEnabled,
    ...(requiredSdkProtocolVersion ? { requiredSdkProtocolVersion } : {}),
    buildMetadata: {
      ...(rnVersion ? { reactNativeVersion: rnVersion } : {}),
      ...(expoSdkVer !== null ? { expoSdkVersion: String(expoSdkVer) } : {}),
      buildMode: 'release',
    },
  };
}

export default buildBundleForPlatform;

// ---------------------------------------------------------------------------
// Bundler execution
// ---------------------------------------------------------------------------

function execBundler(
  platform: Platform,
  bundler: 'expo' | 'rn',
  opts: {
    projectRoot: string;
    entryFile: string;
    bundleOut: string;
    assetsDest: string;
  }
): void {
  const { projectRoot, entryFile, bundleOut, assetsDest } = opts;

  // Turn the module manifest ON for the staged road ONLY (SHERLO-1894 Phase B).
  // The Sherlo Metro serializer reads SHERLO_MODULE_MANIFEST; setting it here scopes
  // emission to this spawned bundler process, so every other build (local dev,
  // non-Sherlo CI) is unaffected. Nothing else in this env changes, so the bundle
  // output is byte-for-byte what it would be without it.
  const bundlerEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SHERLO_MODULE_MANIFEST: '1',
  };

  if (bundler === 'expo') {
    const cmd = [
      'npx expo export:embed',
      `--platform=${platform}`,
      `--entry-file=${entryFile}`,
      `--bundle-output=${bundleOut}`,
      `--assets-dest=${assetsDest}`,
      '--dev=false',
      '--minify=true',
    ].join(' ');

    try {
      execSync(cmd, {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: bundlerEnv,
      });
    } catch (err: any) {
      const detail = (err.stderr?.toString?.() || '') + (err.stdout?.toString?.() || '');
      throw new Error(
        `expo export:embed failed for ${platform}:\n` + `${detail.slice(0, 500)}\n` + FALLBACK_LINE
      );
    }
  } else {
    const cmd = [
      'npx react-native bundle',
      `--platform ${platform}`,
      '--dev false',
      '--minify true',
      `--entry-file ${entryFile}`,
      `--bundle-output ${bundleOut}`,
      `--assets-dest ${assetsDest}`,
    ].join(' ');

    try {
      execSync(cmd, {
        cwd: projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: bundlerEnv,
      });
    } catch (err: any) {
      const detail = (err.stderr?.toString?.() || '') + (err.stdout?.toString?.() || '');
      throw new Error(
        `react-native bundle failed for ${platform}:\n` +
          `${detail.slice(0, 500)}\n` +
          FALLBACK_LINE
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Asset inventory
// ---------------------------------------------------------------------------

/**
 * Walk the Metro --assets-dest output directory and return a sorted list of
 * relative asset paths.  The API compares this against the base's recorded
 * inventory for Android containment (design §6.5).
 */
function collectAssetInventory(assetsDest: string): string[] {
  const results: string[] = [];

  function walk(dir: string, relativePath: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        results.push(relPath);
      }
    }
  }

  walk(assetsDest, '');
  return results.sort();
}

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

export function getExpoSdkVersion(projectRoot: string): number | null {
  // app.json / app.config.js written sdkVersion.
  try {
    const appJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
    const sdk: unknown = appJson?.expo?.sdkVersion;
    if (typeof sdk === 'string' || typeof sdk === 'number') {
      const num = parseInt(String(sdk), 10);
      if (!isNaN(num)) return num;
    }
  } catch {
    /* ignore */
  }

  // Fall back to the expo package major version as a proxy.
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    const expoVersion = deps.expo;
    if (expoVersion) {
      const match = String(expoVersion).match(/(\d+)\./);
      if (match) return parseInt(match[1], 10);
    }
  } catch {
    /* ignore */
  }

  return null;
}

function hasExpoDep(projectRoot: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    return 'expo' in deps;
  } catch {
    return false;
  }
}

function isVersionGte(version: string, minVersion: string): boolean {
  const a = parseSemver(version);
  const b = parseSemver(minVersion);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

function parseSemver(version: string): [number, number, number] {
  const parts = version
    .replace(/[^0-9.]/g, '')
    .split('.')
    .map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// ---------------------------------------------------------------------------
// Expo-updates detection (simplified for bundled context)
// ---------------------------------------------------------------------------

/**
 * Check whether expo-updates appears to be enabled for the given platform.
 *
 * This is a lightweight project-config check (no binary extraction) suitable
 * for the bundled flow.  It matches the spirit of the binary-level check in
 * gateMetadata.ts but operates on source-level signals.
 */
async function detectExpoUpdatesEnabled({
  projectRoot,
  platform,
}: {
  projectRoot: string;
  platform: Platform;
}): Promise<boolean> {
  // Check app config for updates.enabled.
  try {
    const appJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
    const updates = appJson?.expo?.updates;
    if (updates && typeof updates === 'object' && 'enabled' in updates) {
      return updates.enabled !== false;
    }
  } catch {
    /* ignore */
  }

  // On Android with bare workflow, check AndroidManifest.xml for
  // expo-updates metadata.
  if (platform === 'android') {
    const manifestPaths = [
      path.join(projectRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
    ];
    for (const manifestPath of manifestPaths) {
      try {
        const content = fs.readFileSync(manifestPath, 'utf8');
        if (
          content.includes('expo.modules.updates.EXPO_RUNTIME_VERSION') ||
          content.includes('expo.modules.updates.ENABLED')
        ) {
          return true;
        }
      } catch {
        /* ignore */
      }
    }
  }

  // On iOS, check if EXUpdatesEnabled key is in the Expo.plist.
  if (platform === 'ios') {
    const plistPath = path.join(projectRoot, 'ios', 'Supporting', 'Expo.plist');
    try {
      const content = fs.readFileSync(plistPath, 'utf8');
      if (content.includes('EXUpdatesEnabled')) {
        // Key present - use the same parser as gateMetadata.
        return parseExpoUpdatesEnabledFromPlist(content);
      }
    } catch {
      /* ignore */
    }
  }

  return false;
}
