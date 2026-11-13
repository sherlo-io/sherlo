/**
 * A SCREEN THAT NEVER SETTLED: the ready rule matched, yet the screen kept moving until the settle
 * limit, or a field meant to be focused never took focus. The scene answers never-settled with what
 * the screen still showed: the views changing and the fields still waiting for focus (the picture
 * is the one taken at the limit). Time here is counted in polls, as in ./storyReady.
 */
import { currentAppFiber } from './componentNames';
import { fieldsStillWaitingForFocus } from './focusedField';
import { readStoryError } from './getStorybook/storyErrorRegistry';
import RunnerBridge from './helpers/RunnerBridge';
import { isOnFocusedRoute, reachedRoute } from './reachedScreen';
import type { SceneNeverSettled } from './sealedCore/seam';
import { hostViewsMatching } from './tapReach';
import { lookAtViews, viewsThatChanged } from './visibleViews';

const POLL_MS = 100;
/** How long the two looks that name the changing views are apart. */
const BETWEEN_LOOKS_MS = 300;

const neverSettledByScene = new Map<string, SceneNeverSettled>();

/** What the scene's last settle recorded, or nothing when it settled. */
export function neverSettledOf(sceneId: string): SceneNeverSettled | undefined {
  return neverSettledByScene.get(sceneId);
}

/** The scene is about to settle afresh: an answer from an earlier settle no longer stands. */
export function forgetNeverSettled(sceneId: string): void {
  neverSettledByScene.delete(sceneId);
}

/**
 * Wait until every auto-focused field holds focus, for at most `limitMs`. Resolves the names of
 * the fields still waiting when the limit passed (empty when none waits), and how long it waited:
 * the settle that follows has only the rest of the limit.
 */
export async function waitForFocusedField(
  limitMs: number
): Promise<{ unfocused: string[]; waitedMs: number }> {
  let waitedMs = 0;
  for (;;) {
    const waiting = fieldsStillWaitingForFocus();
    if (waiting.length === 0 || waitedMs >= limitMs) return { unfocused: waiting, waitedMs };
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    waitedMs += POLL_MS;
  }
}

/**
 * Keep the never-settled answer of the scene: the video views on screen, then the views that moved
 * between two looks. A video's frames change where no view does, so the looks alone miss it.
 */
export async function keepNeverSettled(sceneId: string, unfocused: string[]): Promise<void> {
  const before = await lookAtViews();
  await new Promise((resolve) => setTimeout(resolve, BETWEEN_LOOKS_MS));
  const moved = viewsThatChanged(before, await lookAtViews());
  const changing = [...new Set([...videoViewsOnScreen(), ...moved])];
  neverSettledByScene.set(sceneId, { route: reachedRoute(), changing, unfocused });
}

/**
 * The scene's settle ran out of time: its route is kept with only the video views on screen named,
 * read from the app's tree alone, as the looks that ask the native side were not taken.
 */
export function keepNeverSettledUnlooked(sceneId: string): void {
  neverSettledByScene.set(sceneId, {
    route: reachedRoute(),
    changing: videoViewsOnScreen(),
    unfocused: [],
  });
}

/** A native view class that plays video, by its name: its frames move while the tree holds still. */
const VIDEO_CLASS = /video/i;

/** An Expo module's view, which the class names by its module: ViewManagerAdapter_ExpoVideo_VideoView. */
const EXPO_ADAPTER = /^ViewManagerAdapter_([A-Za-z0-9]+)/;

/** The number an Expo view's class ends in, new with each build: ViewManagerAdapter_ExpoVideo_VideoView_7906577109235659898. */
const BUILD_NUMBER_SUFFIX = /_\d+$/;

/** The package that registers a video view class, by the class or by the Expo module it adapts. */
const PACKAGE_OF_VIDEO_CLASS: Record<string, string> = {
  RCTVideo: 'react-native-video',
  ExpoVideo: 'expo-video',
};

/**
 * The video views on the focused screen, each as its native class and, where it is known, the
 * package that registered it: `ViewManagerAdapter_ExpoVideo_VideoView from expo-video`. Once each.
 */
function videoViewsOnScreen(): string[] {
  const root = currentAppFiber();
  if (!root) return [];
  const videos = hostViewsMatching(
    root,
    (fiber) => VIDEO_CLASS.test(String(fiber.type)) && isOnFocusedRoute(fiber)
  );
  return [
    ...new Set(
      videos.map((fiber) => {
        const nativeClass = String(fiber.type).replace(BUILD_NUMBER_SUFFIX, '');
        const owner =
          PACKAGE_OF_VIDEO_CLASS[nativeClass] ??
          PACKAGE_OF_VIDEO_CLASS[EXPO_ADAPTER.exec(nativeClass)?.[1] ?? ''];
        return owner ? `${nativeClass} from ${owner}` : nativeClass;
      })
    ),
  ];
}

/**
 * The longest a scene's whole stillness check may take, on a real timer (never the mocked clock).
 * Above ready (30 s) and settle (20 s), below the 45 s the runner waits for a snapshot request.
 */
const SCENE_STILLNESS_CAP_MS = 35_000;

/**
 * `settling`, unless it outlasts SCENE_STILLNESS_CAP_MS: then false, as a settle that ran out of
 * time answers. The scene is kept as never settled with its route and no views named, as none were
 * looked at (the read that hung may be among them). A late end of `settling` changes nothing.
 */
export function cappedAtTheSceneLimit(
  sceneId: string,
  settling: Promise<boolean>
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const cap = setTimeout(() => {
      if (!readStoryError(sceneId)) keepNeverSettledUnlooked(sceneId);
      RunnerBridge.log('scene stillness check capped', { storyId: sceneId });
      resolve(false);
    }, SCENE_STILLNESS_CAP_MS);
    settling.then(
      (settled) => {
        clearTimeout(cap);
        resolve(settled);
      },
      (error) => {
        clearTimeout(cap);
        reject(error);
      }
    );
  });
}
