import { InvalidatedConfig, Config } from '../../../types';
import validateConfigDevices from './validateConfigDevices';
import validateConfigPlatforms from './validateConfigPlatforms';
import validateConfigProperties from './validateConfigProperties';
import validateConfigToken from './validateConfigToken';

function validateConfig(
  config: InvalidatedConfig,
  { validatePlatformPaths }: { validatePlatformPaths: boolean }
): asserts config is Config {
  validateConfigProperties(config);

  validateConfigToken(config);

  validateConfigDevices(config);

  if (validatePlatformPaths) {
    validateConfigPlatforms(config);
  }
}

export default validateConfig;
