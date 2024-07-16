import { LogBox } from 'react-native';

// TODO validate if every line here is valueable and necessary
function setupErrorSilencing(): void {
  LogBox.ignoreLogs(['Warning: ...']);
  LogBox.ignoreAllLogs(true);
  console.warn = () => null;
  console.error = () => null;
  // @ts-ignore
  console.reportErrorsAsExceptions = false;
}

export default setupErrorSilencing;
