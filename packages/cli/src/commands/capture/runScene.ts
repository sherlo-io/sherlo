/**
 * PUT ONE SCENE (OR STORY) THROUGH THE DEVICE AND KEEP WHAT CAME OF IT, for `sherlo capture`.
 *
 * The screen is the caller's: this runs the clean device, asks the app through the capture socket,
 * saves the pictures and keeps the record, and hands the answer back for the caller to print.
 */
import path from 'path';
import { DISCOVER_OPTION, PNG_OPTION, PORT_OPTION } from '../../constants';
import { throwError } from '../../helpers';
import getCwd from '../../helpers/getCwd';
import { readPort } from '../../helpers/readPort';
import { applySceneDevice, deviceOfScene } from '../../seams/sceneDevice';
import type { PhoneNotApplied, SceneDeviceField } from '../../seams/sceneDevice';
import { declaredPermissions } from '../../seams/declaredPermissions';
import { STABILIZATION_SETTINGS } from '../../seams/bundlerLine';
import { captureSocket } from '../../seams/captureSocket';
import {
  appIsInstalled,
  deviceState,
  endOnNotDebuggable,
  isTarget,
  prepareCleanDevice,
  saveScreenPicture,
} from '../../seams/deviceState';
import type { NoTarget, SceneDevice, SceneTarget } from '../../seams/deviceState';
import {
  changeSinceLastKeptRun,
  dropCapture,
  guardCapture,
  keepCapture,
  lastRunOf,
  newCapture,
  pictureKeptFor,
  sceneCameUp,
} from '../../seams/localCaptures';
import type { NewCapture } from '../../seams/localCaptures';
import { readLocalDevice } from '../../seams/localDevice';
import { nameWhereItCrashed } from '../../seams/appError';
import { refusedByTheProxy } from '../../seams/refusingProxy';
import { nameSendersByCode } from '../../seams/senderByCode';
import { symbolicateStacks } from '../../seams/symbolicateStack';
import { incompleteIfRefused } from '../../seams/liveScene';
import type { SceneCaptureResult } from '../../seams/liveScene';
import type { ScenePicture } from '../../render/capturedScene';
import type { CaptureOptions } from './captureOptions';

/**
 * Which endings carry what the scene left behind (render/capturedScene SceneLeft), read off the type:
 * the compiler refuses this table the day an ending gains or loses SceneLeft.
 */
const ENDING_CARRIES_SCENE_LEFT: {
  [Kind in SceneCaptureResult['kind']]: 'phoneNotApplied' extends keyof Extract<
    SceneCaptureResult,
    { kind: Kind }
  >
    ? true
    : false;
} = {
  'no-bundler': false,
  'no-app': false,
  'no-such-scene': false,
  'bundle-does-not-build': false,
  'crashed-at-boot': false,
  'crashed-mid-capture': true,
  'never-reached': true,
  'play-target-missing': true,
  'never-settled': true,
  'restarted-mid-capture': false,
  scene: true,
  incomplete: true,
};

/** Put one scene through the clean device and keep what came of it; the screen is the caller's. */
export function runScene(sceneId: string, passedOptions: CaptureOptions) {
  const keptFolder = openCapture(sceneId);
  return guardCapture(keptFolder, () => runOpenScene(sceneId, passedOptions, keptFolder));
}

