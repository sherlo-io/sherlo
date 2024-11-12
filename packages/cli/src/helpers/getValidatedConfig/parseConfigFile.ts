import fs from 'fs';
import { DOCS_LINK } from '../../constants';
import { InvalidatedConfig } from '../../types';
import throwConfigError from '../throwConfigError';

function parseConfigFile(path: string): InvalidatedConfig {
  try {
    const config = JSON.parse(fs.readFileSync(path, 'utf8'));

    /**
     * Both `include` and `exclude` can be defined as a string or an array of
     * strings in the config. However, the output should always be an array.
     */
    const { exclude, include } = config;
    if (include && !Array.isArray(include)) config.include = [include];
    if (exclude && !Array.isArray(exclude)) config.exclude = [exclude];

    return config;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    switch (nodeError.code) {
      case 'ENOENT':
        throwConfigError(
          `config file "${path}" not found - verify the path or use the \`--projectRoot\` flag`,
          // TODO: czy ten link nadal bedzie mial sens?
          DOCS_LINK.sherloScriptFlags
        );

      case 'EACCES':
        throwConfigError(`config file "${path}" cannot be accessed`);

      case 'EISDIR':
        throwConfigError(`"${path}" is a directory, not a config file`);

      default:
        if (error instanceof SyntaxError) {
          throwConfigError(`config file "${path}" is not valid JSON`);
        } else {
          throwConfigError(error.message);
        }
    }
  }
}

export default parseConfigFile;
