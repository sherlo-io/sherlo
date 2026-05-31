# Sherlo Storybook integration: Visual testing for React Native

The `@sherlo/react-native-storybook` SDK integrates [visual regression testing for React Native](https://sherlo.io) into your app via Storybook - capture stories on iOS and Android simulators in the cloud, catch UI regressions before they ship.

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
npx sherlo test
```

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

## Metro Config

Add the following to your `metro.config.js`:

```js
const { getDefaultConfig } = require('@react-native/metro-config');
const withStorybook = require('@sherlo/react-native-storybook/withStorybook');

const defaultConfig = getDefaultConfig(__dirname);

module.exports = withStorybook(defaultConfig, {
  enabled: true,
  configPath: __dirname + '/.rnstorybook',
});
```

`withStorybook` is a drop-in replacement for `@storybook/react-native/metro/withStorybook` - it resolves the real one internally via the peer dependency and applies Sherlo's Metro transforms on top.

---

## Local Development

`testing/expo` and `testing/react-native` reference this package via `file:../../packages/react-native-storybook`. Unlike `portal:`, `file:` snapshots the package at install time, so source edits are not automatically reflected in the testing apps.

After editing SDK source, rebuild and reinstall:

```bash
# Rebuild the SDK
yarn workspace @sherlo/react-native-storybook build

# Reinstall in the affected testing app
cd testing/expo && yarn install
```

The `examples/` apps stay on the published `@sherlo/react-native-storybook` version - they exist to mirror real-world consumer usage and should not be wired to the local source.

---

## Changelog

### v2.0.0-alpha.1

- **Simplified API** - `createSherloStorybook` factory removed. Use `withStorybook` from `@sherlo/react-native-storybook/withStorybook` instead. Single import, no factory, no destructuring.
  ```js
  const withStorybook = require('@sherlo/react-native-storybook/withStorybook');
  module.exports = withStorybook(defaultConfig, { enabled: true, configPath: ... });
  ```
- **No separate `@storybook/react-native` import needed** - sherlo's `withStorybook` resolves the real storybook function internally via peer dep.

### v2.0.0-alpha.0 - Breaking changes vs 1.6.x

- **`withSherlo` removed** - replaced by `createSherloStorybook(withStorybook)` factory (now further simplified in v2.0.0-alpha.1).
- **`getStorybook` no longer exported** from the main package entrypoint. It is used internally by the Metro wrapper via a deep import (`@sherlo/react-native-storybook/dist/getStorybook`).
- **`/lite` entrypoint removed** - the main entrypoint no longer imports the Storybook runtime at module level, so the bundle-size concern that motivated `/lite` no longer applies.
- **`sherloAtRoot` diagnostic mode** - pass `--diagnostics sherloAtRoot` to the CLI (requires `SHERLO_DEVTOOLS=1`) to have Sherlo substitute the AppRegistry root with the Storybook entry component loaded directly from `configPath/index`. Requires `configPath/index` to default-export the Storybook UI component.