async function runOpenScene(
  sceneId: string,
  passedOptions: CaptureOptions,
  keptFolder: NewCapture | undefined
) {
  const port = readPort(passedOptions[PORT_OPTION]);

  // The scene runs on a clean device, and every ending - a throw included - puts it back.
  const target = await deviceState().sceneTarget();
  // An app that is not on the device has nothing to clean or launch: it ends as no app attached.
  const installed = !isTarget(target) || (await appIsInstalled(target));
  // The scene's own phone setup, read from its file, and every permission the app declares: all
  // answered before the device is touched (a permission the scene does not list is granted).
  const phone =
    isTarget(target) && installed
      ? { ...sceneDeviceField(sceneId), declared: await declaredPermissions(target) }
      : undefined;
  const restore =
    isTarget(target) && installed
      ? await prepareCleanDevice(target.device, target.app, phone, port).catch(endOnNotDebuggable)
      : undefined;
  const pngPath = passedOptions[PNG_OPTION];
  const discover = passedOptions[DISCOVER_OPTION] === true;
  let answer: SceneCaptureResult;
  let notApplied: PhoneNotApplied[] = [];
  let keptPicture: ReturnType<typeof pictureKeptFor> | undefined;
  let picture: ScenePicture | undefined = pngPath ? { path: pngPath } : undefined;
  const startedAt = Date.now();
  try {
    if (isTarget(target) && installed) notApplied = await applySceneDevice(target, phone);
    answer = installed
      ? await captureSocket().captureScene({
          sceneId,
          port,
          settings: STABILIZATION_SETTINGS,
          target,
          discover,
        })
      : { kind: 'no-app', why: 'not-installed' };
    // What an emulator's proxy refused is listed with what the app itself refused.
    const refusedByProxy = refusedByTheProxy();
    if ((sceneCameUp(answer) || answer.kind === 'never-reached') && refusedByProxy.length > 0) {
      answer = { ...answer, unanswered: [...(answer.unanswered ?? []), ...refusedByProxy] };
    }
    // A scene is incomplete once every refusal is merged, the proxy's included.
    if (!discover) answer = incompleteIfRefused(answer);
    // Each refusal's stack is read through the bundler; a request still named by no package is
    // named by the project's dependency whose code holds its host.
    if (sceneCameUp(answer) || answer.kind === 'never-reached') {
      answer = nameSendersByCode(await symbolicateStacks(answer, port), getCwd());
    }
    // The screen as the app left it: the clean device's put-back below would show the home screen.
    if (picture && sceneCameUp(answer) && isTarget(target)) {
      picture = await savePicture(target.device, picture.path);
    }
    // The kept picture is saved only for a scene that was captured: a scene that never got ready,
    // never settled, or ended on the red error screen keeps no picture of its own, and the last
    // captured one stays where it is.
    keptPicture = pictureKeptFor(getCwd(), sceneId, answer);
    if (keptFolder && keptPicture.saves && isTarget(target)) {
      await savePicture(target.device, keptFolder.screenPath);
    }
    if (answer.kind === 'crashed-mid-capture' && answer.error) {
      answer = { ...answer, error: await nameWhereItCrashed(answer.error, port, getCwd()) };
    }
    // What the scene threw is placed the same way: its file, line and the data it was reading.
    if ('threw' in answer && answer.threw) {
      const threw = await nameWhereItCrashed(answer.threw, port, getCwd());
      answer = { ...answer, threw } as SceneCaptureResult;
    }
  } finally {
    await restore?.();
  }
  const saved = picture && !picture.error && sceneCameUp(answer) ? { png: picture.path } : {};
  const listed = discover ? { discover: true } : {};
  // What the phone could not take is listed beside the other things the scene left (render/phoneNotAppliedLines).
  if (notApplied.length > 0 && ENDING_CARRIES_SCENE_LEFT[answer.kind]) {
    answer = { ...answer, phoneNotApplied: notApplied } as SceneCaptureResult;
  }
  // How the scene ended last time it was kept, against now: the one line goes beside the record.
  const sinceLast = changeSinceLastKept(answer, sceneId);
  if (sinceLast.lastRun) answer = { ...answer, lastRun: sinceLast.lastRun } as SceneCaptureResult;
  const record = {
    ...answer,
    ...saved,
    ...listed,
    ...(sinceLast.change && { changeSinceLastRun: sinceLast.change }),
  };
  // An app that was never on the device ran on nothing, so no device is named for it.
  // The time a scene waited before giving up is kept beside its record, not printed: `--json` stays as it is.
  const waited = answer.kind === 'never-reached' ? { waitedMs: Date.now() - startedAt } : {};
  // Likewise kept, not printed: no picture was saved, and where the scene's last captured one is.
  const noPicture =
    keptPicture && !keptPicture.saves
      ? {
          noPicture: {
            ending: keptPicture.ending,
            ...(keptPicture.lastPicture && {
              lastPicture: path.relative(getCwd(), keptPicture.lastPicture),
            }),
          },
        }
      : {};
  const kept = await keepTheCapture(
    keptFolder,
    { ...record, ...waited, ...noPicture },
    installed ? target : undefined
  );
  return { answer, record, picture, port, discover, kept };
}

/** The last kept run of the scene set against this answer; nothing for an ending the comparison does not cover. */
function changeSinceLastKept(answer: SceneCaptureResult, sceneId: string) {
  const now = lastRunOf(answer);
  return now ? changeSinceLastKeptRun(getCwd(), sceneId, now) : {};
}

/** The folder one capture is kept in; a folder that cannot be made keeps nothing and changes no ending. */
export function openCapture(id: string): NewCapture | undefined {
  try {
    return newCapture(getCwd(), id);
  } catch {
    return undefined;
  }
}

/** Keep the record and the device the capture ran on beside the picture; false when nothing could be kept. */
export async function keepTheCapture(
  keptFolder: NewCapture | undefined,
  record: unknown,
  target: SceneTarget | NoTarget | undefined
): Promise<boolean> {
  if (!keptFolder) return false;
  try {
    const device = target && isTarget(target) ? await readLocalDevice(target.device) : undefined;
    keepCapture(keptFolder, { record, device });
    return true;
  } catch {
    // A capture that could not be kept leaves no half-made folder (and no marker) behind.
    dropCapture(keptFolder);
    return false;
  }
}

/** The device the scene's file declares; a field that is not a plain literal ends the command, naming the file. */
function sceneDeviceField(sceneId: string): SceneDeviceField | undefined {
  try {
    return deviceOfScene(getCwd(), sceneId);
  } catch (error) {
    return throwError({ message: error instanceof Error ? error.message : String(error) });
  }
}

/** Save the device's screen to `path`; a failed save is the picture's own error and changes no ending. */
export async function savePicture(device: SceneDevice, path: string): Promise<ScenePicture> {
  try {
    await saveScreenPicture(device, path);
    return { path };
  } catch (error) {
    return { path, error: error instanceof Error ? error.message : String(error) };
  }
}
