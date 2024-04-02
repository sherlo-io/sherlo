import sherloModule from '../../sherloModule';
import { LogFn } from '../types';

const { appendFile } = sherloModule;

/**
 * Creates a log function that logs messages to the console and appends them to a file.
 * @param path - The path of the file to append log messages to.
 * @returns A log function that takes a key and optional parameters, logs them to the console, and appends them to the specified file.
 */
const log =
  (path: string): LogFn =>
  (key, parameters): void => {
    const time = new Date().toTimeString().split(' ')[0];

    const logMsg = `${time}: ${key}${parameters ? ` : ${JSON.stringify(parameters)}` : ''}\n`;

    console.log(`${logMsg}\n`);
    appendFile(path, logMsg);
  };

export default log;
