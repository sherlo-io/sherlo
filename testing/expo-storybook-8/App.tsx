import { isStorybookMode, addStorybookToDevMenu } from '@sherlo/react-native-storybook';
import Storybook from './.storybook';
import HomeScreen from './src/HomeScreen';

addStorybookToDevMenu();

// @ts-ignore
global.SHERLO_TEST_STORY_ID = 'testing-components-nosafearea--basic';

export default function App() {
  if (isStorybookMode) {
    return <Storybook />;
  }

  return <HomeScreen />;
}
