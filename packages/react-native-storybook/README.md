# Sherlo - visual regression testing for React Native (Storybook SDK)

Sherlo is a [visual regression testing tool for React Native](https://sherlo.io). The `@sherlo/react-native-storybook` SDK integrates it into your app via Storybook - capture stories on iOS and Android simulators in the cloud, catch visual regressions before they ship.

> **📚 For full documentation, visit [sherlo.io/docs](https://sherlo.io/docs)**

<br />

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

`@sherlo/react-native-storybook` can mock any module a story imports, scoped to that story. Mocking is always on; there is no switch to enable it.

Declare mocks under `parameters.sherlo.mocks` with `mock()`. Pass it an import of the module and a definition:

```ts
import { mock } from '@sherlo/react-native-storybook';

const meta = {
  title: 'Profile/Header',
  parameters: {
    sherlo: {
      mocks: [mock(() => import('./whoAmI'), { whoAmI: () => 'Ada Lovelace' })],
    },
  },
};
```

The import names the module, so the definition is checked against that module's types in your editor. Name only the parts you change; every other part stays real. The definition can also be a factory that receives the real module and returns those parts: `(original) => ({ ...original, color: 'mock-color' })`. The import path must be a string literal, as in `import('./whoAmI')`.

The older form, an object keyed by module specifier, is still accepted. It is untyped.

Mocks can also be declared in a story's meta (applies to every story in the file) or globally in `.rnstorybook/preview.ts` (applies everywhere). The most specific level wins per module. A mock applies only while its story is active in a Sherlo test run or interactive Storybook; every other screen gets the real module.

These modules cannot be mocked: `react`, `react-native`, `@storybook/*`, `@sherlo/*`. Mock a wrapper module you own instead.

Scene helpers (`scenes`, `given`, preconditions) are imported from `@sherlo/react-native-storybook/scenes`.

See the full [Module Mocking guide](https://sherlo.io/docs/stories/mocking) for factory patterns, precedence rules, module key edge cases, and known limitations.

---

## Local Development

The `testing/expo` and `testing/react-native` apps reference `@sherlo/react-native-storybook` via a **committed** pre-packed tarball at `./sherlo-lib/react-native-storybook.tgz`.

**Why a committed tarball instead of a directory `file:` reference?**  
Yarn hashes the packed output of a directory reference at install time. TypeScript build output is not byte-identical across environments (Mac vs Linux vs EAS sandbox), so the hash recorded in the lockfile on one machine differs from the hash computed on another. EAS's `--immutable` flag (hardcoded by `eas-cli-local-build-plugin`, not overridable via `.yarnrc.yml`) then rejects the mismatch. A committed `.tgz` is hashed once - based on its file bytes, not a fresh re-pack - and travels unchanged from the git checkout into every environment, so `--immutable` always passes.

**Tradeoff:** The committed tarball is frozen at the last pack time. If you change SDK source code you must re-pack, regenerate the lockfiles, and commit the updated tarball + lockfiles. CI does **not** rebuild the tarball - the checked-out tarball is the single source of truth.

### Rebuilding the tarball after SDK changes

The pack fetches the pinned core from package storage, so it needs `PACKAGE_TOKEN` (in the environment, or in the repo's `.env`). The one command that does every step below is `yarn pack:testing-apps`, run from the repo root (`sherlo/`):

```bash
yarn pack:testing-apps
```

The same steps by hand, also from the repo root, with `PACKAGE_TOKEN` set:

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
