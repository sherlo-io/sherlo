/**
 * A SCENE THAT SCROLLS, SHOT WHOLE on the Mac, as the cloud runner shoots a tall story
 * (sherlo-runner src/executor/executor.ts, constants.ts, utils/getScrollViewportCount.ts): the
 * app is asked whether the scene scrolls; if it does, a picture is taken at each step of half the
 * scrolling area, to the end of the scroll, and the parts are joined (./stitchScrollParts).
 *
 * The view is moved by `scroll-to` positions the app is asked for, never by a drag: on a real
 * customer app a vertical card pager settled 148 rows apart between two drag takes (59% of rows
 * differing), while plain lists stayed under 2%. A scene is shot in two takes, and the picture is
 * the whole scroll only when both join to the same picture; otherwise it is the first screen alone,
 * and the result says so.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ScrollAsk } from '../../../react-native-storybook/metro/sherloLine';
import { askTheBundlerLine } from './bundlerLine';
import { saveScreenPicture } from './deviceState';
import type { SceneDevice } from './deviceState';
import { dedupeScrollParts, stitchScrollParts } from './stitchScrollParts';
import type { ScrollArea, ScrollPart } from './stitchScrollParts';

/** Each step moves half the scrolling area (the runner's SCROLL_STEP_PERCENTAGE). */
const SCROLL_STEP_PERCENTAGE = 0.5;

/** The scroll is cut after this many screens' height (the runner's DEFAULT_MAX_VIEWPORT_HEIGHT_PARTS). */
const MAX_SCREENS = 10;

/** Parts in a row that did not move the view end the scroll (the runner's MAX_CONSECUTIVE_NON_ADVANCING_SCROLL_PARTS). */
const MAX_STALLED_PARTS = 3;

/** How long the view is given to come to rest after it was moved, before it is shot. */
const SETTLE_MS = 500;

/** How long the app has to answer one ask about its scroll. */
const ANSWER_PATIENCE_MS = 15_000;

/** The app's answer to where the scene was moved to. */
export type ScrolledTo = { reachedBottom: boolean; appliedOffsetPx: number };

/** The two things the app is asked about its scroll; an ask that got no answer is undefined. */
export type ScrollApp = {
  isScrollable: () => Promise<{ scrollable: boolean; scrollViewFrame?: ScrollArea } | undefined>;
  /** Move the scene to `index` steps of `offset` pixels; `maxIndex` is the last position allowed. */
  scrollTo: (index: number, offset: number, maxIndex: number) => Promise<ScrolledTo | undefined>;
};

/** What one run down the scene came to. */
export type ScrollTake =
  /** The scene does not scroll, or the app did not say: the one screen shot. */
  | { kind: 'one-screen'; png: Buffer; appSilent: boolean }
  | { kind: 'parts'; parts: ScrollPart[]; area?: ScrollArea };

/** The height of a PNG, from its header. */
function heightOf(png: Buffer): number {
  return png.readUInt32BE(20);
}

/**
 * Shoot the scene from where it stands (its top), then move down it in steps of half a screen and
 * shoot again, until the app says the end is reached, the view stops moving, or ten screens' height
 * are taken. A scene that does not scroll is shot once.
 */
export async function shootScrollParts({
  app,
  shoot,
  settleMs = SETTLE_MS,
}: {
  app: ScrollApp;
  shoot: () => Promise<Buffer>;
  settleMs?: number;
}): Promise<ScrollTake> {
  const asked = await app.isScrollable();
  const first = await shoot();
  if (!asked?.scrollable) return { kind: 'one-screen', png: first, appSilent: asked === undefined };

  const area = asked.scrollViewFrame;
  const screenHeight = heightOf(first);
  const bandHeight = area?.height || screenHeight;
  const step = Math.floor(bandHeight * SCROLL_STEP_PERCENTAGE);
  // The runner's budget: ten screens' height in steps, more for an area shorter than the screen.
  const maxParts = Math.ceil((MAX_SCREENS / SCROLL_STEP_PERCENTAGE) * (screenHeight / bandHeight));

  const parts: ScrollPart[] = [{ png: first, offset: 0, index: 0 }];
  let stalled = 0;
  while (parts.length < maxParts * 2) {
    const index = parts.length;
    const moved = await app.scrollTo(index, step, maxParts);
    if (!moved) return { kind: 'one-screen', png: first, appSilent: true };
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    const advancedBefore = dedupeScrollParts(parts).length;
    parts.push({ png: await shoot(), offset: moved.appliedOffsetPx, index });
    const advanced = dedupeScrollParts(parts).length;
    stalled = advanced > advancedBefore ? 0 : stalled + 1;
    if (moved.reachedBottom || advanced >= maxParts || stalled >= MAX_STALLED_PARTS) break;
  }
  return { kind: 'parts', parts, area };
}

