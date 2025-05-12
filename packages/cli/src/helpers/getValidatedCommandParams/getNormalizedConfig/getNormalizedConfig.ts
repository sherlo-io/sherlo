import path from 'path';
import { InvalidatedConfig, Options } from '../../../types';
import getConfigWithNormalizedDevices from './getConfigWithNormalizedDevices';
import parseConfigFile from './parseConfigFile';

function getNormalizedConfig(
  options: Options<'any', 'withDefaults', 'normalized'>
): InvalidatedConfig {
  const configPath = path.resolve(options.projectRoot, options.config);

  const parsedConfig = parseConfigFile(configPath);

  const config = getConfigWithNormalizedDevices(parsedConfig);

  return config;
}

export default getNormalizedConfig;
