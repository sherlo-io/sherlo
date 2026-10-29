import {
  Command,
  CommandParams,
  InvalidatedCommandParams,
  InvalidatedConfig,
} from '../../../types';
import validateConfigProperties from './validateConfigProperties';
import validateDevices, { DevicesSource } from './validateDevices';

/**
 * The checks after the credential: the config's properties and the devices. The credential comes
 * first, and is resolved apart (./resolvePushCredential), because it is a value the push spends
 * rather than a property it checks. The config's properties come before the devices, because a
 * Sherlo 2 binary path in the config is refused before anything else is.
 */
function validateCommandParams<C extends Command>(
  commandParams: InvalidatedCommandParams<C>,
  config: InvalidatedConfig,
  devicesFrom: DevicesSource
): asserts commandParams is CommandParams<C> {
  validateConfigProperties(config);

  validateDevices(commandParams, devicesFrom);
}

export default validateCommandParams;
