import path from 'path';
import getErrorMessage from '../getErrorMessage';
import parse from './parse';
import validate from './validate';
import { Arguments } from '../../commands/main/_getArguments';
import { Config, ConfigMode } from '../../types';

async function getConfig<M extends ConfigMode>(parameters: Arguments): Promise<Config<M>> {
  const config = await parse(path.join(parameters.projectRoot, parameters.config));

  const withoutPaths = parameters.mode !== 'sync';

  if (parameters?.android && config.android) {
    config.android.path = path.join(parameters.projectRoot, parameters.android);
  }

  if (parameters?.ios && config.ios) {
    config.ios.path = path.join(parameters.projectRoot, parameters.ios);
  }

  if (parameters?.token) {
    config.token = parameters.token;
  }

  if (withoutPaths) {
    if (config.ios) config.ios.path = undefined;
    if (config.android) config.android.path = undefined;
  }

  if (validate<M>(config, withoutPaths)) {
    return config;
  }

  throw new Error(getErrorMessage({ type: 'unexpected', message: 'getConfig error' }));
}

export default getConfig;
