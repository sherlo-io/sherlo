/**
 * THE APP'S ANSWER TO AN EDIT MADE WITH A SCENE OPEN on the local line. `sherlo open --scene` leaves
 * the scene on the phone; when Metro then sees an edit, the bundler's line tells the app to reload
 * (metro/sherloLine.js, `reloadTheOpenSceneAfterAnEdit`). The app starts its JavaScript again, which
 * fetches the edited code and boots the same scene, because the mode and the scene native code keeps
 * survive a reload. The line hands the scene again once the new JavaScript waits.
 *
 * The phone's log says the edit reached the app, so a screen that still shows the old code names
 * which side it stopped on.
 */
import { logTheLine, onMessage } from './connection/appLine';
import SherloModule from './SherloModule';

let stopHearing: (() => void) | null = null;

/** Start reloading when the line says an edit was made; a second start while hearing does nothing. */
export function startReloadingAfterAnEdit(): void {
  if (stopHearing) return;

  stopHearing = onMessage((heard) => {
    if (heard.action !== 'reload-after-edit') return;
    logTheLine(`scene ${heard.sceneId} reloaded after an edit`);
    SherloModule.reloadJavaScript();
  });
}

/** Stop hearing. */
export function stopReloadingAfterAnEdit(): void {
  stopHearing?.();
  stopHearing = null;
}
