# `@sherlo/react-native-storybook`

Main package for [Sherlo](https://github.com/sherlo-io/sherlo) - Visual Testing for React Native Storybook.

> **📚 For full documentation, visit [sherlo.io/docs](https://sherlo.io/docs)**

<br />

## Quick Start

### 1. Initialize Sherlo

```bash
npx sherlo@latest init
```

This will automatically install `@sherlo/react-native-storybook` and configure your project.

### 2. Run visual tests

```bash
npx sherlo test
```

<br />

## API Reference

### `getStorybook(view, options)`

Main function to wrap your Storybook component and enable Sherlo visual testing.

**Parameters:**

- `view` - Storybook view object (from `storybook.requires`)
- `options` - Configuration object (storage, etc.)

**Returns:** React component ready for Sherlo visual testing

**Example:**

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStorybook } from '@sherlo/react-native-storybook';
import { view } from './storybook.requires';

const Storybook = getStorybook(view, {
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  },
});

export default Storybook;
```

[Documentation →](https://sherlo.io/docs/setup#storybook-component)

---

### `isStorybookMode`

Boolean that indicates if the app should display Storybook. True when the native SherloModule mode is `'storybook'` (user toggled via Dev Menu or called `openStorybook()`) or `'testing'` (Sherlo is running automated visual tests).

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

### `addStorybookToDevMenu()`

Add a "Toggle Storybook" option to the React Native Dev Menu.

**Example:**

```tsx
import { addStorybookToDevMenu } from '@sherlo/react-native-storybook';

// In your app initialization
addStorybookToDevMenu();
```

---

### `isRunningVisualTests`

Boolean that indicates if Sherlo visual tests are currently running. True only when the native SherloModule mode is `'testing'` - not set when the user opens Storybook manually.

**Type:** `boolean`

**Example:**

```tsx
import { isRunningVisualTests } from '@sherlo/react-native-storybook';

if (isRunningVisualTests) {
  // Disable animations, mock data, etc.
}
```

<br />

## SherloModule Modes

The native SherloModule reports one of three modes that control SDK behavior:

| Mode | Value | Description |
|------|-------|-------------|
| Default | `'default'` | Normal app mode. Storybook is not displayed. This is also the fallback when the native module is not linked. |
| Storybook | `'storybook'` | User activated Storybook via the Dev Menu toggle or by calling `openStorybook()`. |
| Testing | `'testing'` | Sherlo is running automated visual tests on a device/simulator. |

**How modes map to exported flags:**

- `isStorybookMode` = `true` when mode is `'storybook'` or `'testing'`
- `isRunningVisualTests` = `true` when mode is `'testing'` only

<br />

## Bundle Size Optimization

### Lightweight Imports (`/lite`)

If you exclude Storybook from production builds but still use helpers like `isRunningVisualTests`, import from `/lite` to prevent the heavy `getStorybookUI()` function from being bundled in projects without tree-shaking.

```tsx
// ❌ Bundles getStorybookUI() even if Storybook component is excluded
import { isRunningVisualTests } from '@sherlo/react-native-storybook';

// ✅ Bundles only lightweight helpers
import { isRunningVisualTests } from '@sherlo/react-native-storybook/lite';
```

**Available in `/lite`:** `isRunningVisualTests`, `isStorybookMode`, `openStorybook()`, `addStorybookToDevMenu()`
