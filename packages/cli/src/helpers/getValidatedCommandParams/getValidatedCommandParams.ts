import { Command, CommandParams, Options } from '../../types';
import getCommandParams from './getCommandParams';
import getNormalizedConfig from './getNormalizedConfig';
import getNormalizedOptions from './getNormalizedOptions';
import getOptionsWithDefaults from './getOptionsWithDefaults';
import validateCommandParams from './validateCommandParams';
import resolvePushCredential from './validateCommandParams/resolvePushCredential';
import validateRequiredOptions from './validateRequiredOptions';

function getValidatedCommandParams<C extends Command>(
  { command, passedOptions }: { command: C; passedOptions: Options<C> },
  { requirePlatformPaths }: { requirePlatformPaths: boolean }
): CommandParams<C> {
  validateRequiredOptions({ command, passedOptions });

  const options = getNormalizedOptions(getOptionsWithDefaults(passedOptions));

  const config = getNormalizedConfig(options);

  // Before the devices: the credential and the project it pushes into (sherlo / Before a push).
  // It reads the flags and the config apart, because SHERLO_TOKEN sits between the two.
  const credential = resolvePushCredential(command, options, config);

  const commandParams = { ...getCommandParams(options, config), credential };

  validateCommandParams(command, commandParams, config, { requirePlatformPaths });

  return commandParams;
}

export default getValidatedCommandParams;
