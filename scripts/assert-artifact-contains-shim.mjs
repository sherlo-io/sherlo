#!/usr/bin/env node
//
// Asserts two facts about a freshly built app artifact:
//
//   1. The artifact CONTAINS the native shim. Whether the shim actually lands
//      in the built app depends on the app's own native project (CMake
//      linking on Android, CocoaPods resolving the podspec on iOS), which
//      only a real build can prove. An omitted native module is silent on iOS
//      (no pod, no error, the app just throws at runtime when JS reaches for
//      it) and loud but easy to miss on Android, so the check has to be on
//      the artifact - never on "the build exited zero".
//
//   2. The artifact's JS bundle NEVER contains the seam. The seam is planted
//      only by the CLI's generated entry (metro/entry.js's generateEntry),
//      never by the Metro plugin alone - so an ordinary app build like this
//      one must not carry it.
//
// The frozen names are never re-declared here - a second copy could drift out
// of sync with what the shim actually emits. They are read from the SDK copy
// the fixture installed and built against, inside its own node_modules, not
// from packages/react-native-storybook: the fixture installs the SDK from a
// committed tarball, which by design lags the workspace between re-packs, and
// this check must judge the artifact against the version that is really in it.
//
// Usage:
//   node scripts/assert-artifact-contains-shim.mjs <android|ios> <fixture dir> <artifact>
//     <fixture dir>  the app that produced the artifact, e.g. testing/expo
//     <artifact>     android: the .apk; ios: the .tar.gz the build uploads (a packed .app)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const [platform, fixtureDir, artifactPath] = process.argv.slice(2);

if (platform !== 'android' && platform !== 'ios') {
  fail(`first argument must be "android" or "ios", got ${JSON.stringify(platform)}`);
}
if (!fixtureDir || !existsSync(fixtureDir)) {
  fail(`no fixture directory at ${fixtureDir}`);
}
if (!artifactPath || !existsSync(artifactPath)) {
  fail(`no artifact at ${artifactPath}`);
}

const constantsPath = path.resolve(
  fixtureDir,
  'node_modules/@sherlo/react-native-storybook/dist/constants.js'
);
if (!existsSync(constantsPath)) {
  fail(
    `${constantsPath} is missing - install ${fixtureDir}'s dependencies so the SDK the ` +
      'artifact was built against is on disk, then check the artifact'
  );
}

const { ANDROID_SHIM_LIBRARY_NAME, IOS_SHIM_REGISTRATION_SYMBOL, SEAM_VERSION_GATE_REGEX } =
  createRequire(import.meta.url)(constantsPath);

if (platform === 'android') {
  assertAndroid(artifactPath);
} else {
  assertIos(artifactPath);
}

console.log(`✓ ${platform} artifact carries the shim and no seam: ${artifactPath}`);

// ---------------------------------------------------------------------------

function fail(message) {
  console.error(`assert-artifact-contains-shim: ${message}`);
  process.exit(1);
}

function assertAndroid(apkPath) {
  const shimLibrary = `lib${ANDROID_SHIM_LIBRARY_NAME}.so`;
  const listing = execFileSync('unzip', ['-l', apkPath], { encoding: 'utf8' });

  if (!listing.includes(shimLibrary)) {
    fail(
      `${shimLibrary} is not in the APK's entry list. The build succeeded, but Gradle ` +
        `silently dropped the native shim.\nListing:\n${listing}`
    );
  }

  // unzip -p streams the entry to stdout, so the APK is never extracted to disk.
  const bundle = execFileSync('unzip', ['-p', apkPath, 'assets/index.android.bundle'], {
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024,
  });
  assertNoSeam(bundle, 'assets/index.android.bundle');
}

function assertIos(tarballPath) {
  const extractedDir = mkdtempSync(path.join(tmpdir(), 'sherlo-ios-artifact-'));
  execFileSync('tar', ['-xzf', tarballPath, '-C', extractedDir]);

  const appName = readdirSync(extractedDir).find((entry) => entry.endsWith('.app'));
  if (!appName) {
    fail(`no .app bundle inside ${tarballPath} (extracted to ${extractedDir})`);
  }
  const appPath = path.join(extractedDir, appName);

  // Find the main executable the way the OS does - via Info.plist's
  // CFBundleExecutable, not by assuming it matches the scheme name.
  const executableName = execFileSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleExecutable', path.join(appPath, 'Info.plist')],
    { encoding: 'utf8' }
  ).trim();
  const executablePath = path.join(appPath, executableName);
  if (!existsSync(executablePath)) {
    fail(`no executable at ${executablePath}`);
  }

  // nm shows the exported registration symbol once the shim is linked in. A
  // missing symbol means the shim built, but never made it into the binary.
  const symbols = execFileSync('nm', ['-g', executablePath], { encoding: 'utf8' });
  if (!symbols.includes(IOS_SHIM_REGISTRATION_SYMBOL)) {
    fail(
      `${IOS_SHIM_REGISTRATION_SYMBOL} is not an exported symbol in ${executablePath} - ` +
        'the pod resolved, but its code never made it into the linked binary'
    );
  }

  const bundlePath = path.join(appPath, 'main.jsbundle');
  if (!existsSync(bundlePath)) {
    fail(`no main.jsbundle inside ${appPath} - this artifact embeds no JS bundle`);
  }
  assertNoSeam(readFileSync(bundlePath, 'utf8'), 'main.jsbundle');
}

function assertNoSeam(bundleText, bundleLabel) {
  if (SEAM_VERSION_GATE_REGEX.test(bundleText)) {
    fail(
      `${bundleLabel} carries the seam version marker. The seam is planted ONLY by the ` +
        "CLI's generated entry (metro/entry.js's generateEntry), never by the Metro " +
        'plugin alone - this build never ran the CLI, so it must not carry the seam.'
    );
  }
}
