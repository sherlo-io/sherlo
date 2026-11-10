/**
 * WHICH PORT THE APP ASKS FOR ITS BUNDLER - read off the device a capture found no app on, so the
 * ending can say the app looks elsewhere instead of blaming its code. An app that asks a port with
 * no bundler on it falls back to the code built into it, which is not old code to reload.
 *
 * Only what is certain is said. An iOS simulator app with no development launcher reads its saved
 * `RCT_jsLocation`, else 8081. An Android phone (never an emulator, which asks the machine itself
 * and not through `adb reverse`) asks 8081 on itself, which reaches this machine only through an
 * `adb reverse` mapping. An app with Expo's development launcher opens the bundler its launcher
 * chose, which the device does not say: nothing is answered for it.
 */
import { DEFAULT_BUNDLER_PORT } from '../constants';
import { deviceState, isTarget } from './deviceState';
import type { NoTarget, SceneTarget } from './deviceState';
import { reverseMappings, readJsLocation } from './deviceStateSave';
import { androidDevelopmentLauncherLink, iosDevelopmentLauncherLink } from './developmentLauncher';

/** The port the app asks for its bundler, and the device it is on, which the command to fix it names. */
export type PortTheAppAsks =
  | { platform: 'ios'; port: number; udid: string; appId: string }
  | { platform: 'android'; port: number; serial: string };

/** The port the app on `target` asks for its bundler, or nothing when the device cannot say for certain. */
export async function appBundlerPort(target: SceneTarget): Promise<PortTheAppAsks | undefined> {
  const { device, app } = target;
  const run = deviceState().run;

  if (device.platform === 'ios') {
    const launcher = await iosDevelopmentLauncherLink(
      run,
      device.udid,
      app.id,
      DEFAULT_BUNDLER_PORT
    );
    if (launcher) return undefined;
    const location = await readJsLocation(device.udid, app.id);
    const port = location === null ? DEFAULT_BUNDLER_PORT : portOf(location);
    return port === undefined
      ? undefined
      : { platform: 'ios', port, udid: device.udid, appId: app.id };
  }

  if (device.serial.startsWith('emulator-')) return undefined;
  const adb = (...args: string[]) => run('adb', ['-s', device.serial, ...args]);
  const shell = (...args: string[]) => adb('shell', ...args);
  if (await androidDevelopmentLauncherLink(shell, app.id, DEFAULT_BUNDLER_PORT)) return undefined;
  const mappings = await reverseMappings(adb);
  if (mappings === null) return undefined;
  // The phone's own 8081 reaches the machine port its mapping names, or nothing without one.
  const mapped = mappings.find((mapping) => mapping.startsWith(`tcp:${DEFAULT_BUNDLER_PORT} `));
  const port = mapped ? Number(mapped.split(' tcp:')[1]) : DEFAULT_BUNDLER_PORT;
  return { platform: 'android', port, serial: device.serial };
}

/**
 * A capture's ending, and when it found no app, the port the app asks (`appAsks`) if it is not
 * `port`, the one the capture used. Nothing is added when the ports agree, when there is no target,
 * or when the device cannot say. The target is looked up when not handed in.
 */
export async function withPortTheAppAsks<Ending extends { kind: string }>(
  ending: Ending,
  port: number,
  target?: SceneTarget | NoTarget
): Promise<Ending> {
  if (ending.kind !== 'no-app') return ending;
  try {
    const found = target ?? (await deviceState().sceneTarget());
    const appAsks = isTarget(found) ? await appBundlerPort(found) : undefined;
    return appAsks && appAsks.port !== port ? { ...ending, appAsks } : ending;
  } catch {
    // A device tool that fails is a device that cannot say: the capture ends with nothing added.
    return ending;
  }
}

/**
 * The port of a saved bundler location: its own after `host:`, 8081 for a bare host (React Native
 * adds it), or nothing when it is neither.
 */
function portOf(location: string): number | undefined {
  if (/^[\w.-]+$/.test(location)) return DEFAULT_BUNDLER_PORT;
  const port = Number(/^[\w.-]+:(\d+)$/.exec(location)?.[1]);
  return Number.isInteger(port) && port > 0 ? port : undefined;
}
