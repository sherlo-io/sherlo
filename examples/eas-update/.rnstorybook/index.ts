/**
 * Sherlo-modified Storybook component
 *
 * Sherlo needs to control Storybook to switch between stories
 * This is done using getStorybook() wrapper instead of the standard view.getStorybookUI()
 *
 * Learn more: https://sherlo.io/docs/setup#storybook-component
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStorybook } from '@sherlo/react-native-storybook';
import { view } from './storybook.requires';

const StorybookUIRoot = getStorybook(view, {
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  },
});

export default StorybookUIRoot;
