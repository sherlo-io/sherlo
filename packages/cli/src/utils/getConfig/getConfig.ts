import { Config } from '../../types';
import getErrorMessage from '../getErrorMessage';
import parse from './parse';
import validate from './validate';

async function getConfig(
  path: string,
  parameters?: {
    config?: string;
    android?: string;
    ios?: string;
  }
): Promise<Config> {
  const config = await parse(parameters?.config || path);

  // if parameters are passed via github actions, override the config
  if (parameters?.android && config.android) {
    config.android.path = parameters.android;
  }

  if (parameters?.ios && config.ios) {
    config.ios.path = parameters.ios;
  }

  if (validate(config)) {
    return config;
  }

  throw new Error(getErrorMessage({ type: 'unexpected', message: 'getConfig error' }));
}

export default getConfig;
