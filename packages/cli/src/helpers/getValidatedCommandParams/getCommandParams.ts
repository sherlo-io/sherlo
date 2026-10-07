import path from 'path';
import { DEVICES } from '@sherlo/shared';
import { InvalidatedConfig, Options } from '../../types';

/**
 * 1. `android` and `ios` can be defined as any value in the config.
 *    Converting to string is required as path.resolve accepts only strings.
 */
function getCommandParams<
  O extends Options<'any', 'withDefaults', 'normalized'>,
  C extends InvalidatedConfig
>(options: O, config: C): C & O {
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
    ...onlyThePlatformAsked(options, config),
    // THE CONFIG'S `build` BLOCK, KEPT APART FROM THE `--no-build` FLAG. Commander hands the negated
    // flag over as `build: true | false`, and the spread above lets the flag land on top of the
    // config's object of the same name - so the block travels under a name of its own.
    buildSettings: (config as { build?: unknown }).build,
  };
}

/**
 * `--platform <android|ios>`: one job of a split CI run builds and tests one platform, so the
 * devices of the other platform are left out of this run. The platform nobody asked for still
 * belongs to the test - the other job brings it.
 */
function onlyThePlatformAsked(options: object, config: object): { devices?: unknown[] } {
  const platform = (options as { platform?: string }).platform;
  const devices = (config as { devices?: unknown }).devices;
  if (!platform || !Array.isArray(devices)) return {};

  return {
    devices: devices.filter(
      (device) =>
        (DEVICES as Record<string, { os: string } | undefined>)[
          (device as { id?: string })?.id ?? ''
        ]?.os === platform
    ),
  };
}

export default getCommandParams;
