/**
 * BUILD BOTH SEALED PARTS INTO THE SDK, run as the SDK's prepack so every `yarn pack` /
 * `npm publish` carries freshly built cores and no stale one.
 *
 * - The JS core: packages/sherlo-core/js/build.js writes sherlo-core.js, copied into the iOS and
 *   Android asset folders the SDK's `files` publishes.
 * - The C core: packages/sherlo-core/native/build.js compiles and strips it into
 *   ios/SherloCore.xcframework and android/src/main/jniLibs/<abi>/libsherlocore.so. It needs Xcode
 *   and the Android NDK, so a pack runs on macOS; a pack that cannot build it fails.
 *
 * None of these is committed: the root .gitignore holds every path.
 *
 * `node scripts/packSealedCore.js [js] [ios] [android]` builds the named parts, or all three.
 */
const fs = require('node:fs');
const path = require('node:path');
const { buildSealedCore } = require('../../sherlo-core/js/build.js');
const { buildAndroidCore, buildIosCore } = require('../../sherlo-core/native/build.js');

const IOS_ASSET = path.join(__dirname, '..', 'ios', 'Resources', 'assets', 'sherlo-core.js');
const ANDROID_ASSET = path.join(__dirname, '..', 'android', 'src', 'main', 'assets', 'sherlo-core.js');

async function packJsCore() {
  const builtCore = await buildSealedCore();
  for (const asset of [IOS_ASSET, ANDROID_ASSET]) {
    fs.mkdirSync(path.dirname(asset), { recursive: true });
    fs.copyFileSync(builtCore, asset);
    console.log('copied sherlo-core.js -> ' + path.relative(path.join(__dirname, '..'), asset));
  }
}

const PARTS = {
  js: packJsCore,
  ios: async () => buildIosCore(),
  android: async () => buildAndroidCore(),
};

async function packSealedCore(partNames = Object.keys(PARTS)) {
  for (const partName of partNames) {
    const buildPart = PARTS[partName];
    if (!buildPart) throw new Error('unknown sealed part "' + partName + '": name js, ios or android');
    await buildPart();
  }
}

module.exports = { packSealedCore };

if (require.main === module) {
  const named = process.argv.slice(2);
  packSealedCore(named.length > 0 ? named : undefined).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
