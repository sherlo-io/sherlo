/**
 * BUILD THE C CORE: native/src -> the SDK's iOS xcframework and Android libraries, compiled and
 * stripped. Run on macOS, by the SDK's pack step (packages/react-native-storybook/scripts/
 * packSealedCore.js); neither output is committed.
 *
 * iOS: `xcrun clang -fvisibility=hidden -O2` for the device (arm64) and the simulator (arm64 and
 * x86_64), `libtool -static` into one libsherlocore.a per slice (`lipo` joins the simulator's two),
 * `strip -S -x`, and `xcodebuild -create-xcframework` into ios/SherloCore.xcframework. Both slices
 * are named libsherlocore.a, or CocoaPods refuses the xcframework.
 *
 * Android: the NDK's clang, one libsherlocore.so per ABI with the JNI face, `-fvisibility=hidden
 * -s`, 16 KB page aligned, into android/src/main/jniLibs/<abi>/. The NDK is found through
 * ANDROID_NDK_HOME, or the newest one under ANDROID_HOME/ndk.
 *
 * The version is the SDK's, read from lerna.json, like the JS core's.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const HERE = __dirname;
const INCLUDE_DIR = path.join(HERE, 'include');
const HEADER = path.join(INCLUDE_DIR, 'sherlo_core.h');
const SOURCE_DIR = path.join(HERE, 'src');
// The core itself, which every platform compiles; the JNI face is Android's alone.
const CORE_SOURCES = ['core.c', 'pixels.c', 'stillness.c'].map((name) => path.join(SOURCE_DIR, name));
const JNI_SOURCE = path.join(SOURCE_DIR, 'sherlo_core_jni.c');
// Object files and unstripped libraries on the way (git-ignored).
const WORK_DIR = path.join(HERE, 'build');
const LERNA_JSON = path.join(HERE, '..', '..', '..', 'lerna.json');

const SDK_ROOT = path.join(HERE, '..', '..', 'react-native-storybook');
const IOS_OUTPUT = path.join(SDK_ROOT, 'ios', 'SherloCore.xcframework');
const ANDROID_OUTPUT = path.join(SDK_ROOT, 'android', 'src', 'main', 'jniLibs');
const LIBRARY_FILE_IOS = 'libsherlocore.a';
const LIBRARY_FILE_ANDROID = 'libsherlocore.so';

const IOS_MINIMUM_VERSION = '12.0';
const IOS_SLICES = [
  { name: 'device', sdk: 'iphoneos', targets: ['arm64-apple-ios' + IOS_MINIMUM_VERSION] },
  {
    name: 'simulator',
    sdk: 'iphonesimulator',
    targets: [
      'arm64-apple-ios' + IOS_MINIMUM_VERSION + '-simulator',
      'x86_64-apple-ios' + IOS_MINIMUM_VERSION + '-simulator',
    ],
  },
];

// The lowest API level the NDK still builds for; a library built for it loads on every newer one.
const ANDROID_API_LEVEL = 21;
const ANDROID_ABIS = [
  { abi: 'arm64-v8a', target: 'aarch64-linux-android' + ANDROID_API_LEVEL },
  { abi: 'armeabi-v7a', target: 'armv7a-linux-androideabi' + ANDROID_API_LEVEL },
  { abi: 'x86', target: 'i686-linux-android' + ANDROID_API_LEVEL },
  { abi: 'x86_64', target: 'x86_64-linux-android' + ANDROID_API_LEVEL },
];
const ANDROID_PAGE_SIZE = 16384;

function coreVersion() {
  return JSON.parse(fs.readFileSync(LERNA_JSON, 'utf8')).version;
}

function compileFlags() {
  return [
    '-std=c11',
    '-fvisibility=hidden',
    '-O2',
    // No fused multiply-add: each YIQ product is rounded on its own, as Objective-C and Java did.
    '-ffp-contract=off',
    '-I',
    INCLUDE_DIR,
    '-DSHERLO_CORE_VERSION="' + coreVersion() + '"',
  ];
}

function run(tool, args) {
  execFileSync(tool, args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

function succeeds(tool, args) {
  try {
    execFileSync(tool, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ---- iOS -----------------------------------------------------------------------------------------

/** Why the iOS core cannot be built on this machine, or null when it can. */
function missingIosTools() {
  if (process.platform !== 'darwin') return 'the iOS core builds only on macOS';
  if (!succeeds('xcrun', ['--sdk', 'iphoneos', '--find', 'clang'])) {
    return 'xcrun cannot find the iOS SDK (install Xcode)';
  }
  return null;
}

function buildIosSlice(slice, workDir) {
  const sliceDir = path.join(workDir, 'ios', slice.name);
  fs.mkdirSync(sliceDir, { recursive: true });

  const archivePerTarget = slice.targets.map((target) => {
    const objects = CORE_SOURCES.map((source) => {
      const object = path.join(sliceDir, target + '-' + path.basename(source, '.c') + '.o');
      run('xcrun', [
        '--sdk',
        slice.sdk,
        'clang',
        '-target',
        target,
        ...compileFlags(),
        '-c',
        source,
        '-o',
        object,
      ]);
      return object;
    });
    const archive = path.join(sliceDir, target + '.a');
    fs.rmSync(archive, { force: true });
    run('xcrun', ['libtool', '-static', '-o', archive, ...objects]);
    return archive;
  });

  const library = path.join(sliceDir, LIBRARY_FILE_IOS);
  fs.rmSync(library, { force: true });
  if (archivePerTarget.length === 1) {
    fs.copyFileSync(archivePerTarget[0], library);
  } else {
    run('xcrun', ['lipo', '-create', ...archivePerTarget, '-output', library]);
  }
  run('xcrun', ['strip', '-S', '-x', library]);
  return library;
}

