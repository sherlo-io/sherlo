export const VERIFICATION_TEST_ID = 'sherlo-getStorybook-verification';
export const DUMMY_STORY_ID = 'SherloInitialTestingDummyStory--SherloDummyStory';

// Protocol files used by the SDK runtime to talk to the runner.
// IMPORTANT: metro/polyfill.js cannot import from compiled dist/ - it duplicates
// these literals at the top of polyfill.js. Keep in sync.
export const LOG_FILE = 'log.sherlo';
export const PROTOCOL_FILE = 'protocol.sherlo';

/**
 * The shim's native library name and registration symbol, frozen into every
 * customer binary - see ios/SherloImplV1.h, android/CMakeLists.txt and
 * android/src/main/cpp/sherlo-shim-jni.cpp. Exported so the runner's splice
 * gate can assert the shim is actually IN the base artifact (PoC FINDINGS.md:
 * "assert the built artifact CONTAINS the shim, never that the build exited
 * zero") without hardcoding a second copy of these names. See README.md
 * "The shim, verified in the artifact".
 */
export const ANDROID_SHIM_LIBRARY_NAME = 'sherloshim'; // produces libsherloshim.so
export const IOS_SHIM_REGISTRATION_SYMBOL = 'SherloShimRegisterImplV1';

/**
 * The global seam.js sets to announce its own version, and the pattern that
 * finds it in a BUILT BUNDLE without executing it - see seam.js's
 * `globalThis.__SHERLO_SEAM_VERSION__ = '1';`. Exported for the same reason
 * as the shim constants above: the runner's splice gate greps a bundle for
 * this literal and must never carry a second, hand-copied copy of the
 * pattern that could drift out of sync with what seam.js actually emits.
 */
export const SEAM_VERSION_GLOBAL_NAME = '__SHERLO_SEAM_VERSION__';
export const SEAM_VERSION_GATE_REGEX = /__SHERLO_SEAM_VERSION__\s*=\s*["'](\d+)["']/;
