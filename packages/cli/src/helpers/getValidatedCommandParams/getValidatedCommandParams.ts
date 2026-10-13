import { Command, CommandParams, Options } from '../../types';
import getCommandParams from './getCommandParams';
import getNormalizedConfig from './getNormalizedConfig';
import getNormalizedOptions from './getNormalizedOptions';
import getOptionsWithDefaults from './getOptionsWithDefaults';
import validateCommandParams from './validateCommandParams';
import resolvePushCredential from './validateCommandParams/resolvePushCredential';
import validateRequiredOptions from './validateRequiredOptions';

function getValidatedCommandParams<C extends Command>({
  command,
  passedOptions,
}: {
  command: C;
  passedOptions: Options<C>;
}): CommandParams<C> {
  validateRequiredOptions({ command, passedOptions });

  const options = getNormalizedOptions(getOptionsWithDefaults(passedOptions));

  const config = getNormalizedConfig(options);

  // Before the devices: the credential and the project it pushes into (sherlo / Before a push).
  const credential = resolvePushCredential(command, config, options);

  const commandParams = { ...getCommandParams(options, config), credential };

  validateCommandParams(commandParams, config);

  return commandParams;
}

export default getValidatedCommandParams;
