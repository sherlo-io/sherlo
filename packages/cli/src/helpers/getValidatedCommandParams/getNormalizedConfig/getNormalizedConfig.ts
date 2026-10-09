import { InvalidatedConfig, Options } from '../../../types';
import getConfigWithNormalizedDevices from './getConfigWithNormalizedDevices';
import parseConfigFile from './parseConfigFile';
import resolveConfigPath from './resolveConfigPath';

function getNormalizedConfig(
  options: Options<'any', 'withDefaults', 'normalized'>
): InvalidatedConfig {
  const parsedConfig = parseConfigFile(resolveConfigPath(options));

  const config = getConfigWithNormalizedDevices(parsedConfig);

  return config;
}

export default getNormalizedConfig;
