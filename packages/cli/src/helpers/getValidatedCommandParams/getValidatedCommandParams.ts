import { Command, CommandParams, Options } from '../../types';
import getCommandParams from './getCommandParams';
import getNormalizedConfig from './getNormalizedConfig';
import getOptionsWithDefaults from './getOptionsWithDefaults';
import validateCommandParams from './validateCommandParams';
import validateRequiredOptions from './validateRequiredOptions';

function getValidatedCommandParams<C extends Command>(
  { command, passedOptions }: { command: C; passedOptions: Options<C> },
  { requirePlatformPaths }: { requirePlatformPaths: boolean }
): CommandParams<C> {
  validateRequiredOptions({ command, passedOptions });

  const options = getOptionsWithDefaults(passedOptions);

  const config = getNormalizedConfig(options);

  const commandParams = getCommandParams(options, config);

  validateCommandParams(command, commandParams, config, { requirePlatformPaths });

  return commandParams;
}

export default getValidatedCommandParams;
