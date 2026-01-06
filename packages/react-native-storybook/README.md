# @sherlo/react-native-storybook

Main package for [Sherlo](https://github.com/sherlo-io/sherlo) - Visual Testing for React Native Storybook.

> **📚 For full documentation, visit [sherlo.io/docs](https://sherlo.io/docs)**

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

---

## API Reference

All exports from `@sherlo/react-native-storybook`:

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

Boolean that indicates if the app should display Storybook.

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

Boolean that indicates if Sherlo visual tests are currently running.

**Type:** `boolean`

**Example:**

```tsx
import { isRunningVisualTests } from '@sherlo/react-native-storybook';

if (isRunningVisualTests) {
  // Disable animations, mock data, etc.
}
```
