import { Config } from '../../types';
import getErrorMessage from '../getErrorMessage';
import parse from './parse';
import validate from './validate';

export interface GetConfigParameters {
  config: string;
  token?: string;
  android?: string;
  iosPath?: string;
}

async function getConfig(parameters: GetConfigParameters): Promise<Config> {
  const config = await parse(parameters.config);

  if (parameters?.android && config.android) {
    config.android.path = parameters.android;
  }

  if (parameters?.iosPath && config.ios) {
    config.ios.path = parameters.iosPath;
  }

  if (parameters?.token) {
    config.token = parameters.token;
  }

  if (validate(config)) {
    return config;
  }

  throw new Error(getErrorMessage({ type: 'unexpected', message: 'getConfig error' }));
}

export default getConfig;
