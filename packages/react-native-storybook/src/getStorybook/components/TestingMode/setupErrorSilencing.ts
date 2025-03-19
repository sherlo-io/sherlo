import { LogBox } from 'react-native';
import { SherloModule } from '../../../helpers';

// TODO validate if every line here is valueable and necessary
function setupErrorSilencing(): void {
  const mode = SherloModule.getMode();

  if (mode !== 'testing') return;

  LogBox.ignoreLogs(['Warning: ...']);
  LogBox.ignoreAllLogs(true);
  console.warn = () => null;
  console.error = () => null;
  // @ts-ignore
  console.reportErrorsAsExceptions = false;
}

export default setupErrorSilencing;
