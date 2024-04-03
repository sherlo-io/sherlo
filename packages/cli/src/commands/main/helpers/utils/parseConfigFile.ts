import fs from 'fs';
import { InvalidatedConfig } from '../../types';
import { getErrorMessage } from '../../utils';
import getConfigErrorMessage from './getConfigErrorMessage';

/*
 * 1. Both `include` and `exclude` can be defined as a string or an array of
 *    strings in the config. However, the output should always be an array.
 * */
function parseConfigFile(path: string): InvalidatedConfig {
  try {
    const config = JSON.parse(fs.readFileSync(path, 'utf8'));

    if (!config) throw new Error('config is undefined');

    /* 1 */
    // const { exclude, include } = config;
    // if (include && !Array.isArray(include)) config.include = [include];
    // if (exclude && !Array.isArray(exclude)) config.exclude = [exclude];

    return config;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    switch (nodeError.code) {
      case 'ENOENT':
        throw new Error(getConfigErrorMessage(`file "${path}" not found`));
      case 'EACCES':
        throw new Error(getConfigErrorMessage(`file "${path}" cannot be accessed`));
      case 'EISDIR':
        throw new Error(getConfigErrorMessage(`"${path}" is a directory, not a config file`));
      default:
        if (error instanceof SyntaxError) {
          throw new Error(getConfigErrorMessage(`file "${path}" is not valid JSON`));
        } else {
          throw new Error(
            getErrorMessage({
              type: 'unexpected',
              message: `issue reading config file "${path}"`,
            })
          );
        }
    }
  }
}

export default parseConfigFile;
