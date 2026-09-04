# Sherlo - visual regression testing for React Native (Storybook SDK)

Sherlo is a [visual regression testing tool for React Native](https://sherlo.io). The `@sherlo/react-native-storybook` SDK integrates it into your app via Storybook - capture stories on iOS and Android simulators in the cloud, catch visual regressions before they ship.

> **📚 For full documentation, visit [sherlo.io/docs](https://sherlo.io/docs)**

<br />

## Architecture: this is the public half

This package is deliberately small. It ships in every customer's binary and is frozen the
moment they build - so it carries only what has to be public: anything that runs **before**
the splice (a native module registered pre-main, a Metro polyfill concatenated as source
text) or is **named by a literal** a customer's build already generated (a require
specifier baked into an emitted shim or a generated wrapper). Everything else - story
enumeration for a real test run, the capture loop, the runner protocol, every native method
body beyond a pre-main config read and the developer-path mode switch - is private, and
lives in a separate runner package that attaches to this one at runner launch, replaceable
without a customer ever rebuilding.

Four things you're touching if you're reading this repo, not sherlo.io's docs:

- **The native shim** (`ios/`, `android/`) - a six-method TurboModule. Two methods answer
  locally (`getSherloConstants`, and `setMode` behind `invokeSync` - the developer path,
  e.g. `openStorybook()`, with nothing injected); everything else forwards through the frozen
  ABI in `ios/SherloImplV1.h` to whatever registers at runner launch. See "The native shim"
  below.
- **The seam** (`src/seam.js`, exported as `./seam`) - the one global
  (`globalThis.__SHERLO_HOST__`) that passes everything a spliced runtime needs BY VALUE:
  the wrapped native module, host module instances (React, optional peers), the mocking
  registry, and a hand-off point (`takenOverBy`) for the runtime to take the screen.
- **The Metro plugin** (`metro/`) - resolver redirects, mock shim emission, and the
  generated entry (`metro/entry.js`) that puts the seam in front of the customer's own code,
  since nothing else guarantees it runs.
- **`getStorybook`** (`src/getStorybook/`) - the public half only: view/params capture,
  the position-bound story-error boundary (the only place a story's throw is observable),
  splash hiding, and a `SafeAreaProvider` shell around whatever the runtime hands back.

## Quick Start

### 1. Initialize Sherlo

```bash
npx sherlo init
```

This will automatically install `@sherlo/react-native-storybook` and configure your project.

### 2. Run visual tests

```bash
npx sherlo test --android <path> --ios <path>
```

That first run registers your builds as the base. After it, plain `npx sherlo
test` tests JS-only changes with no native rebuild - and tells you when a fresh
native build is needed.

<br />

## API Reference

### `isStorybookMode`

Checks if the app should render Storybook instead of the normal UI. Use this in your root component to conditionally render Storybook.

**Type:** `boolean`

**Example:**

```tsx
import { isStorybookMode } from '@sherlo/react-native-storybook';
import Storybook from './.rnstorybook';
import App from './App';

export default function Root() {
  if (isStorybookMode) {
    return <Storybook />;
  }

  return <App />;
}
```

[Documentation →](https://sherlo.io/docs/setup?storybook=integrated#storybook-access)

---

### `openStorybook()`

Programmatically open Storybook. Works together with `isStorybookMode` to switch between your app and Storybook.

**Example:**

```tsx
import { openStorybook } from '@sherlo/react-native-storybook';
import { Button } from 'react-native';

<Button onPress={openStorybook} title="Open Storybook" />;
```

---

## Mocking

`@sherlo/react-native-storybook` can mock any module a story imports, scoped to that story. Declare mocks under `parameters.sherlo.mocks`; each key is a module specifier (an npm package, a scoped package, a subpath, or a project-root-relative app path), and each value is a factory that receives the real module and returns the exports to replace.

> Mocking is experimental and **off** by default, so a normal App Store / Play Store build ships zero mocking code. Opt in per build profile by passing `experimentalMocks: true` to `withStorybook` in your Metro config. Leave it **off** (or unset) for your production build profile.

```js
// metro.config.js
module.exports = withStorybook(config, { experimentalMocks: true });
```

```ts
const meta = {
  title: 'Mocking/Factories',
  parameters: {
    sherlo: {
      mocks: {
        './src/mocking/modules/factories/spread': (original) => ({
          ...original,
          color: 'mock-color',
        }),
      },
    },
  },
};
```

Mocks can also be declared in a story's meta (applies to every story in the file) or globally in `.rnstorybook/preview.ts` (applies everywhere); the most specific level wins per module key. A mock only applies while its story is active in a Sherlo test run or interactive Storybook; every other screen gets the real module.

A couple of things to know before you start: mocking `react`, `react-native`, `@storybook/*`, or `@sherlo/*` directly is not allowed (wrap them instead), and mocking a module for the first time needs a Metro restart before it takes effect.

See the full [Module Mocking guide](https://sherlo.io/docs/stories/mocking) for factory patterns, precedence rules, module key edge cases, and known limitations.

---

## The native shim

This package ships a codegen'd TurboModule (`SherloModule`) whose six methods forward through a
frozen ABI to an implementation registered at runner launch, except `setMode` (the developer-path
mode switch, e.g. `openStorybook()`), which is the shim's own builtin. `getSherloConstants` prefers
a registered implementation's own synchronous answer and falls back to the shim's pre-main config
read only when nothing is injected - same as `setMode`'s fallback. See `ios/SherloImplV1.h` for the
full contract.

Three names from that boundary are frozen and exported from `@sherlo/react-native-storybook/constants`
(`ANDROID_SHIM_LIBRARY_NAME`, `IOS_SHIM_REGISTRATION_SYMBOL`, `SEAM_VERSION_GLOBAL_NAME` /
`SEAM_VERSION_GATE_REGEX`) so nothing outside this package has to hardcode a second copy of them:

- **Android** - the shim's JNI library name is `sherloshim`, i.e. `libsherloshim.so` in the built
  APK (see `android/CMakeLists.txt`). The JNI shim resolves the injected implementation by calling
  `dlsym(RTLD_DEFAULT, "SherloGetImplV1")` and lends it host services via `SherloSetHostV1` (see
  `android/src/main/cpp/sherlo-shim-jni.cpp`).
- **iOS** - the injected implementation registers by calling the exported C symbol
  `SherloShimRegisterImplV1` (see `ios/SherloImplV1.h`), found via `dlsym(RTLD_DEFAULT, ...)`
  because the shim is statically linked into the main executable.
- **The seam** (`src/seam.js`) sets `globalThis.__SHERLO_SEAM_VERSION__ = '1'` as a string literal.
  `SEAM_VERSION_GATE_REGEX` is the pattern that finds and extracts it from a *built bundle*, without
  executing it.

A runner verifies the shim is actually *in* the base artifact by checking for these - `unzip -l
app-release.apk | grep libsherloshim.so` on Android, `nm` / `dlsym`-style symbol presence on iOS -
rather than only checking that the build exited zero. An omitted native module is silent on iOS
(no podspec means no pod, no error, and the app simply throws at runtime when JS reaches for it)
and loud but easy to miss on Android (a manifest-merger or link error naming a file nobody
recognises), so asserting on the artifact is the check that catches both failure shapes.

---

## Local Development

The `testing/expo` and `testing/react-native` apps reference `@sherlo/react-native-storybook` via a **committed** pre-packed tarball at `./sherlo-lib/react-native-storybook.tgz`.

**Why a committed tarball instead of a directory `file:` reference?**  
Yarn hashes the packed output of a directory reference at install time. TypeScript build output is not byte-identical across environments (Mac vs Linux vs EAS sandbox), so the hash recorded in the lockfile on one machine differs from the hash computed on another. EAS's `--immutable` flag (hardcoded by `eas-cli-local-build-plugin`, not overridable via `.yarnrc.yml`) then rejects the mismatch. A committed `.tgz` is hashed once - based on its file bytes, not a fresh re-pack - and travels unchanged from the git checkout into every environment, so `--immutable` always passes.

**Tradeoff:** The committed tarball is frozen at the last pack time. If you change SDK source code you must re-pack, regenerate the lockfiles, and commit the updated tarball + lockfiles. CI does **not** rebuild the tarball - the checked-out tarball is the single source of truth.

### Rebuilding the tarball after SDK changes

Run from the repo root (`sherlo/`):

```bash
# 1. Build the SDK
yarn build  # or: cd packages/react-native-storybook && yarn build

# 2. Pack it into both testing apps (overwrites the committed tarballs)
mkdir -p testing/expo/sherlo-lib testing/react-native/sherlo-lib
(cd packages/react-native-storybook && yarn pack --out ../../testing/expo/sherlo-lib/react-native-storybook.tgz)
cp testing/expo/sherlo-lib/react-native-storybook.tgz testing/react-native/sherlo-lib/react-native-storybook.tgz

# 3. Reinstall testing app deps so the lockfiles record the new tarball checksum
(cd testing/expo && yarn install)
(cd testing/react-native && yarn install)

# 4. Commit the updated tarballs and lockfiles
git add testing/expo/sherlo-lib/react-native-storybook.tgz \
        testing/react-native/sherlo-lib/react-native-storybook.tgz \
        testing/expo/yarn.lock \
        testing/react-native/yarn.lock
git commit -m "chore: update react-native-storybook tarball and lockfiles"
```

Or run the full reset script (`yarn reset`) which performs steps 1–3 automatically.

---

### `isRunningVisualTests`

Boolean that indicates if Sherlo visual tests are currently running. Use this to disable animations, mock network data, or apply other deterministic behavior that helps produce consistent screenshots.

**Type:** `boolean`

**Example:**

```tsx
import { isRunningVisualTests } from '@sherlo/react-native-storybook';

if (isRunningVisualTests) {
  // Disable animations, mock data, etc.
}
```

<br />