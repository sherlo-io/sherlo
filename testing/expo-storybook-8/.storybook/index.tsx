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
