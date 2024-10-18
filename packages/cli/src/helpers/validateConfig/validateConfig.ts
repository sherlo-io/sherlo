import { InvalidatedConfig, Config } from '../../types';
import validateConfigDevices from './validateConfigDevices';
import validateConfigPlatforms from './validateConfigPlatforms';
import validateConfigProperties from './validateConfigProperties';
import validateConfigToken from './validateConfigToken';

function validateConfig(
  config: InvalidatedConfig,
  { validateBuildPaths }: { validateBuildPaths: boolean }
): asserts config is Config {
  validateConfigProperties(config);

  validateConfigToken(config);

  if (validateBuildPaths) {
    validateConfigPlatforms(config, 'withBuildPaths');
  }

  validateConfigDevices(config);
}

export default validateConfig;
