import fs from 'fs';
import { PROJECT_ROOT_OPTION, DOCS_LINK } from '../../../constants';
import { InvalidatedConfig } from '../../../types';
import throwError from '../../throwError';

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
        throwError(getError({ type: 'not_found', path }));
      case 'EACCES':
        throwError(getError({ type: 'no_access', path }));
      case 'EISDIR':
        throwError(getError({ type: 'is_directory', path }));
      default:
        if (error instanceof SyntaxError) {
          throwError(getError({ type: 'invalid_json', path }));
        } else {
          throwError({ type: 'unexpected', error });
        }
    }
  }
}

export default parseConfigFile;

/* ========================================================================== */

function getError({
  type,
  path,
}: {
  type: 'not_found' | 'no_access' | 'is_directory' | 'invalid_json';
  path: string;
}) {
  const messages = {
    not_found:
      `Config file \`${path}\` not found` +
      '\n\n' +
      'Please:' +
      '\n1. Make sure the config file exists in your project root' +
      `\n2. If your project root is different, use the \`--${PROJECT_ROOT_OPTION}\` option\n`,

    no_access: `Config file \`${path}\` cannot be accessed`,

    is_directory: `\`${path}\` is a directory, not a config file`,

    invalid_json: `Config file \`${path}\` is not valid JSON`,
  };

  return {
    message: messages[type],
    learnMoreLink: DOCS_LINK.config,
  };
}
