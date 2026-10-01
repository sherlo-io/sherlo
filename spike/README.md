# Spike: swap-the-core (epic sealed-core)

Throwaway experiment. Never merged.

Question: can the SDK ship a sealed JS core (one minified, scrambled file run by the SDK's native
loader, outside the app's own bundle) that the app uses by default, and can a newer core signed by
Sherlo, dropped into the app's storage folder next to config.sherlo, replace it on an iOS simulator
and an Android emulator with no rebuild, while an unsigned one is refused?

## What it proved (2026-10-01)

App: `examples/standard` (Expo 54, React Native 0.81.5, new architecture, Hermes), Release builds.

| Check | iOS simulator (iPhone 17) | Android emulator (Pixel 9, API 36) |
| --- | --- | --- |
| B. No override: shipped core runs | 2.0.2, native 0.46 ms, eval 2 ms | 2.0.2, native 1.64 ms, eval 2 ms |
| C. Signed 2.0.3 dropped, app relaunched, no reinstall | 2.0.3 (with fix) runs | 2.0.3 (with fix) runs |
| D. Forged signature dropped | refused, 2.0.2 runs | refused, 2.0.2 runs |
| A. Development (Metro, debug build) | shipped 2.0.2 runs, native 0.39 ms, eval 2 ms | not run (same native read) |

| E. Compiled C native core, shipped prebuilt and stripped, called from the glue | 3 px differ (right), only the 3 public names visible | 3 px differ (right), only the 3 JNI entry points visible |

Screenshots: `evidence/`.

The native core (`native-core/`): `include/sherlo_core.h` is the one C header (version, ABI number,
a pixel-difference count standing in for the stillness comparison). `src/sherlo_core.c` is the
readable source, `src/sherlo_core_jni.c` its JNI face on Android. iOS: compiled with
`xcrun clang -fvisibility=hidden`, stripped (`strip -S -x`), packed into
`sdk/package/ios/SherloCore.xcframework` (both slices must be named `libsherlocore.a`, or CocoaPods
refuses the xcframework) and listed as `vendored_frameworks` in the podspec. Android: one
`libsherlocore.so` per ABI from the NDK's clang (`-fvisibility=hidden -s`, 16 KB page alignment),
in `sdk/package/android/src/main/jniLibs/<abi>/`, loaded with `System.loadLibrary`. Neither
needs any change to the customer's build files. Each shows the banner the example app draws from the loader's summary.

## Layout

- `core/src/core.js` - the core's readable source (in the real build this lives in a private repo).
- `core/build-core.js` - minifies (terser) + scrambles (javascript-obfuscator) the source into
  `sherlo-core.js`, prepends the header line the native loader reads
  (`// sherlo-core {"version":..,"seam":..}`), and signs it (RSA-SHA256). The throwaway test
  keypair was deleted before this branch was pushed; the public half is still in the two loaders.
- `core/check-core.js` - runs a sealed core in a bare JS context to check it before a device build.
- `drops/` - the signed fix and the forged core the checks dropped in.
- `runner-drop.js` - what the runner would do on iOS: write the core into `Documents/sherlo/` of the
  installed app's data container. Android used `adb root` + `adb push` + `chown`, as the runner's
  sendConfig already does.
- `sdk/package/` - the published `@sherlo/react-native-storybook@2.0.2` with the loader added:
  `ios/SherloCoreLoader.{h,m}`, `android/.../SherloCoreLoader.java`, a `loadCore` sync method on
  both architectures and both platforms, `loadCore` in the codegen spec, `Security` in the podspec,
  and the shipped core in `ios/Resources/assets/` and `android/src/main/assets/`.
- `sdk/package-dist-changes/` - the three changed compiled JS files (the repo ignores `dist/`).
- `evidence/` - screenshots.

Also changed for the run: `examples/standard` (installs the spike SDK from `sherlo-lib/`, draws the
banner, Metro crawls without watchman because brain's watchman config ignores `.worktrees`).
`testing/react-native` holds an abandoned first attempt: that app does not pod-install as committed
(its lockfile pins react-native-reanimated 3.19.5, which needs React Native 0.78; the app is 0.77.2).
