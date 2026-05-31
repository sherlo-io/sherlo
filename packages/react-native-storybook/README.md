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