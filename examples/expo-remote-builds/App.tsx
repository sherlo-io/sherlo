import { isRunningStorybook } from '@sherlo/react-native-storybook';
import Storybook from './.storybook';
import { HomeScreen } from '@sherlo/testing-components';

export default function App() {
  //
  if (process.env.EXPO_PUBLIC_STORYBOOK_ONLY || isRunningStorybook) {
    return <Storybook />;
  }

  return <HomeScreen />;
}
