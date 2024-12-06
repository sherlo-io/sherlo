import { isStorybookMode, addStorybookToDevMenu } from '@sherlo/react-native-storybook';
import Storybook from './.storybook';
import HomeScreen from './src/HomeScreen';

addStorybookToDevMenu();

export default function App() {
  if (isStorybookMode) {
    return <Storybook />;
  }

  return <HomeScreen />;
}
