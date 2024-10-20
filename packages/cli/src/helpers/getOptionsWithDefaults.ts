import { DEFAULT_CONFIG_PATH, DEFAULT_PROJECT_ROOT } from '../constants';

function getOptionsWithDefaults<
  T extends Record<string, unknown> & { config?: string; projectRoot?: string }
>(options: T): T & { config: string; projectRoot: string } {
  return {
    ...options,
    config: options.config || DEFAULT_CONFIG_PATH,
    projectRoot: options.projectRoot || DEFAULT_PROJECT_ROOT,
  };
}

export default getOptionsWithDefaults;
