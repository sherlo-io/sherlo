import { shouldShowStorybook } from '@sherlo/react-native-storybook';
import Storybook from './.storybook';
import { PropsWithChildren } from 'react';
import HomeScreen from './src/HomeScreen';
import Constants from 'expo-constants';

global.SHERLO_TEST_CONFIG = {};

/**
 * You should specify common UI providers that will be relevant for
 * components in Storybook mode but also in App mode of your build
 *
 * For example:
 *
 * <SafeAreaProvider>
 *   <StatusBar />
 *   <ThemeProvider>
 *     <GestureHandlerRootView>
 *       {children}
 *     </GestureHandlerRootView>
 *   </ThemeProvider>
 * </SafeAreaProvider>
 */
const CommonProviders = ({ children }: PropsWithChildren) => children;

export default function App() {
  /**
   * shouldShowStorybook determines whether to show Storybook.
   *
   * Returns true if any of the following conditions are met:
   * 1. It's a Storybook-specific build (Constants.expoConfig?.extra?.storybookEnabled)
   * 2. User selected "Toggle Storybook" in Dev Menu
   * 3. User called "openStorybook" function imported from "@sherlo/react-native-storybook"
   * 4. Build is running tests on Sherlo
   *
   * Note: If called without parameters, like "shouldShowStorybook()",
   * only conditions 2, 3 and 4 apply.
   */
  if (shouldShowStorybook(Constants.expoConfig?.extra?.storybookEnabled)) {
    return (
      <CommonProviders>
        <Storybook />
      </CommonProviders>
    );
  }

  return (
    <CommonProviders>
      {/**
       * Here you would provide your root navigator
       * wrapped in state specific providers
       */}
      <HomeScreen />
    </CommonProviders>
  );
}
