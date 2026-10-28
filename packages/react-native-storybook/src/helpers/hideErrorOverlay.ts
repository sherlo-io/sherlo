import { LogBox } from 'react-native';

/**
 * Hides React Native's LogBox overlay so an app's console errors never cover the screen a test
 * taps and captures. Only the overlay is hidden: the errors still reach the console and the device
 * log. Testing mode (getStorybook/components/TestingMode/setupErrorSilencing) and a scene launch
 * (sceneBoot) both call it.
 */
function hideErrorOverlay(): void {
  LogBox.ignoreAllLogs(true);
}

export default hideErrorOverlay;
