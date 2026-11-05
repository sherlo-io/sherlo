/**
 * PUT ONE SCENE (OR STORY) THROUGH THE DEVICE AND KEEP WHAT CAME OF IT, for `sherlo capture`.
 *
 * The screen is the caller's: this runs the clean device, asks the app through the capture socket,
 * saves the pictures and keeps the record, and hands the answer back for the caller to print.
 */
import { DISCOVER_OPTION, PNG_OPTION, PORT_OPTION } from '../../constants';
import { throwError } from '../../helpers';
import getCwd from '../../helpers/getCwd';
import { readPort } from '../../helpers/readPort';
import { applySceneDevice, deviceOfScene } from '../../seams/sceneDevice';
import type { SceneDeviceField } from '../../seams/sceneDevice';
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
import { dropCapture, guardCapture, keepCapture, newCapture } from '../../seams/localCaptures';
import type { NewCapture } from '../../seams/localCaptures';
import { readLocalDevice } from '../../seams/localDevice';
import { nameSendersByCode } from '../../seams/senderByCode';
import { symbolicateStacks } from '../../seams/symbolicateStack';
import type { SceneCaptureResult } from '../../seams/liveScene';
import type { ScenePicture } from '../../render/capturedScene';
import type { CaptureOptions } from './captureOptions';

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
  // The scene's own phone setup, read from its file before the device is touched.
  const field = isTarget(target) && installed ? sceneDeviceField(sceneId) : undefined;
  const restore =
    isTarget(target) && installed
      ? await prepareCleanDevice(target.device, target.app, field).catch(endOnNotDebuggable)
      : undefined;
  const pngPath = passedOptions[PNG_OPTION];
  const discover = passedOptions[DISCOVER_OPTION] === true;
  let answer: SceneCaptureResult;
  let notApplied: string[] = [];
  let picture: ScenePicture | undefined = pngPath ? { path: pngPath } : undefined;
  const startedAt = Date.now();
  try {
    if (isTarget(target) && installed) notApplied = await applySceneDevice(target, field);
    answer = installed
      ? await captureSocket().captureScene({
          sceneId,
          port,
          settings: STABILIZATION_SETTINGS,
          target,
          discover,
        })
      : { kind: 'no-app', why: 'not-installed' };
    // Each refusal's stack is read through the bundler; a request still named by no package is
    // named by the project's dependency whose code holds its host.
    if (answer.kind === 'scene' || answer.kind === 'never-reached') {
      answer = nameSendersByCode(await symbolicateStacks(answer, port), getCwd());
    }
    // The screen as the app left it: the clean device's put-back below would show the home screen.
    if (picture && answer.kind === 'scene' && isTarget(target)) {
      picture = await savePicture(target.device, picture.path);
    }
    // The kept picture is of the screen the app ended on: a scene never reached keeps where it stayed.
    // A discover capture takes no picture: it holds requests, so its scene often never gets ready by design.
    const endedOnAScreen =
      answer.kind === 'scene' || (answer.kind === 'never-reached' && !discover);
    if (keptFolder && endedOnAScreen && isTarget(target)) {
      await savePicture(target.device, keptFolder.screenPath);
    }
  } finally {
    await restore?.();
  }
  const saved = picture && !picture.error && answer.kind === 'scene' ? { png: picture.path } : {};
  const unapplied = notApplied.length > 0 ? { deviceNotApplied: notApplied } : {};
  const listed = discover ? { discover: true } : {};
  const record = { ...answer, ...saved, ...unapplied, ...listed };
  // An app that was never on the device ran on nothing, so no device is named for it.
  // The time a scene waited before giving up is kept beside its record, not printed: `--json` stays as it is.
  const waited = answer.kind === 'never-reached' ? { waitedMs: Date.now() - startedAt } : {};
  const kept = await keepTheCapture(
    keptFolder,
    { ...record, ...waited },
    installed ? target : undefined
  );
  return { answer, record, picture, port, discover, kept };
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
