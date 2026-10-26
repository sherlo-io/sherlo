/**
 * THE LIVE SCENE - the half of `sherlo capture --scene` and `sherlo open --scene` that reaches a
 * real device: it launches the app fresh on the scene, then asks the bundler's line for the record.
 *
 * The launch carries the scene's id (`-sherloCapture <id>` on iOS, `--es sherloCapture <id>` on
 * Android), so the app boots once, already in capture mode, on the scene. The command that calls
 * this has already made the device clean (`prepareCleanDevice`) and puts it back; this module never
 * does either. The record comes back down the same line a story's does, and Sherlo's own log
 * lines from the app are drained from the line's feed after it.
 */
import type { SceneEnding, PlayStep } from '../render/capturedScene';
import { drainAppLog, keepStrings, readAppLog } from './appLog';
import { readAppError } from './appError';
import { askTheBundlerLine } from './bundlerLine';
import { readCapturedView } from './capturedViewReader';
import { deviceState, isTarget } from './deviceState';
import type { NoTarget, PhoneFound, SceneTarget } from './deviceState';
import type { SceneCaptureResult, STABILIZATION_SETTINGS } from './captureSocket';

/** How long the app has to boot, play the scene and settle before the command gives up on it. */
const SCENE_PATIENCE_MS = 120_000;

/** How long the launched app has to say hello on the line before the command calls it absent. */
const APP_HELLO_PATIENCE_MS = 60_000;

/** How long to wait between asks while the launched app has not said hello yet. */
const HELLO_RETRY_MS = 1000;

/**
 * A capture that found no app, and why: the phone had no target, the app was not on it, the line
 * broke (`detail` is the line's own account), nothing answered in time, or the launched app never
 * said hello.
 */
export type NoApp = {
  kind: 'no-app';
  why:
    | 'no-phone'
    | 'several-phones'
    | 'no-app-id'
    | 'not-installed'
    | 'line-broke'
    | 'gave-up-waiting'
    | 'never-said-hello';
  detail?: string;
  /** For the causes of no target: every running phone, with its app id and whether it has the app. */
  found?: PhoneFound[];
};

/**
 * Launch the app fresh on `sceneId`, wait for it to play the scene, and answer with its record.
 * Every way of not getting one is a named ending, never a thrown error.
 */
export async function captureLiveScene(params: {
  sceneId: string;
  port: number;
  settings: typeof STABILIZATION_SETTINGS;
  target: SceneTarget | NoTarget;
}): Promise<SceneCaptureResult> {
  const { sceneId, port, settings, target } = params;
  if (!isTarget(target)) return { kind: 'no-app', why: target.cause, found: target.found };

  const launchedAt = await launchFresh(target, sceneId, port);

  const helloDeadline = launchedAt + APP_HELLO_PATIENCE_MS;
  for (;;) {
    const answer = await askTheBundlerLine({
      port,
      // Asked as a scene, so the line hands the app a scene to walk, never a story; and of the app
      // launched now, never one an earlier capture left on the line.
      question: { action: 'captureStory', sceneId, settings, launchedAt },
      patienceMs: SCENE_PATIENCE_MS,
    });

    if (answer.kind === 'nothing-on-the-port') return { kind: 'no-bundler' };
    if (answer.kind === 'not-in-sherlos-words') {
      return { kind: 'no-app', why: 'line-broke', detail: answer.detail };
    }
    if (answer.kind === 'gave-up-waiting') {
      // The line counts each time the app took the instruction and started over: no picture came
      // because the app kept starting over, which is not the same as no app.
      const { logs, restarts } = await readAppLog(port);
      const ending: NoApp | SceneEnding =
        restarts > 0
          ? { kind: 'restarted-mid-capture', sceneId, restarts }
          : { kind: 'no-app', why: 'gave-up-waiting' };
      return logs.length > 0 ? { ...ending, logs } : ending;
    }

    const ending = readSceneAnswer(answer.reply, sceneId);
    // The relay says no app has come yet until the launched one says hello: ask again.
    if (ending.kind === 'no-app' && Date.now() < helloDeadline) {
      await new Promise((resolve) => setTimeout(resolve, HELLO_RETRY_MS));
      continue;
    }

    if (ending.kind === 'no-app') {
      return withStageLines({ kind: 'no-app', why: 'never-said-hello' }, port);
    }

    const logs = await drainAppLog(port);
    return logs.length > 0 ? { ...ending, logs } : ending;
  }
}

