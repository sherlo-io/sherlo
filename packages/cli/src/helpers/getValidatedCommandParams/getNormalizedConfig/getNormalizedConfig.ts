import { DEVICES_OPTION, EXCLUDE_OPTION, INCLUDE_OPTION } from '../../../constants';
import { InvalidatedConfig, Options } from '../../../types';
import getConfigWithNormalizedDevices from './getConfigWithNormalizedDevices';
import parseConfigFile from './parseConfigFile';
import resolveConfigPath from './resolveConfigPath';

function getNormalizedConfig(
  options: Options<'any', 'withDefaults', 'normalized'>
): InvalidatedConfig {
  const parsedConfig = parseConfigFile(resolveConfigPath(options));

  const config = getConfigWithNormalizedDevices(withTheRunsScope(parsedConfig, options));

  return config;
}

export default getNormalizedConfig;

/* ========================================================================== */

/**
 * THE RUN'S SCOPE REPLACES THE CONFIG'S: `--include`, `--exclude` and `--devices` each stand in for
 * the config's own value, whole, for this run - before anything reads the devices, so the platform a
 * job skips, the devices a build is made for and the devices the run tests are the same list.
 */
function withTheRunsScope(
  config: InvalidatedConfig,
  options: Options<'any', 'withDefaults', 'normalized'>
): InvalidatedConfig {
  return {
    ...config,
    ...(options[INCLUDE_OPTION] !== undefined && { include: options[INCLUDE_OPTION] }),
    ...(options[EXCLUDE_OPTION] !== undefined && { exclude: options[EXCLUDE_OPTION] }),
    ...(options[DEVICES_OPTION] !== undefined && { devices: options[DEVICES_OPTION] }),
  };
}
