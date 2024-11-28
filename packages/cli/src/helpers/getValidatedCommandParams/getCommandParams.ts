import path from 'path';
import { InvalidatedConfig, Options } from '../../types';

/**
 * 1. `android` and `ios` can be defined as any value in the config.
 *    Converting to string is required as path.resolve accepts only strings.
 */
function getCommandParams<O extends Options<'any', 'withDefaults'>, C extends InvalidatedConfig>(
  options: O,
  config: C
): O & C {
  const { projectRoot } = options;

  const android = options.android ?? config.android;
  const androidFullPath = android
    ? path.resolve(projectRoot, android.toString() /* 1 */)
    : undefined;

  const ios = options.ios ?? config.ios;
  const iosFullPath = ios ? path.resolve(projectRoot, ios.toString() /* 1 */) : undefined;

  return {
    ...config,
    ...options,
    android: androidFullPath,
    ios: iosFullPath,
  };
}

export default getCommandParams;