/**
 * A no-app ending with the lines the app logged before it went quiet, so the last stage it reached
 * can be read. They ride in the --json reply only: the terminal words for no app stay as signed.
 */
async function withStageLines(ending: NoApp, port: number): Promise<NoApp & { logs?: string[] }> {
  const logs = await drainAppLog(port);
  return logs.length > 0 ? { ...ending, logs } : ending;
}

/**
 * Stop the app if it runs, then start it with the scene's id in the launch. Answers when the start
 * was asked, after the stop: the bundler runs on this machine, so the line reads the same clock.
 */
async function launchFresh(target: SceneTarget, sceneId: string, port: number): Promise<number> {
  const { device, app } = target;
  const run = deviceState().run;

  if (device.platform === 'ios') {
    await run('xcrun', ['simctl', 'terminate', device.udid, app.id]).catch(() => '');
    const link = await iosDevelopmentLauncherLink(run, device.udid, app.id, port);
    if (link) {
      // Mirrors sherlo-runner's ios launchApp.ts: the sheet's record is a user default of the app.
      // The menu stays closed at launch too (the clean device wipes that setting); the floating
      // button, gestures and key commands still open it.
      for (const [key, value] of [
        ['EXDevMenuIsOnboardingFinished', 'YES'],
        ['EXDevMenuShowsAtLaunch', 'NO'],
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
    }
    // expo-dev-launcher reads `--initialUrl <url>` from the process arguments at launch and opens
    // that link first (EXDevLauncherController `initialUrlFromProcessInfo`), so one launch carries
    // both the bundle's link and the scene's id. A simulator reaches the bundler on localhost.
    const launchedAt = Date.now();
    await run('xcrun', [
      'simctl',
      'launch',
      device.udid,
      app.id,
      ...(link ? ['--initialUrl', link] : []),
      '-sherloCapture',
      sceneId,
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
    await markAndroidDevMenuSheetSeen(adb, app.id);
    // A clean phone has no last bundle for Expo's development launcher to reopen (the data is
    // wiped before each scene), so the start hands it the bundler's address through its own link.
    await run('adb', ['-s', device.serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  }
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
    sceneId
  );
  // `adb shell am start` exits 0 even when the phone refuses, so its words are read here.
  if (/^Error:/m.test(started)) throw new Error(started.trim());
  return launchedAt;
}

/**
 * Mark the developer menu's first-run sheet as seen in the stopped app's private preferences.
 * Mirrors sherlo-runner's android preSeedExpoDevMenuPrefs.ts, but sets only the two keys that hide
 * the sheet and keep the menu closed at launch. The XML goes through base64 because `run-as sh -c` strips its double quotes.
 */
async function markAndroidDevMenuSheetSeen(
  adb: (...args: string[]) => Promise<string>,
  appId: string
): Promise<void> {
  const xml =
    `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n` +
    `    <boolean name="isOnboardingFinished" value="true" />\n` +
    `    <boolean name="showsAtLaunch" value="false" />\n</map>\n`;
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
function developmentLauncherLink(listing: string, port: number): string | undefined {
  const scheme = listing.match(/exp\+[A-Za-z0-9._-]+/)?.[0];
  if (!scheme) return undefined;
  const bundlerUrl = encodeURIComponent(`http://localhost:${port}`);
  return `${scheme}://expo-development-client/?url=${bundlerUrl}`;
}

/**
 * The launcher's link for an installed Android app, or nothing when it has no launcher. The phone
 * says both: the launcher's activity in the package listing, and the `exp+<scheme>` the app registers.
 */
async function androidDevelopmentLauncherLink(
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
async function iosDevelopmentLauncherLink(
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

/* ========================================================================== */

/** The test ids a never-reached scene saw on screen, as the app listed them; nothing when it listed none. */
function keptSeen(said: unknown): { seen?: { testIDs: string[]; more: number } } {
  const seen = said as { testIDs?: unknown; more?: unknown } | null | undefined;
  if (!Array.isArray(seen?.testIDs)) return {};
  const more = typeof seen.more === 'number' ? seen.more : 0;
  return { seen: { testIDs: keepStrings(seen.testIDs), more } };
}

/** What the line said about the scene it was asked for, as one named ending. */
export function readSceneAnswer(said: unknown, sceneId: string): SceneEnding | { kind: 'no-app' } {
  const answer = said as Record<string, unknown> | null | undefined;

  if (answer?.kind === 'no-such-story') {
    return { kind: 'no-such-scene', sceneId, known: keepStrings(answer.known) };
  }

  if (answer?.kind === 'crashed') {
    return { kind: 'crashed-at-boot', sceneId, error: bootError(answer.error) };
  }

  if (answer?.kind === 'never-reached') {
    return {
      kind: 'never-reached',
      sceneId,
      ready: typeof answer.ready === 'string' ? answer.ready : '',
      stayedOn: keepStrings(answer.stayedOn),
      ...keptSeen(answer.seen),
    };
  }

  if (answer?.kind === 'play-target-missing') {
    const missing = answer.missing as { tap?: unknown } | undefined;
    return {
      kind: 'play-target-missing',
      sceneId,
      route: keepStrings(answer.route),
      done: playSteps(answer.done),
      missing: { tap: typeof missing?.tap === 'string' ? missing.tap : '' },
      limitMs: typeof answer.limitMs === 'number' ? answer.limitMs : 0,
    };
  }

  if (answer?.kind === 'scene') {
    const reached = answer.reached as { route?: unknown; ms?: unknown } | undefined;
    const settled = answer.settled as { ms?: unknown; frames?: unknown } | string | undefined;
    // A scene that never settled did not get ready: it ends in the signed "never got ready" words.
    if (typeof settled !== 'object' || typeof settled?.ms !== 'number') {
      return {
        kind: 'never-reached',
        sceneId,
        ready: typeof answer.ready === 'string' ? answer.ready : '',
        stayedOn: keepStrings(reached?.route),
      };
    }
    return {
      kind: 'scene',
      sceneId,
      bootMs: typeof answer.bootMs === 'number' ? answer.bootMs : 0,
      reached: {
        route: keepStrings(reached?.route),
        ms: typeof reached?.ms === 'number' ? reached.ms : 0,
      },
      play: playSteps(answer.play),
      settled: { ms: settled.ms, frames: typeof settled.frames === 'number' ? settled.frames : 0 },
      ...(typeof answer.density === 'number' && { density: answer.density }),
      ...(typeof answer.fontScale === 'number' && { fontScale: answer.fontScale }),
      tree: readCapturedView(answer.tree),
    };
  }

  return { kind: 'no-app' };
}

/** The error a scene's boot died of, with the file and line of its top frame when it has one. */
function bootError(said: unknown): { name: string; message: string; file: string; line: number } {
  const error = said as { name?: unknown; message?: unknown; topFrames?: unknown } | undefined;
  const frame = keepStrings(error?.topFrames)[0] ?? readAppError(said)?.topFrames?.[0] ?? '';
  const place = /([^\s(]+):(\d+):\d+\)?$/.exec(frame);
  return {
    name: typeof error?.name === 'string' ? error.name : 'Error',
    message: typeof error?.message === 'string' ? error.message : '',
    file: place?.[1] ?? 'unknown',
    line: place ? Number(place[2]) : 0,
  };
}

function playSteps(value: unknown): PlayStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((step: { tap?: unknown; open?: unknown }): PlayStep[] => {
    if (typeof step?.tap === 'string') return [{ tap: step.tap }];
    if (typeof step?.open === 'string') return [{ open: step.open }];
    return [];
  });
}
