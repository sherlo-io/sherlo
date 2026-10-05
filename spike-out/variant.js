// SPIKE android-lib-splice: build a second arm64-v8a libsherlocore.so exactly as
// packages/sherlo-core/native/build.js does, except for the version it reports, and copy the
// original (from the SDK's jniLibs) beside it.
// `node spike-out/variant.js`
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const native = require('../packages/sherlo-core/native/build.js');

const VARIANT_VERSION = '2.0.2-splice-variant';
const OUT = __dirname;
const ARM64 = native.ANDROID_ABIS.find(({ abi }) => abi === 'arm64-v8a');

fs.copyFileSync(
  path.join(native.ANDROID_OUTPUT, 'arm64-v8a', native.LIBRARY_FILE_ANDROID),
  path.join(OUT, 'libsherlocore-original.so')
);

const clang = native.findNdkTool('clang');
execFileSync(
  clang,
  [
    '--target=' + ARM64.target,
    // build.js's compileFlags(), with the variant's version.
    '-std=c11',
    '-fvisibility=hidden',
    '-O2',
    '-ffp-contract=off',
    '-I',
    native.INCLUDE_DIR,
    '-DSHERLO_CORE_VERSION="' + VARIANT_VERSION + '"',
    // build.js's Android link.
    '-fPIC',
    '-shared',
    '-s',
    '-Wl,-z,max-page-size=' + native.ANDROID_PAGE_SIZE,
    '-Wl,--no-undefined',
    ...native.CORE_SOURCES,
    native.JNI_SOURCE,
    '-ljnigraphics',
    '-lm',
    '-o',
    path.join(OUT, 'libsherlocore-variant.so'),
  ],
  { stdio: 'inherit' }
);
console.log('original ' + native.coreVersion() + ', variant ' + VARIANT_VERSION);
