/**
 * LAUNCHING THE APP ON A SCENE - the half of a live scene capture that starts the app fresh: it
 * stops the app, points it at the bundler and starts it with the scene's id in the launch
 * (`-sherloCapture <id>` on iOS, `--es sherloCapture <id>` on Android). The command that calls it
 * has already made the device clean and puts it back; this module does neither.
 */
import { drainAppLog } from './appLog';
import { deviceState } from './deviceState';
import type { SceneTarget } from './deviceState';
import {
  androidDevelopmentLauncherLink,
  pointAndroidAppAtBundler,
  pointIosAppAtBundler,
  iosDevelopmentLauncherLink,
  prepareAndroidDevMenuForCapture,
} from './developmentLauncher';

/**
 * Empty the log feed of what an earlier scene left. Called once the old app is stopped and before
 * the new one starts, so no line is of the new launch; the feed keeps no time, so `launchedAt`
 * cannot do this for it. A line of the old app still in flight on the socket when it was stopped
 * is the one thing this cannot rule out.
 */
async function dropStaleLines(port: number): Promise<void> {
  await drainAppLog(port);
}

/**
 * Stop the app if it runs, then start it with the scene's id in the launch. Answers when the start
 * was asked, after the stop: the bundler runs on this machine, so the line reads the same clock.
 */
export async function launchFresh(
  target: SceneTarget,
  sceneId: string,
  port: number,
  discover = false
): Promise<number> {
  const { device, app } = target;
  const run = deviceState().run;

  if (device.platform === 'ios') {
    await run('xcrun', ['simctl', 'terminate', device.udid, app.id]).catch(() => '');
    const link = await iosDevelopmentLauncherLink(run, device.udid, app.id, port);
    if (link) {
      // Mirrors sherlo-runner's ios launchApp.ts: the sheet's record is a user default of the app.
      // The menu stays closed at launch too (the clean device wipes that setting), and its floating
      // Tools button is off so it never covers the scene; the shake gesture and key commands still
      // open the menu.
      for (const [key, value] of [
        ['EXDevMenuIsOnboardingFinished', 'YES'],
        ['EXDevMenuShowsAtLaunch', 'NO'],
        ['EXDevMenuShowFloatingActionButton', 'NO'],
      ]) {
        await run('xcrun', [
          'simctl',
          'spawn',
          device.udid,
          'defaults',
          'write',
          app.id,
          key,
          '-bool',
          value,
        ]);
      }
    } else {
      await pointIosAppAtBundler(run, device.udid, app.id, port);
    }
    // expo-dev-launcher reads `--initialUrl <url>` from the process arguments at launch and opens
    // that link first (EXDevLauncherController `initialUrlFromProcessInfo`), so one launch carries
    // both the bundle's link and the scene's id. A simulator reaches the bundler on localhost.
    await dropStaleLines(port);
    const launchedAt = Date.now();
    await run('xcrun', [
      'simctl',
      'launch',
      device.udid,
      app.id,
      ...(link ? ['--initialUrl', link] : []),
      '-sherloCapture',
      sceneId,
      ...(discover ? ['-sherloDiscover', 'YES'] : []),
    ]);
    return launchedAt;
  }

  const adb = (...args: string[]) => run('adb', ['-s', device.serial, 'shell', ...args]);

  // An app names its own launcher activity, so ask the phone which one it is.
  const resolved = await adb(
    'cmd',
    'package',
    'resolve-activity',
    '--brief',
    '-a',
    'android.intent.action.MAIN',
    '-c',
    'android.intent.category.LAUNCHER',
    app.id
  );
  const component = resolved
    .split('\n')
    .map((line) => line.trim())
    .reverse()
    .find((line) => /^\S+\/\S+$/.test(line));
  if (!component) throw new Error(resolved.trim());

  await adb('am', 'force-stop', app.id).catch(() => '');
  const link = await androidDevelopmentLauncherLink(adb, app.id, port);
  if (link) {
    await prepareAndroidDevMenuForCapture(adb, app.id);
  } else {
    await pointAndroidAppAtBundler(adb, app.id, port);
  }
  // A clean phone has no last bundle for Expo's development launcher to reopen (the data is wiped
  // before each scene), and a plain app asks localhost: either way the phone's port must reach the bundler.
  await run('adb', ['-s', device.serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  await dropStaleLines(port);
  const launchedAt = Date.now();
  const started = await adb(
    'am',
    'start',
    '-n',
    component,
    ...(link
      ? ['-a', 'android.intent.action.VIEW', '-d', `'${link}'`]
      : ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER']),
    '--es',
    'sherloCapture',
    sceneId,
    ...(discover ? ['--ez', 'sherloDiscover', 'true'] : [])
  );
  // `adb shell am start` exits 0 even when the phone refuses, so its words are read here.
  if (/^Error:/m.test(started)) throw new Error(started.trim());
  return launchedAt;
}
