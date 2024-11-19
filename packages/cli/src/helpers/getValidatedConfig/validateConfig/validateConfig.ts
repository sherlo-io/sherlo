import { InvalidatedConfig, Config } from '../../../types';
import validateConfigDevices from './validateConfigDevices';
import validateConfigPlatforms from './validateConfigPlatforms';
import validateConfigProperties from './validateConfigProperties';
import validateConfigToken from './validateConfigToken';

function validateConfig(
  config: InvalidatedConfig,
  { requirePlatformPaths }: { requirePlatformPaths: boolean }
): asserts config is Config {
  validateConfigToken(config);

  validateConfigDevices(config);

  if (requirePlatformPaths) {
    validateConfigPlatforms(config);
  }

  validateConfigProperties(config);
}

export default validateConfig;
