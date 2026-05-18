import crypto from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { applySbVersion, resetSbVersion, type SbVersion } from './sb-version.js';
import { applyVariant, resetFixture } from './variant.js';

const INTEGRATION_TESTS_DIR = path.resolve(__dirname, '..');
const APPS_DIR = path.join(INTEGRATION_TESTS_DIR, 'apps');
const BUILDS_DIR = path.join(INTEGRATION_TESTS_DIR, '.builds');

// Package name is fixed for the single consolidated base app
const PACKAGE_NAME = 'com.sherlo.integrationtests';

export interface BuildResult {
  apkPath: string;
  appPath?: string;
  artifactPath: string;
  packageName: string;
  platform: 'android' | 'ios';
  cacheHit: boolean;
}

export interface BuildOptions {
  appName: string;
  sbVersion: SbVersion;
  variantName?: string;
  platform?: 'android' | 'ios';
  force?: boolean;
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.yarn', '.gradle', 'build', '.cxx']);
const IOS_SKIP_DIRS = new Set(['node_modules', '.git', '.yarn', 'build', 'Pods', 'DerivedData']);

function hashDirectory(dir: string, rootForRelativePaths: string, skipDirs?: Set<string>): string[] {
  const skip = skipDirs ?? SKIP_DIRS;
  if (!existsSync(dir)) return [];
  const entries: string[] = [];
  function walk(current: string) {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        if (skip.has(item.name)) continue;
        walk(full);
      } else if (item.isFile()) {
        if (item.name === 'yarn.lock') continue;
        const rel = path.relative(rootForRelativePaths, full);
        const content = readFileSync(full);
        entries.push(`${rel}:${crypto.createHash('sha1').update(content).digest('hex')}`);
      }
    }
  }
  walk(dir);
  return entries;
}

function computeNativeFingerprint(appName: string): string {
  const appDir = path.join(APPS_DIR, appName);
  const sdkDir = path.join(appDir, 'node_modules', '@sherlo', 'react-native-storybook');
  const entries: string[] = [];

  // Android source and gradle config (.cxx build artifacts are excluded by SKIP_DIRS)
  entries.push(...hashDirectory(path.join(appDir, 'android'), appDir));

  // SDK Android native source only (dist/metro are JS - they belong to the JS fingerprint)
  entries.push(...hashDirectory(path.join(sdkDir, 'android'), sdkDir));

  // Native dep versions that affect which prebuilt libs are linked into the APK.
  // @storybook/* packages have no native code, so they are intentionally excluded.
  const appPkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const NATIVE_DEPS = [
    'react-native',
    'react-native-reanimated',
    'react-native-worklets',
    'react-native-gesture-handler',
  ];
  for (const dep of NATIVE_DEPS) {
    const version = appPkg.dependencies?.[dep] ?? appPkg.devDependencies?.[dep] ?? '';
    entries.push(`dep:${dep}:${version}`);
  }

  entries.sort();
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');
}

function computeNativeFingerprintIos(appName: string): string {
  const appDir = path.join(APPS_DIR, appName);
  const sdkDir = path.join(appDir, 'node_modules', '@sherlo', 'react-native-storybook');
  const entries: string[] = [];

  entries.push(...hashDirectory(path.join(appDir, 'ios'), appDir, IOS_SKIP_DIRS));

  // SDK iOS native source
  entries.push(...hashDirectory(path.join(sdkDir, 'ios'), sdkDir));

  const podfilePath = path.join(appDir, 'ios', 'Podfile');
  if (existsSync(podfilePath)) {
    const content = readFileSync(podfilePath);
    entries.push(`Podfile:${crypto.createHash('sha1').update(content).digest('hex')}`);
  }

  const appPkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const NATIVE_DEPS = [
    'react-native',
    'react-native-reanimated',
    'react-native-worklets',
    'react-native-gesture-handler',
  ];
  for (const dep of NATIVE_DEPS) {
    const version = appPkg.dependencies?.[dep] ?? appPkg.devDependencies?.[dep] ?? '';
    entries.push(`dep:${dep}:${version}`);
  }

  entries.sort();
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');
}

