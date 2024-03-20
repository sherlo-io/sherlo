import { appendFile } from '../../nativeModule';
import getGlobalStates from '../../utils/getGlobalStates';
import { LogFn } from '../types';

/**
 * Creates a log function that logs messages to the console and appends them to a file.
 * @param path - The path of the file to append log messages to.
 * @returns A log function that takes a key and optional parameters, logs them to the console, and appends them to the specified file.
 */
const log =
  (path: string, logToConsole: boolean): LogFn =>
  (key, parameters): void => {
    const time = new Date().toTimeString().split(' ')[0];

    const logMsg = `${time}: ${key}${parameters ? ` : ${JSON.stringify(parameters)}` : ''}\n`;

    if (logToConsole) {
      console.log(`${logMsg}\n`);
    }

    if (!getGlobalStates().isIntegrationTest) {
      appendFile(path, logMsg);
    }
  };

export default log;
