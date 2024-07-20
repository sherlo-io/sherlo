import SherloModule from '../../SherloModule';
import { LogFn } from '../types';

/**
 * Creates a log function that logs messages to the console and appends them to a file.
 * @param path - The path of the file to append log messages to.
 * @returns A log function that takes a key and optional parameters, logs them to the console, and appends them to the specified file.
 */
function log(path: string): LogFn {
  return function (key, parameters): void {
    const time = new Date().toTimeString().split(' ')[0];

    const logMsg = `${time}: ${key}${parameters ? ` : ${JSON.stringify(parameters)}` : ''}\n`;

    if (!__DEV__) console.log(`${logMsg}\n`);

    SherloModule.appendFile(path, logMsg);
  };
}

export default log;