function computeJsFingerprint(appName: string): string {
  const appDir = path.join(APPS_DIR, appName);
  const sdkDir = path.join(appDir, 'node_modules', '@sherlo', 'react-native-storybook');
  const entries: string[] = [];

  // SDK JS files
  entries.push(...hashDirectory(path.join(sdkDir, 'dist'), sdkDir));
  entries.push(...hashDirectory(path.join(sdkDir, 'metro'), sdkDir));

  // App JS source
  entries.push(...hashDirectory(path.join(appDir, 'src'), appDir));

  for (const f of ['index.js', 'App.tsx', 'metro.config.js', 'babel.config.js']) {
    const p = path.join(appDir, f);
    if (existsSync(p)) {
      const content = readFileSync(p);
      entries.push(`${f}:${crypto.createHash('sha1').update(content).digest('hex')}`);
    }
  }

  // Storybook config (sb-version specific)
  const mainTs = path.join(appDir, '.rnstorybook', 'main.ts');
  if (existsSync(mainTs)) {
    const content = readFileSync(mainTs);
    entries.push(`main.ts:${crypto.createHash('sha1').update(content).digest('hex')}`);
  }

  // Generated storybook requires (reflects stories registered)
  const requiresTs = path.join(appDir, '.rnstorybook', 'storybook.requires.ts');
  if (existsSync(requiresTs)) {
    const content = readFileSync(requiresTs);
    entries.push(`storybook.requires.ts:${crypto.createHash('sha1').update(content).digest('hex')}`);
  }

  entries.sort();
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');
}

// Keeps only the directory named `keepHash` under `parentDir`. Deletes all other
// entries (whether dirs, files, or splice-tmp leftovers). No-op if parentDir doesn't exist.
function pruneCacheSiblings(parentDir: string, keepHash: string): void {
  if (!existsSync(parentDir)) return;
  let pruned = 0;
  for (const entry of readdirSync(parentDir)) {
    if (entry === keepHash) continue;
    try {
      rmSync(path.join(parentDir, entry), { recursive: true, force: true });
      pruned++;
    } catch {
      // best-effort; don't abort the build if a single entry can't be deleted
    }
  }
  if (pruned > 0) {
    console.log(`app-builder: GC removed ${pruned} stale entries from ${parentDir}`);
  }
}

function resolveAndroidBuildTool(tool: string): string {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!androidHome) throw new Error('ANDROID_HOME / ANDROID_SDK_ROOT not set');
  const buildToolsDir = path.join(androidHome, 'build-tools');
  if (!existsSync(buildToolsDir)) throw new Error(`build-tools not found in ${androidHome}`);
  const versions = readdirSync(buildToolsDir).sort().reverse();
  for (const v of versions) {
    const bin = path.join(buildToolsDir, v, tool);
    if (existsSync(bin)) return bin;
  }
  throw new Error(`${tool} not found in any build-tools version under ${buildToolsDir}`);
}

function spliceAndroidBundle(
  baseApk: string,
  bundleFile: string,
  assetsDir: string,
  keystorePath: string,
  outApk: string,
  tmpDir: string,
): void {
  const extractDir = path.join(tmpDir, 'apk-extract');
  mkdirSync(extractDir, { recursive: true });

  execSync(`unzip -qo "${baseApk}" -d "${extractDir}"`, { timeout: 60_000 });

  // Replace / inject the JS bundle
  const apkBundleTarget = path.join(extractDir, 'assets', 'index.android.bundle');
  mkdirSync(path.dirname(apkBundleTarget), { recursive: true });
  copyFileSync(bundleFile, apkBundleTarget);

  // Copy Metro-generated assets (images, fonts, etc.) - skip the bundle file itself
  if (existsSync(assetsDir)) {
    execSync(`cp -r "${assetsDir}/." "${path.join(extractDir, 'assets')}"`, { stdio: 'pipe' });
  }

  // Remove only APK signature files so we can re-sign; keep META-INF/services/ for Java SPI
  const metaInfDir = path.join(extractDir, 'META-INF');
  if (existsSync(metaInfDir)) {
    execSync(
      `find "${metaInfDir}" -maxdepth 1 -type f \\( -name 'MANIFEST.MF' -o -name '*.SF' -o -name '*.RSA' -o -name '*.DSA' -o -name '*.EC' \\) -delete`,
      { stdio: 'pipe' },
    );
  }

  // Re-zip (store .so and .arsc uncompressed for runtime performance)
  const rezippedApk = path.join(tmpDir, 'repackaged.apk');
  execSync(`cd "${extractDir}" && zip -rqXn .so:.arsc "${rezippedApk}" . -x "*.DS_Store"`, {
    shell: '/bin/bash',
    timeout: 60_000,
  });

  // Align
  const zipalign = resolveAndroidBuildTool('zipalign');
  const alignedApk = path.join(tmpDir, 'aligned.apk');
  execSync(`"${zipalign}" -v -p 4 "${rezippedApk}" "${alignedApk}"`, { timeout: 30_000 });

  // Sign with the debug keystore
  const apksigner = resolveAndroidBuildTool('apksigner');
  execSync(
    `"${apksigner}" sign --ks "${keystorePath}" --ks-key-alias androiddebugkey ` +
    `--ks-pass pass:android --key-pass pass:android "${alignedApk}"`,
    { stdio: 'inherit', timeout: 30_000 },
  );

  copyFileSync(alignedApk, outApk);
}

