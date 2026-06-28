import { LogBox } from 'react-native';
import SherloModule from '../../../SherloModule';

/**
 * Silences RN's default error/warning UI in testing mode so YellowBox/RedBox
 * overlays don't appear in screenshots. Real error capture happens via the
 * metro polyfill's ErrorUtils.setGlobalHandler, not via console.error.
 */
function setupErrorSilencing(): void {
  if (SherloModule.getMode() !== 'testing') return;

  LogBox.ignoreAllLogs(true); // hide LogBox UI overlay
  console.warn = () => null; // hide YellowBox-style warnings
  console.error = () => null; // hide RedBox-style errors
  // @ts-ignore
  console.reportErrorsAsExceptions = false; // iOS: don't promote console.error to native exception
}

export default setupErrorSilencing;