/** The picture of a scene: the whole scroll joined, or the first screen alone and why. */
export type WholeScroll = {
  picture: Buffer;
  /** Set when only the first screen was kept: the takes did not join to the same picture, or the app went silent. */
  firstScreenOnly?: 'takes-differ' | 'app-silent';
};

/**
 * The scene's picture as one tall picture of its whole scroll. Two takes are made, the view put back
 * at the top between them, and the picture is kept only when both join to the same picture.
 */
export async function shootWholeScroll(params: {
  app: ScrollApp;
  shoot: () => Promise<Buffer>;
  settleMs?: number;
}): Promise<WholeScroll> {
  const settleMs = params.settleMs ?? SETTLE_MS;
  const backToTop = async () => {
    await params.app.scrollTo(0, 0, 0);
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  };

  const first = await shootScrollParts(params);
  if (first.kind === 'one-screen') {
    return {
      picture: first.png,
      ...(first.appSilent && { firstScreenOnly: 'app-silent' as const }),
    };
  }
  await backToTop();
  const second = await shootScrollParts(params);
  await backToTop();

  const joined = stitchScrollParts(first.parts, first.area);
  const agree =
    second.kind === 'parts' && joined.equals(stitchScrollParts(second.parts, second.area));
  return agree
    ? { picture: joined }
    : { picture: first.parts[0].png, firstScreenOnly: 'takes-differ' };
}

/* ========================================================================== */

/** The app on the bundler's line at `port`, asked about its scroll (metro/sherloLine.js, `askTheApp`). */
export function scrollAppOnTheLine(port: number): ScrollApp {
  const ask = async (asked: ScrollAsk) => {
    const answer = await askTheBundlerLine({
      port,
      question: { action: 'askTheApp', ask: asked },
      patienceMs: ANSWER_PATIENCE_MS,
    });
    return answer.kind === 'said' && answer.reply.kind === 'answered'
      ? answer.reply.answer
      : undefined;
  };
  return {
    isScrollable: async () => {
      const answer = await ask({ action: 'is-scrollable' });
      return (
        answer && {
          scrollable: answer.scrollable === true,
          scrollViewFrame: answer.scrollViewFrame,
        }
      );
    },
    scrollTo: async (index, offset, maxIndex) => {
      const answer = await ask({ action: 'scroll-to', index, offset, maxIndex });
      return (
        answer && {
          reachedBottom: answer.reachedBottom === true,
          appliedOffsetPx: answer.appliedOffsetPx ?? 0,
        }
      );
    },
  };
}

/**
 * The whole-scroll picture of the scene on `device`, asked of the app on the bundler's line at
 * `port`; nothing when the phone gives no picture, in which case the caller's own look at the
 * screen stands.
 */
export async function wholeScrollOfTheScene(
  device: SceneDevice,
  port: number
): Promise<WholeScroll | undefined> {
  try {
    return await shootWholeScroll({
      app: scrollAppOnTheLine(port),
      shoot: () => shootTheScreen(device),
    });
  } catch {
    // The screenshot tool failed: the caller saves the screen as it stands, and reports that failure itself.
    return undefined;
  }
}

/** One picture of the device's screen, as bytes: saved to a file of its own, read, and removed. */
export async function shootTheScreen(device: SceneDevice): Promise<Buffer> {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-scroll-'));
  try {
    const file = path.join(folder, 'part.png');
    await saveScreenPicture(device, file);
    return fs.readFileSync(file);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
