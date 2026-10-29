import {
  DEVICES_OPTION,
  DIAGNOSTICS_OPTION,
  DOCS_LINK,
  EXCLUDE_OPTION,
  INCLUDE_OPTION,
} from '../../constants';
import { Command, InvalidatedConfig, Options } from '../../types';
import throwError from '../throwError';

function getNormalizedOptions<C extends Command>(
  options: Options<C, 'withDefaults'>
): Options<C, 'withDefaults', 'normalized'> {
  const normalizedOptions = { ...options } as unknown as Options<C, 'withDefaults', 'normalized'>;

  if (typeof options[INCLUDE_OPTION] === 'string') {
    normalizedOptions[INCLUDE_OPTION] = parseCommaSeparatedStringToArray(options[INCLUDE_OPTION]);
  }

  if (typeof options[EXCLUDE_OPTION] === 'string') {
    normalizedOptions[EXCLUDE_OPTION] = parseCommaSeparatedStringToArray(options[EXCLUDE_OPTION]);
  }

  if (typeof options[DEVICES_OPTION] === 'string') {
    normalizedOptions[DEVICES_OPTION] = parseDevicesJson(options[DEVICES_OPTION]);
  }

  if (typeof options[DIAGNOSTICS_OPTION] === 'string') {
    normalizedOptions[DIAGNOSTICS_OPTION] = parseCommaSeparatedStringToArray(
      options[DIAGNOSTICS_OPTION]
    );
  }

  return normalizedOptions;
}

export default getNormalizedOptions;

/* ========================================================================== */

export function parseCommaSeparatedStringToArray(value: string): string[] {
  return value.split(',').map((item) => item.trim());
}

/**
 * `--devices` takes the config's `devices` exactly as the file holds it. Only the JSON is checked
 * here; each device is checked where the config's are (validateDevices), in the same words.
 */
function parseDevicesJson(value: string): InvalidatedConfig['devices'] {
  try {
    return JSON.parse(value);
  } catch {
    throwError({
      message:
        `\`--${DEVICES_OPTION}\` must be the config's devices as JSON, ` +
        `such as '[{"id":"pixel.7","osVersion":"13"}]'`,
      learnMoreLink: DOCS_LINK.configDevices,
    });
  }
}