export function buildNativeApp(appName: string, opts: { force?: boolean } = {}): string {
  const appDir = path.join(APPS_DIR, appName);
  const nativeSha = computeNativeFingerprint(appName);
  const cacheDir = path.join(BUILDS_DIR, appName, 'native', nativeSha);
  const apkPath = path.join(cacheDir, 'app-release.apk');

  if (!opts.force && existsSync(apkPath)) {
    console.log(`app-builder: native APK cache hit (${nativeSha.slice(0, 8)})`);
    return apkPath;
  }

  pruneCacheSiblings(path.join(BUILDS_DIR, appName, 'native'), nativeSha);
  mkdirSync(cacheDir, { recursive: true });

  const androidDir = path.join(appDir, 'android');
  console.log('app-builder: building native APK (Gradle assembleRelease)');
  execFileSync('./gradlew', ['assembleRelease'], {
    cwd: androidDir,
    stdio: 'inherit',
    timeout: 1_200_000,
  });

  const builtApk = path.join(
    androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk',
  );
  copyFileSync(builtApk, apkPath);
  console.log(`app-builder: native APK cached at ${apkPath}`);
  return apkPath;
}

export function buildNativeAppIos(appName: string, opts: { force?: boolean } = {}): string {
  const appDir = path.join(APPS_DIR, appName);
  const iosDir = path.join(appDir, 'ios');
  const nativeSha = computeNativeFingerprintIos(appName);
  const cacheDir = path.join(BUILDS_DIR, appName, 'native-ios', nativeSha);

  // Find scheme from xcworkspace name
  const entries = readdirSync(iosDir);
  const workspaceEntry = entries.find(e => e.endsWith('.xcworkspace'));
  if (!workspaceEntry) throw new Error(`No .xcworkspace found in ${iosDir}`);
  const scheme = workspaceEntry.replace('.xcworkspace', '');

  const cachedAppDir = path.join(cacheDir, `${scheme}.app`);

  if (!opts.force && existsSync(cachedAppDir)) {
    console.log(`app-builder: native iOS .app cache hit (${nativeSha.slice(0, 8)})`);
    return cachedAppDir;
  }

  pruneCacheSiblings(path.join(BUILDS_DIR, appName, 'native-ios'), nativeSha);
  mkdirSync(cacheDir, { recursive: true });

  // Run pod install if Manifest.lock is missing or differs from Podfile.lock
  const podfileLock = path.join(iosDir, 'Podfile.lock');
  const manifestLock = path.join(iosDir, 'Pods', 'Manifest.lock');
  const needsPodInstall =
    !existsSync(manifestLock) ||
    readFileSync(podfileLock, 'utf8') !== readFileSync(manifestLock, 'utf8');

  if (needsPodInstall) {
    console.log('app-builder: running pod install');
    const home = process.env.HOME ?? '/Users/' + process.env.USER;
    const rvmBin = `${home}/.rvm/gems/ruby-3.2.2/bin`;
    const rvmRuby = `${home}/.rvm/rubies/ruby-3.2.2/bin`;
    const pathWithRvm = `${rvmBin}:${rvmRuby}:${process.env.PATH ?? ''}`;
    try {
      execSync('pod install', {
        cwd: iosDir,
        stdio: 'inherit',
        timeout: 600_000,
        env: { ...process.env, PATH: pathWithRvm },
      });
    } catch (err) {
      throw new Error(
        `pod install failed. Ensure ruby 3.2.2 is available via RVM (~/.rvm/rubies/ruby-3.2.2). ` +
        `Original error: ${(err as Error).message}`,
      );
    }
  } else {
    console.log('app-builder: pod install skipped (Manifest.lock matches Podfile.lock)');
  }

  console.log(`app-builder: building native iOS .app (xcodebuild Release-iphonesimulator)`);
  execSync(
    `xcodebuild -workspace ${scheme}.xcworkspace -scheme ${scheme} ` +
    `-configuration Release -derivedDataPath build ` +
    `-destination 'generic/platform=iOS Simulator' -sdk iphonesimulator -quiet ` +
    `CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO`,
    {
      cwd: iosDir,
      stdio: 'inherit',
      timeout: 1_200_000,
      env: { ...process.env, SKIP_BUNDLING: '1' },
    },
  );

  // Locate the built .app (glob for *.app under Release-iphonesimulator)
  const productsDir = path.join(iosDir, 'build', 'Build', 'Products', 'Release-iphonesimulator');
  const appEntries = readdirSync(productsDir).filter(e => e.endsWith('.app') && !e.endsWith('.dSYM'));
  if (appEntries.length === 0) throw new Error(`No .app found under ${productsDir}`);
  const builtAppPath = path.join(productsDir, appEntries[0]);

  execSync(`cp -R "${builtAppPath}" "${cachedAppDir}"`, { timeout: 120_000 });
  console.log(`app-builder: native iOS .app cached at ${cachedAppDir}`);
  return cachedAppDir;
}

