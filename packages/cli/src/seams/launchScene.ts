/**
 * LAUNCHING THE APP ON A SCENE - the half of a live scene capture that starts the app fresh: it
 * stops the app, points it at the bundler and starts it with the scene's id in the launch
 * (`-sherloCapture <id>` on iOS, `--es sherloCapture <id>` on Android). The command that calls it
 * has already made the device clean and puts it back; this module does neither.
 *
 * Once the device is back, the app is started again with no scene named (relaunchWithNoScene): the
 * put-back closes the app, and a story capture asks the app running on the bundler's line.
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
  prepareIosDevMenuForCapture,
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
      await prepareIosDevMenuForCapture(run, device.udid, app.id);
    } else {
      await pointIosAppAtBundler(run, device.udid, app.id, port);
    }
    await dropStaleLines(port);
    const launchedAt = Date.now();
    await launchIosApp(device.udid, app.id, link, [
      '-sherloCapture',
      sceneId,
      ...(discover ? ['-sherloDiscover', 'YES'] : []),
    ]);
    return launchedAt;
  }

  const adb = (...args: string[]) => run('adb', ['-s', device.serial, 'shell', ...args]);

  const component = await launcherActivity(adb, app.id);
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
  await startAndroidApp(adb, component, link, [
    '--es',
    'sherloCapture',
    sceneId,
    ...(discover ? ['--ez', 'sherloDiscover', 'true'] : []),
  ]);
  return launchedAt;
}

/**
 * Start the app again once a scene capture has put the device back, as the developer runs it: on
 * the bundler, with no scene in the launch. The put-back closes the app, and a story capture asks
 * the app running on the bundler's line, so with none it would wait for an app that never comes.
 * A launch that names no scene boots the app in its own mode, and the restart a story capture asks
 * for lands in testing mode on the story. An app with Expo's development launcher has its menu
 * prepared as for a capture launch: the put-back brought back the developer's own menu settings,
 * and a first-run sheet or a menu open at launch would cover the story a capture photographs.
 */
export async function relaunchWithNoScene(target: SceneTarget, port: number): Promise<void> {
  const { device, app } = target;
  const run = deviceState().run;
  try {
    if (device.platform === 'ios') {
      const link = await iosDevelopmentLauncherLink(run, device.udid, app.id, port);
      if (link) await prepareIosDevMenuForCapture(run, device.udid, app.id);
      await launchIosApp(device.udid, app.id, link, []);
      return;
    }
    const adb = (...args: string[]) => run('adb', ['-s', device.serial, 'shell', ...args]);
    const component = await launcherActivity(adb, app.id);
    const link = await androidDevelopmentLauncherLink(adb, app.id, port);
    if (link) await prepareAndroidDevMenuForCapture(adb, app.id);
    await startAndroidApp(adb, component, link, []);
  } catch (error) {
    // The scene capture has its answer and the device is back, so the capture ends as it did; the
    // developer is told the app is closed, since a story capture needs it running.
    const why = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `Sherlo could not start the app again after the scene${why ? ` (${why})` : ''}. ` +
        'Start it by hand before you capture a story.\n'
    );
  }
}

/**
 * Start the stopped iPhone app with these launch arguments. expo-dev-launcher reads
 * `--initialUrl <url>` from the process arguments at launch and opens that link first
 * (EXDevLauncherController `initialUrlFromProcessInfo`), so one launch carries both the bundle's
 * link and the scene's id, when there is one. A simulator reaches the bundler on localhost.
 */
async function launchIosApp(
  udid: string,
  appId: string,
  link: string | undefined,
  launchArguments: string[]
): Promise<void> {
  await deviceState().run('xcrun', [
    'simctl',
    'launch',
    udid,
    appId,
    ...(link ? ['--initialUrl', link] : []),
    ...launchArguments,
  ]);
}

/** The app's launcher activity: an app names its own, so the phone is asked which one it is. */
async function launcherActivity(
  adb: (...args: string[]) => Promise<string>,
  appId: string
): Promise<string> {
  const resolved = await adb(
    'cmd',
    'package',
    'resolve-activity',
    '--brief',
    '-a',
    'android.intent.action.MAIN',
    '-c',
    'android.intent.category.LAUNCHER',
    appId
  );
  const component = resolved
    .split('\n')
    .map((line) => line.trim())
    .reverse()
    .find((line) => /^\S+\/\S+$/.test(line));
  if (!component) throw new Error(resolved.trim());
  return component;
}

/** Start the Android app's launcher activity on the development launcher's link, or as its icon does. */
async function startAndroidApp(
  adb: (...args: string[]) => Promise<string>,
  component: string,
  link: string | undefined,
  extras: string[]
): Promise<void> {
  const started = await adb(
    'am',
    'start',
    '-n',
    component,
    ...(link
      ? ['-a', 'android.intent.action.VIEW', '-d', `'${link}'`]
      : ['-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER']),
    ...extras
  );
  // `adb shell am start` exits 0 even when the phone refuses, so its words are read here.
  if (/^Error:/m.test(started)) throw new Error(started.trim());
}
