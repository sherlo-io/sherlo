/**
 * THE RED ERROR SCREEN IS AN ERROR: a fatal error React Native's global handler is handed during a
 * scene puts its red screen up, which a settle rule reads as a still screen. The watch keeps that
 * error as the scene's own (./getStorybook/storyErrorRegistry), so the scene answers it as thrown
 * and never as ready: an error beats a ready answer (./storyReady).
 */
import { recordStoryError } from './getStorybook/storyErrorRegistry';

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler?: () => ErrorHandler | undefined;
  setGlobalHandler?: (handler: ErrorHandler) => void;
};

/** The scene a fatal error now belongs to; the handler is put in once and reads this. */
let watchedSceneId: string | undefined;
let installedOver: ErrorUtilsLike | undefined;

/** A fatal error from now on is the error of scene `sceneId`. Puts the handler in on first use. */
export function watchForFatalError(sceneId: string): void {
  watchedSceneId = sceneId;
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils?.setGlobalHandler || installedOver === utils) return;
  installedOver = utils;
  const previous = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error, isFatal) => {
    if (isFatal && watchedSceneId) {
      const thrown = error instanceof Error ? error : new Error(String(error));
      recordStoryError(watchedSceneId, {
        name: thrown.name,
        message: thrown.message,
        stack: thrown.stack ?? '',
        componentStack: '',
      });
    }
    previous?.(error, isFatal);
  });
}