export function bundleAndSplice(opts: {
  appName: string;
  sbVersion: SbVersion;
  variantName?: string;
  nativeApkPath: string;
  force?: boolean;
}): { apkPath: string; cacheHit: boolean } {
  const { appName, sbVersion, variantName, nativeApkPath, force = false } = opts;
  const appDir = path.join(APPS_DIR, appName);

  applySbVersion(appName, sbVersion);
  if (variantName) {
    applyVariant(appName, variantName);
  }

  const jsSha = computeJsFingerprint(appName);
  const variantSlot = variantName ?? 'base';
  const cacheDir = path.join(BUILDS_DIR, appName, 'spliced', sbVersion, variantSlot, jsSha);
  const splicedApkPath = path.join(cacheDir, 'app-release.apk');

  if (!force && existsSync(splicedApkPath)) {
    console.log(`app-builder: spliced APK cache hit (${sbVersion}/${variantSlot}/${jsSha.slice(0, 8)})`);
    if (variantName) resetFixture(appName, { skipGenerate: true });
    resetSbVersion(appName);
    return { apkPath: splicedApkPath, cacheHit: true };
  }

  pruneCacheSiblings(path.join(BUILDS_DIR, appName, 'spliced', sbVersion, variantSlot), jsSha);

  const bundleWorkDir = path.join(BUILDS_DIR, appName, 'bundles', sbVersion, variantSlot, jsSha);
  mkdirSync(bundleWorkDir, { recursive: true });
  const bundleFile = path.join(bundleWorkDir, 'index.android.bundle');
  const assetsDir = path.join(bundleWorkDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });

  const rnBin = path.join(appDir, 'node_modules', '.bin', 'react-native');
  console.log(`app-builder: bundling JS (${sbVersion}/${variantSlot})`);
  execFileSync(
    rnBin,
    [
      'bundle',
      '--platform', 'android',
      '--dev', 'false',
      '--entry-file', 'index.js',
      '--bundle-output', bundleFile,
      '--assets-dest', assetsDir,
    ],
    { cwd: appDir, stdio: 'inherit', timeout: 300_000 },
  );

  mkdirSync(cacheDir, { recursive: true });
  const tmpDir = path.join(bundleWorkDir, 'splice-tmp');
  mkdirSync(tmpDir, { recursive: true });

  const keystorePath = path.join(appDir, 'android', 'app', 'debug.keystore');
  console.log(`app-builder: splicing bundle into native APK`);
  spliceAndroidBundle(nativeApkPath, bundleFile, assetsDir, keystorePath, splicedApkPath, tmpDir);

  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(path.join(cacheDir, 'splice-tmp'), { recursive: true, force: true });

  if (variantName) resetFixture(appName, { skipGenerate: true });
  resetSbVersion(appName);

  console.log(`app-builder: spliced APK cached at ${splicedApkPath}`);
  return { apkPath: splicedApkPath, cacheHit: false };
}

