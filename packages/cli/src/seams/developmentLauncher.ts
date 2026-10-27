/**
 * HOW A FRESH LAUNCH REACHES THE BUNDLER - the development launcher link of an Expo development
 * build, and the preference that keeps the developer menu's first-run sheet away. ./liveScene uses
 * both when it boots the app on a scene.
 */
import type { deviceState } from './deviceState';

/**
 * Prepare the developer menu for a capture in the stopped app's private preferences: its first-run
 * sheet seen, the menu closed at launch, and its floating Tools button off.
 * Mirrors sherlo-runner's android preSeedExpoDevMenuPrefs.ts, but sets only those three keys. The XML goes through base64 because `run-as sh -c` strips its double quotes.
 */
export async function prepareAndroidDevMenuForCapture(
  adb: (...args: string[]) => Promise<string>,
  appId: string
): Promise<void> {
  const xml =
    `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n` +
    `    <boolean name="isOnboardingFinished" value="true" />\n` +
    `    <boolean name="showsAtLaunch" value="false" />\n` +
    `    <boolean name="showFab" value="false" />\n</map>\n`;
  const encoded = Buffer.from(xml, 'utf-8').toString('base64');
  const dir = `/data/data/${appId}/shared_prefs`;
  await adb(
    'run-as',
    appId,
    'sh',
    '-c',
    `'mkdir -p ${dir} && echo ${encoded} | base64 -d > ${dir}/expo.modules.devmenu.sharedpreferences.xml'`
  );
}

/** The link that opens the bundler in Expo's development launcher, from the `exp+<scheme>` in `listing`. */
export function developmentLauncherLink(listing: string, port: number): string | undefined {
  const scheme = listing.match(/exp\+[A-Za-z0-9._-]+/)?.[0];
  if (!scheme) return undefined;
  const bundlerUrl = encodeURIComponent(`http://localhost:${port}`);
  return `${scheme}://expo-development-client/?url=${bundlerUrl}`;
}

/**
 * The launcher's link for an installed Android app, or nothing when it has no launcher. The phone
 * says both: the launcher's activity in the package listing, and the `exp+<scheme>` the app registers.
 */
export async function androidDevelopmentLauncherLink(
  adb: (...args: string[]) => Promise<string>,
  appId: string,
  port: number
): Promise<string | undefined> {
  const listing = await adb('dumpsys', 'package', appId).catch(() => '');
  if (!listing.includes('expo.modules.devlauncher')) return undefined;
  return developmentLauncherLink(listing, port);
}

/**
 * The launcher's link for an installed iPhone app, or nothing when it has no launcher: the
 * `exp+<scheme>` URL scheme in the installed bundle's Info.plist is the one the development launcher
 * adds to an app.
 */
export async function iosDevelopmentLauncherLink(
  run: ReturnType<typeof deviceState>['run'],
  udid: string,
  appId: string,
  port: number
): Promise<string | undefined> {
  const container = (await run('xcrun', ['simctl', 'get_app_container', udid, appId])).trim();
  if (!container) return undefined;
  const plist = await run('xcrun', ['plutil', '-p', `${container}/Info.plist`]).catch(() => '');
  return developmentLauncherLink(plist, port);
}
