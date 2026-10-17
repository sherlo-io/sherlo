import path from 'path';
import { DEVICES } from '@sherlo/shared';
import { renderPlatformUnknown } from '../../render/appBuild';
import { InvalidatedConfig, Options } from '../../types';
import throwError from '../throwError';

/**
 * 1. The config's `android` and `ios` are never read: a Sherlo 2 binary path in the config is
 *    refused (validateConfigProperties). The only app paths here are the ones a push hands itself
 *    for the builds it just made, which arrive as options.
 */
function getCommandParams<
  O extends Options<'any', 'withDefaults', 'normalized'>,
  C extends InvalidatedConfig,
>(options: O, config: C): C & O {
  const { projectRoot } = options;

  refuseUnknownPlatform(options);

  return {
    ...config,
    ...options,
    android: options.android ? path.resolve(projectRoot, options.android) /* 1 */ : undefined,
    ios: options.ios ? path.resolve(projectRoot, options.ios) /* 1 */ : undefined,
    ...onlyThePlatformAsked(options, config),
    // THE CONFIG'S WHOLE DEVICE LIST: `devices` above is cut to the job's own platform, while the
    // test's row names every device of the test, whichever job started it.
    testDevices: (config as { devices?: unknown[] }).devices,
    // THE CONFIG'S `build` BLOCK, under the name every reader of it uses (readBuildSettings).
    buildSettings: (config as { build?: unknown }).build,
  };
}

/** `--platform` names one of the two platforms, or is left out for both. */
function refuseUnknownPlatform(options: object): void {
  const { platform } = options as { platform?: string };
  if (platform === undefined || platform === 'android' || platform === 'ios') return;

  throwError(renderPlatformUnknown(platform));
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
