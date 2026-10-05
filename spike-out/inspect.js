// SPIKE android-lib-splice: copy the built release APK here and print what the splice needs to know
// about it - its entries, how lib/ is stored, its signing, its package and launch activity, and which
// core version each library carries.
// `node spike-out/inspect.js`
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const OUT = __dirname;
const BUILT_APK = path.join(
  OUT, '..', 'examples', 'standard', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'
);
const APK = path.join(OUT, 'app-release.apk');
const BUILD_TOOLS = path.join(process.env.ANDROID_HOME, 'build-tools', '36.0.0');

function show(title, tool, args) {
  console.log('\n===== ' + title + ' =====');
  try {
    console.log(execFileSync(tool, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    console.log('(failed) ' + (error.stdout || '') + (error.stderr || '') + error.message);
  }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function coreVersionIn(buffer) {
  const match = buffer.toString('latin1').match(/2\.0\.2[a-z-]*/);
  return match ? match[0] : '(none)';
}

fs.copyFileSync(BUILT_APK, APK);
console.log('copied ' + BUILT_APK + ' -> ' + APK + ' (' + fs.statSync(APK).size + ' bytes)');

show('unzip -l (lib/ and sherlo assets)', 'sh', ['-c', 'unzip -l "$0" | grep -E "lib/|sherlo"', APK]);
show('zipinfo lib/ entries (stored = uncompressed)', 'sh', ['-c', 'zipinfo "$0" "lib/*"', APK]);
show('zipinfo -v libsherlocore.so', 'sh', [
  '-c', 'zipinfo -v "$0" lib/arm64-v8a/libsherlocore.so | grep -E "compression method|offset of local header|file system or operating|compressed size|uncompressed size"', APK,
]);
show('apksigner verify --print-certs -v', path.join(BUILD_TOOLS, 'apksigner'), ['verify', '--print-certs', '-v', APK]);
show('aapt2 dump badging (package, launchable-activity)', 'sh', [
  '-c', '"$0" dump badging "$1" | grep -E "^package:|launchable-activity|native-code"', path.join(BUILD_TOOLS, 'aapt2'), APK,
]);
show('manifest extractNativeLibs', 'sh', [
  '-c', '"$0" dump xmltree --file AndroidManifest.xml "$1" | grep -iE "extractNativeLibs|E: application" || echo "(extractNativeLibs not set)"',
  path.join(BUILD_TOOLS, 'aapt2'), APK,
]);
show('zipalign -c -P 16 -v 4 (lib/ only)', 'sh', [
  '-c', '"$0" -c -P 16 -v 4 "$1" | grep -E "lib/|Verification"', path.join(BUILD_TOOLS, 'zipalign'), APK,
]);

console.log('\n===== libraries =====');
const inApk = execFileSync('unzip', ['-p', APK, 'lib/arm64-v8a/libsherlocore.so'], { maxBuffer: 64 * 1024 * 1024 });
// AGP strips native libraries again as it packages them, so the APK's bytes differ from the SDK's
// jniLibs copy: the original the splice replaces is the APK's own.
const sdkCopy = path.join(OUT, 'libsherlocore-sdk-jnilibs.so');
if (!fs.existsSync(sdkCopy)) fs.renameSync(path.join(OUT, 'libsherlocore-original.so'), sdkCopy);
fs.writeFileSync(path.join(OUT, 'libsherlocore-original.so'), inApk);
const libraries = {
  'APK lib/arm64-v8a/libsherlocore.so': inApk,
  'libsherlocore-original.so': fs.readFileSync(path.join(OUT, 'libsherlocore-original.so')),
  'libsherlocore-sdk-jnilibs.so': fs.readFileSync(sdkCopy),
  'libsherlocore-variant.so': fs.readFileSync(path.join(OUT, 'libsherlocore-variant.so')),
};
for (const [name, buffer] of Object.entries(libraries)) {
  console.log(name + ': ' + buffer.length + ' bytes, sha256 ' + sha256(buffer) + ', version ' + coreVersionIn(buffer));
}
