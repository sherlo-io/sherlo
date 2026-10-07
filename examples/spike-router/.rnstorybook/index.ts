// SPIKE (launch-time-entry): Storybook's new setup - this file registers the root itself.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerRootComponent } from 'expo';
import { view } from './storybook.requires';

const StorybookUIRoot = view.getStorybookUI({
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  },
});

registerRootComponent(StorybookUIRoot);

export default StorybookUIRoot;
