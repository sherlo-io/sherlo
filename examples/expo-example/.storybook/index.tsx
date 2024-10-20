import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStorybook } from '@sherlo/react-native-storybook';
import { view } from './storybook.requires';

const StorybookUIRoot = getStorybook(view, {
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  },
  shouldPersistSelection: true,
  enableWebsockets: true,
  host: 'localhost',
  port: 7007,
});

export default StorybookUIRoot;
