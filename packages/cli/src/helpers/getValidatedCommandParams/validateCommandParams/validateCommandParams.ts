import {
  Command,
  CommandParams,
  InvalidatedCommandParams,
  InvalidatedConfig,
} from '../../../types';
import { validatePlatformPaths } from '../../shared';
import getPlatformsToTest from '../../getPlatformsToTest';
import validateConfigProperties from './validateConfigProperties';
import validateDevices from './validateDevices';
import validateToken from './validateToken';

function validateCommandParams<C extends Command>(
  command: C,
  commandParams: InvalidatedCommandParams<C>,
  config: InvalidatedConfig,
  { requirePlatformPaths }: { requirePlatformPaths: boolean }
): asserts commandParams is CommandParams<C> {
  validateToken(commandParams);

  validateDevices(commandParams);

  if (requirePlatformPaths) {
    const platformsToValidate = getPlatformsToTest(
      /* At this point we know that devices are validated */
      commandParams.devices as CommandParams<C>['devices']
    );

    validatePlatformPaths({
      platformsToValidate,
      android: commandParams.android,
      ios: commandParams.ios,
      command,
    });
  }

  validateConfigProperties(config);
}

export default validateCommandParams;
