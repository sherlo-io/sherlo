import { DEFAULT_CONFIG_PATH, DEFAULT_PROJECT_ROOT } from '../../constants';
import { Options, Command } from '../../types';

function getOptionsWithDefaults<C extends Command>(
  options: Options<C>
): Options<C, 'withDefaults'> {
  return {
    ...options,
    config: options.config || DEFAULT_CONFIG_PATH,
    projectRoot: options.projectRoot || DEFAULT_PROJECT_ROOT,
  };
}

export default getOptionsWithDefaults;
