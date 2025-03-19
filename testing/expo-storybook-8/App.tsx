import { isStorybookMode, addStorybookToDevMenu } from '@sherlo/react-native-storybook';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import Storybook from './.storybook';
import HomeScreen from './src/HomeScreen';

addStorybookToDevMenu();

function App() {
  if (isStorybookMode) {
    return (
      <Wrapper>
        <Storybook />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <HomeScreen />
    </Wrapper>
  );
}

export default App;

/* ========================================================================== */

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StatusBar translucent style={Platform.OS === 'android' ? 'dark' : 'auto'} />

      {children}
    </>
  );
}
