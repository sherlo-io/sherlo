import { DEVICES_OPTION } from '../../constants';
import { Command, CommandParams, Options, PushCredential } from '../../types';
import getCommandParams from './getCommandParams';
import getNormalizedConfig from './getNormalizedConfig';
import getNormalizedOptions from './getNormalizedOptions';
import getOptionsWithDefaults from './getOptionsWithDefaults';
import validateCommandParams from './validateCommandParams';
import resolvePushCredential from './validateCommandParams/resolvePushCredential';
import validateRequiredOptions from './validateRequiredOptions';

async function getValidatedCommandParams<C extends Command>({
  command,
  passedOptions,
  resolvedCredential,
}: {
  command: C;
  passedOptions: Options<C>;
  /** A credential this run already resolved: reused, so a run never trades GitHub's ID token twice. */
  resolvedCredential?: PushCredential;
}): Promise<CommandParams<C>> {
  validateRequiredOptions({ command, passedOptions });

  const options = getNormalizedOptions(getOptionsWithDefaults(passedOptions));

  const config = getNormalizedConfig(options);

  // Before the devices: the credential and the project it pushes into.
  const credential = resolvedCredential ?? (await resolvePushCredential(command, config, options));

  const commandParams = { ...getCommandParams(options, config), credential };

  validateCommandParams(
    commandParams,
    config,
    options[DEVICES_OPTION] !== undefined ? `\`--${DEVICES_OPTION}\`` : 'config'
  );

  return commandParams;
}

export default getValidatedCommandParams;