export function bundleAndSpliceIos(opts: {
  appName: string;
  sbVersion: SbVersion;
  variantName?: string;
  nativeAppPath: string;
  force?: boolean;
}): { splicedAppPath: string; bundleId: string; cacheHit: boolean } {
  const { appName, sbVersion, variantName, nativeAppPath, force = false } = opts;
  const appDir = path.join(APPS_DIR, appName);

  applySbVersion(appName, sbVersion);
  if (variantName) {
    applyVariant(appName, variantName);
  }

  const jsSha = computeJsFingerprint(appName);
  const variantSlot = variantName ?? 'base';

  // Determine scheme name from the native .app directory name
  const appBaseName = path.basename(nativeAppPath); // e.g. "BareRnHermesApp.app"
  const scheme = appBaseName.replace(/\.app$/, '');

  const cacheDir = path.join(BUILDS_DIR, appName, 'spliced-ios', sbVersion, variantSlot, jsSha);
  const splicedAppPath = path.join(cacheDir, appBaseName);

  if (!force && existsSync(splicedAppPath)) {
    console.log(`app-builder: spliced iOS .app cache hit (${sbVersion}/${variantSlot}/${jsSha.slice(0, 8)})`);
    const bundleId = execSync(
      `plutil -extract CFBundleIdentifier raw "${splicedAppPath}/Info.plist"`,
      { encoding: 'utf8', timeout: 5_000 },
    ).trim();
    if (variantName) resetFixture(appName, { skipGenerate: true });
    resetSbVersion(appName);
    return { splicedAppPath, bundleId, cacheHit: true };
  }

  pruneCacheSiblings(path.join(BUILDS_DIR, appName, 'spliced-ios', sbVersion, variantSlot), jsSha);

  const bundleWorkDir = path.join(BUILDS_DIR, appName, 'bundles-ios', sbVersion, variantSlot, jsSha);
  mkdirSync(bundleWorkDir, { recursive: true });
  const bundleFile = path.join(bundleWorkDir, 'main.jsbundle');
  const assetsDir = path.join(bundleWorkDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });

  const rnBin = path.join(appDir, 'node_modules', '.bin', 'react-native');
  console.log(`app-builder: bundling iOS JS (${sbVersion}/${variantSlot})`);
  execFileSync(
    rnBin,
    [
      'bundle',
      '--platform', 'ios',
      '--dev', 'false',
      '--entry-file', 'index.js',
      '--bundle-output', bundleFile,
      '--assets-dest', assetsDir,
    ],
    { cwd: appDir, stdio: 'inherit', timeout: 300_000 },
  );

  mkdirSync(cacheDir, { recursive: true });

  // Copy native .app to spliced cache
  execSync(`cp -R "${nativeAppPath}" "${splicedAppPath}"`, { timeout: 120_000 });

  // Drop JS bundle into the .app
  copyFileSync(bundleFile, path.join(splicedAppPath, 'main.jsbundle'));

  // Copy Metro assets into .app/assets/
  if (existsSync(assetsDir)) {
    const appAssetsDir = path.join(splicedAppPath, 'assets');
    mkdirSync(appAssetsDir, { recursive: true });
    execSync(`cp -r "${assetsDir}/." "${appAssetsDir}"`, { stdio: 'pipe', timeout: 60_000 });
  }

  const bundleId = execSync(
    `plutil -extract CFBundleIdentifier raw "${splicedAppPath}/Info.plist"`,
    { encoding: 'utf8', timeout: 5_000 },
  ).trim();

  if (variantName) resetFixture(appName, { skipGenerate: true });
  resetSbVersion(appName);

  console.log(`app-builder: spliced iOS .app cached at ${splicedAppPath}`);
  return { splicedAppPath, bundleId, cacheHit: false };
}

export function buildApp(opts: BuildOptions): BuildResult {
  const { appName, sbVersion, variantName, platform = 'android', force = false } = opts;

  if (platform === 'ios') {
    const appPath = buildNativeAppIos(appName, { force });
    const { splicedAppPath, bundleId, cacheHit } = bundleAndSpliceIos({
      appName, sbVersion, variantName, nativeAppPath: appPath, force,
    });
    return {
      apkPath: '',
      appPath: splicedAppPath,
      artifactPath: splicedAppPath,
      packageName: bundleId,
      platform: 'ios',
      cacheHit,
    };
  }

  // Existing Android path
  const nativeApkPath = buildNativeApp(appName, { force });
  const { apkPath, cacheHit } = bundleAndSplice({ appName, sbVersion, variantName, nativeApkPath, force });
  return {
    apkPath,
    artifactPath: apkPath,
    packageName: PACKAGE_NAME,
    platform: 'android',
    cacheHit,
  };
}
