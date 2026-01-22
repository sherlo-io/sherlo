import { addStorybookToDevMenu, isStorybookMode } from '@sherlo/react-native-storybook';
import { View } from 'react-native';
import Storybook from './.rnstorybook';

addStorybookToDevMenu();

export default function Root() {
  if (isStorybookMode) {
    return <Storybook />;
  }

  return (
    <App />
  );
}

function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Hello World</Text>
    </View>
  );
}