/**
 * Builds the xcframework: by default ios/SherloCore.xcframework in the SDK; a test names its own
 * `output` and `workDir`. Returns the xcframework's path.
 */
function buildIosCore({ output = IOS_OUTPUT, workDir = WORK_DIR } = {}) {
  const missing = missingIosTools();
  if (missing) throw new Error('cannot build the C core for iOS: ' + missing);

  const libraries = IOS_SLICES.map((slice) => buildIosSlice(slice, workDir));
  fs.rmSync(output, { recursive: true, force: true });
  const libraryArguments = libraries.flatMap((library) => ['-library', library, '-headers', INCLUDE_DIR]);
  run('xcodebuild', ['-create-xcframework', ...libraryArguments, '-output', output]);

  console.log('SherloCore.xcframework: version ' + coreVersion() + ', ' + describeSizes(libraries));
  return output;
}

// ---- Android -------------------------------------------------------------------------------------

function newestVersionDir(parent) {
  if (!fs.existsSync(parent)) return null;
  const versions = fs
    .readdirSync(parent)
    .filter((name) => /^\d+(\.\d+)*$/.test(name))
    .sort((left, right) => {
      const leftParts = left.split('.').map(Number);
      const rightParts = right.split('.').map(Number);
      for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
        const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
        if (difference !== 0) return difference;
      }
      return 0;
    });
  return versions.length > 0 ? path.join(parent, versions[versions.length - 1]) : null;
}

/** The NDK folder: ANDROID_NDK_HOME, or the newest NDK under ANDROID_HOME (or ANDROID_SDK_ROOT). */
function findNdk() {
  const named = process.env.ANDROID_NDK_HOME || process.env.ANDROID_NDK_ROOT;
  if (named && fs.existsSync(named)) return named;
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  return sdk ? newestVersionDir(path.join(sdk, 'ndk')) : null;
}

/** One of the NDK's LLVM tools for this machine (`clang`, `llvm-nm`, ...), or null. */
function findNdkTool(toolName) {
  const ndk = findNdk();
  if (!ndk) return null;
  const prebuiltDir = path.join(ndk, 'toolchains', 'llvm', 'prebuilt');
  if (!fs.existsSync(prebuiltDir)) return null;
  for (const host of fs.readdirSync(prebuiltDir)) {
    const tool = path.join(prebuiltDir, host, 'bin', toolName);
    if (fs.existsSync(tool)) return tool;
  }
  return null;
}

/** Why the Android core cannot be built on this machine, or null when it can. */
function missingAndroidTools() {
  if (findNdkTool('clang')) return null;
  return 'no Android NDK found (set ANDROID_NDK_HOME, or ANDROID_HOME with an NDK under ndk/)';
}

/**
 * Builds one libsherlocore.so per ABI: by default into the SDK's android/src/main/jniLibs; a test
 * names its own `output`. Returns the jniLibs path.
 */
function buildAndroidCore({ output = ANDROID_OUTPUT } = {}) {
  const clang = findNdkTool('clang');
  if (!clang) throw new Error('cannot build the C core for Android: ' + missingAndroidTools());

  const libraries = ANDROID_ABIS.map(({ abi, target }) => {
    const library = path.join(output, abi, LIBRARY_FILE_ANDROID);
    fs.mkdirSync(path.dirname(library), { recursive: true });
    run(clang, [
      '--target=' + target,
      ...compileFlags(),
      '-fPIC',
      '-shared',
      '-s',
      '-Wl,-z,max-page-size=' + ANDROID_PAGE_SIZE,
      '-Wl,--no-undefined',
      ...CORE_SOURCES,
      JNI_SOURCE,
      '-ljnigraphics',
      '-lm',
      '-o',
      library,
    ]);
    return library;
  });

  console.log('libsherlocore.so: version ' + coreVersion() + ', ' + describeSizes(libraries));
  return output;
}

function describeSizes(libraries) {
  return libraries
    .map((library) => {
      const sliceOrAbi = path.basename(path.dirname(library));
      return sliceOrAbi + ' ' + fs.statSync(library).size + ' bytes';
    })
    .join(', ');
}

module.exports = {
  ANDROID_ABIS,
  ANDROID_OUTPUT,
  ANDROID_PAGE_SIZE,
  CORE_SOURCES,
  HEADER,
  INCLUDE_DIR,
  IOS_OUTPUT,
  JNI_SOURCE,
  LIBRARY_FILE_ANDROID,
  LIBRARY_FILE_IOS,
  WORK_DIR,
  buildAndroidCore,
  buildIosCore,
  coreVersion,
  findNdkTool,
  missingAndroidTools,
  missingIosTools,
};

// `node native/build.js [ios] [android]`: the named platforms, or both.
if (require.main === module) {
  const named = process.argv.slice(2);
  const platforms = named.length > 0 ? named : ['ios', 'android'];
  for (const platform of platforms) {
    if (platform === 'ios') buildIosCore();
    else if (platform === 'android') buildAndroidCore();
    else throw new Error('unknown platform "' + platform + '": name ios or android');
  }
}
