/**
 * A SCENE THAT SITS STILL ON A SCREEN, and the ending it gets. While the app has not answered its
 * scene, the command looks at the phone's screen (./screenLook); a screen that has not changed for
 * the limit is the app stuck, and waiting out the app's own patience would only say so later.
 *
 * The app's answer always wins: a scene that answers before the limit ends as the app said. The
 * ready screen is not excluded by name: a ready screen is answered within the stabilization, long
 * before the limit, so a screen still for the limit is not one.
 */
import type { SceneEnding } from '../render/capturedScene';
import type { SceneStop } from '../render/sceneStop';
import type { SceneDevice } from './deviceState';
import { lookAtScreen } from './screenLook';
import type { ScreenLook } from './screenLook';

/** How long a screen may sit still before the scene ends, and how often the screen is looked at. */
export type StillLimit = {
  /** Still with nothing loading. */
  stillMs: number;
  /** Still with something loading, such as a request pending: it is given longer. */
  loadingMs: number;
  /** The time between two looks. */
  lookEveryMs: number;
};

/** The numbers the spike on stopping early set: 10 seconds, 20 with something loading. */
export const STILL_LIMIT: StillLimit = { stillMs: 10_000, loadingMs: 20_000, lookEveryMs: 1000 };

/** A screen that sat still: how long into the wait it was found so, and what it showed. */
export type StillScreen = { afterMs: number; look: ScreenLook };

/**
 * Look at the screen until it has not changed for the limit, and answer what it showed. The wait
 * starts only once `bundleLoaded` says so: until the app's JavaScript runs the screen is the
 * bundler's loading screen, which is not the scene stuck. A look that fails is tried again at the
 * next tick. Answers nothing when `stop` is aborted first, or when the phone can give no look.
 */
export async function waitForStillScreen(
  device: SceneDevice,
  limit: StillLimit,
  stop: AbortSignal,
  bundleLoaded: () => Promise<boolean> = async () => true
): Promise<StillScreen | undefined> {
  if (device.platform !== 'android') return undefined;
  let startedAt: number | undefined;
  let seen: string | undefined;
  let sameSince = 0;
  for (;;) {
    // The first look comes after a pause: an ask the app answers at once is over before it.
    await new Promise((resolve) => setTimeout(resolve, limit.lookEveryMs));
    if (stop.aborted) return undefined;
    if (startedAt === undefined && !(await bundleLoaded())) continue;
    startedAt ??= Date.now();
    const look = await lookAtScreen(device);
    if (stop.aborted) return undefined;
    if (!look) continue;
    const now = Date.now();
    const signature = JSON.stringify([look.words, look.views]);
    if (signature !== seen) {
      seen = signature;
      sameSince = now;
    } else if (now - sameSince >= (look.loading ? limit.loadingMs : limit.stillMs)) {
      return { afterMs: now - startedAt, look };
    }
  }
}

/** What stands where the ready view is named: the watcher looks at a screen, never at the scene's file. */
const READY_VIEW_NOT_KNOWN = 'the scene waits for';

/** How many of the first words on a screen name the place the app stopped. */
const PLACE_WORDS = 3;

/**
 * Where the app stopped, as far as a look can tell: the route is known only to the app, which has
 * not answered, so the first words on the screen stand for it, and a screen with none is said so.
 */
function placeOf(look: ScreenLook): string[] {
  if (look.permission) return [`the ${look.permission} permission dialog`];
  return look.words.length > 0 ? look.words.slice(0, PLACE_WORDS) : ['a blank screen'];
}

/**
 * The ending of a scene whose screen sat still: never reached, with where the app stopped. A system
 * permission dialog covers it, naming the permission; a screen that drew no views is blank; any
 * other screen is the app on another screen than the ready one.
 */
export function endingOfStillScreen(
  sceneId: string,
  still: StillScreen
): Extract<SceneEnding, { kind: 'never-reached' }> & { permission?: string } {
  const { words, views, permission } = still.look;
  const screen = { words, views };
  const stop: SceneStop = permission
    ? { kind: 'covered', early: { afterMs: still.afterMs, stuckOn: 'consent' }, screen }
    : views === 0
      ? { kind: 'blank', screen }
      : { kind: 'on-another-screen', screen };
  return {
    kind: 'never-reached',
    sceneId,
    ready: READY_VIEW_NOT_KNOWN,
    stayedOn: placeOf(still.look),
    stop,
    ...(permission && { permission }),
  };
}
