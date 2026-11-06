/**
 * THE APP'S ANSWERS ABOUT ITS SCROLL on the local line - what `sherlo capture --scene` asks after
 * the scene is read, so the command can shoot a scene that scrolls in parts, as the cloud runner
 * does. The runner reaches the same two native calls through helpers/RunnerBridge; the local line
 * has no runner, so the bundler's line carries the asks (metro/sherloLine.js, `askTheApp`).
 *
 * `is-scrollable` is answered with the native module's own answer, and `scroll-to` moves the scene
 * to the asked position and answers where it got to. Nothing else is touched.
 */
import { onMessage, send } from './connection/appLine';
import SherloModule from './SherloModule';

let stopHearing: (() => void) | null = null;

/** Start answering the line's scroll asks; a second start while answering does nothing. */
export function startLocalScroll(): void {
  if (stopHearing) return;

  stopHearing = onMessage((heard) => {
    if (heard.action === 'is-scrollable') {
      void SherloModule.isScrollable().then((answer) =>
        send({ action: 'scroll-answer', askId: heard.askId, ...answer })
      );
    }
    if (heard.action === 'scroll-to') {
      void SherloModule.scrollToCheckpoint(heard.index, heard.offset, heard.maxIndex).then(
        (answer) => send({ action: 'scroll-answer', askId: heard.askId, ...answer })
      );
    }
  });
}

/** Stop answering. */
export function stopLocalScroll(): void {
  stopHearing?.();
  stopHearing = null;
}
