import { INCLUDE_OPTION } from '../../constants';
import { Command, Options } from '../../types';

function getNormalizedOptions<C extends Command>(
  options: Options<C, 'withDefaults'>
): Options<C, 'withDefaults', 'normalized'> {
  const normalizedOptions = { ...options } as Options<C, 'withDefaults', 'normalized'>;

  if (typeof options[INCLUDE_OPTION] === 'string') {
    normalizedOptions[INCLUDE_OPTION] = parseCommaSeparatedStringToArray(options[INCLUDE_OPTION]);
  }

  return normalizedOptions;
}

export default getNormalizedOptions;

/* ========================================================================== */

export function parseCommaSeparatedStringToArray(value: string): string[] {
  return value.split(',').map((item) => item.trim());
}
