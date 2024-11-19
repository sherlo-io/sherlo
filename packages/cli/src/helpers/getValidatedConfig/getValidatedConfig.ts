import path from 'path';
import { Config, Options } from '../../types';
import getConfigValues from './getConfigValues';
import parseConfigFile from './parseConfigFile';
import validateConfig from './validateConfig';

function getValidatedConfig(
  options: Options<'any', 'withDefaults'>,
  { requirePlatformPaths }: { requirePlatformPaths: boolean }
): Config {
  const configPath = path.resolve(options.projectRoot, options.config);

  const configFile = parseConfigFile(configPath);

  const config = getConfigValues(configFile, options);

  validateConfig(config, { requirePlatformPaths });

  return config;
}

export default getValidatedConfig;
