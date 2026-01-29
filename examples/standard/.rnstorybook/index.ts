// ⚠️ Modified for Sherlo - see https://sherlo.io/docs/setup#storybook-component

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStorybook } from '@sherlo/react-native-storybook';
import { view } from './storybook.requires';

// Use getStorybook() instead of view.getStorybookUI()
const StorybookUIRoot = getStorybook(view, {
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  },
});

export default StorybookUIRoot;
