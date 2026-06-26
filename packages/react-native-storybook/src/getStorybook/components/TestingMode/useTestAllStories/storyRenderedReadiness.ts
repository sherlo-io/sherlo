/**
 * STORY_RENDERED readiness tracker (SHERLO-1497).
 *
 * WHY THIS EXISTS
 * The old readiness gate waited only for the storyId substring to appear in the
 * committed React fiber tree. That commit happens one frame BEFORE the GPU
 * paints the content, so under load the native screenshot read the previous
 * surface (a blank, or a residual loading spinner small enough to look "stable").
 *
 * Storybook core's StoryRender phase machine emits the `storyRendered` event in
 * its "completed" phase - after loaders, render AND play have finished. Waiting
 * for that event (matched by EXACT storyId) is a far stronger readiness signal
 * than a substring match on the tree.
 *
 * TWO REACT-NATIVE QUIRKS THIS HANDLES
 *  (a) The event can fire BEFORE useTestStory mounts its listener. We attach an
 *      early module-level listener (startStoryRenderedTracking, called from
 *      getStorybook) that buffers the last-rendered storyId, so a story that
 *      rendered before useTestStory ran is not missed.
 *  (b) `storyRendered` still resolves ~one frame before the pixels hit the
 *      screen. The native paint barrier (SherloModule.awaitFrameCommit) closes
 *      that final gap; this module only covers logical readiness.
 *
 * CHANNEL / EVENT-NAME CHOICE (design decision 1)
 * The channel is read directly off the Storybook `view` (`view._channel`, with
 * `view._preview.channel` and the `global.__STORYBOOK_ADDONS_CHANNEL__` global as
 * fallbacks). We deliberately do NOT `import` the event name from
 * `@storybook/core-events` / `storybook/internal`: the core `storybook` package
 * is only a PEER dependency of `@storybook/react-native` and is not guaranteed to
 * be resolvable from this SDK (it isn't in our own dev tree). The event-name
 * strings below are part of Storybook's stable cross-version wire protocol, so a
 * literal is both safer and version-agnostic (works on 8.x and 9.x alike).
 */

// Storybook core wire-protocol event names (stable across 8.x / 9.x).
const STORY_RENDERED = 'storyRendered';

/** Minimal shape of the Storybook channel we rely on. */
type StorybookChannel = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
};

type Waiter = (storyId: string) => void;

// Module-level singleton state. Storybook has exactly one channel per app, so a
// single tracker is the right granularity.
let trackedChannel: StorybookChannel | null = null;
let lastRenderedStoryId: string | undefined;
const waiters = new Map<string, Set<Waiter>>();

/**
 * STORY_RENDERED is emitted by Storybook core either as `emit(STORY_RENDERED, id)`
 * (string payload, the common case) or with an object payload. Normalise both.
 */
function extractStoryId(args: unknown[]): string | undefined {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    const obj = first as { storyId?: string; id?: string };
    return obj.storyId ?? obj.id;
  }
  return undefined;
}

function handleStoryRendered(...args: unknown[]): void {
  const storyId = extractStoryId(args);
  if (!storyId) return;

  lastRenderedStoryId = storyId;

  const list = waiters.get(storyId);
  if (list) {
    waiters.delete(storyId);
    list.forEach((resolve) => resolve(storyId));
  }
}

/**
 * Resolve the Storybook channel from a `view`, falling back to the addons global.
 * Returns null when nothing usable is reachable (the caller then uses the
 * fallback-delay path).
 */
export function getStorybookChannel(view?: unknown): StorybookChannel | null {
  const v = view as { _channel?: unknown; _preview?: { channel?: unknown } } | undefined;
  const candidate =
    v?._channel ??
    v?._preview?.channel ??
    (globalThis as { __STORYBOOK_ADDONS_CHANNEL__?: unknown }).__STORYBOOK_ADDONS_CHANNEL__;

  if (
    candidate &&
    typeof (candidate as StorybookChannel).on === 'function' &&
    typeof (candidate as StorybookChannel).off === 'function'
  ) {
    return candidate as StorybookChannel;
  }
  return null;
}

/**
 * Attach the early buffering listener. Idempotent: only the first usable channel
 * is bound, subsequent calls are no-ops. Safe to call from getStorybook (early)
 * and again lazily from useTestStory. Returns true if a channel is now tracked.
 */
export function startStoryRenderedTracking(channel: StorybookChannel | null): boolean {
  if (trackedChannel) return true;
  if (!channel || typeof channel.on !== 'function') return false;

  trackedChannel = channel;
  channel.on(STORY_RENDERED, handleStoryRendered as (...args: unknown[]) => void);
  return true;
}

export type ReadinessPath =
  | 'story-rendered' // event arrived while we waited
  | 'story-rendered-buffered' // event had already arrived before we waited
  | 'timeout' // channel present but event never came in time
  | 'no-channel'; // no Storybook channel reachable

export type ReadinessResult = {
  path: ReadinessPath;
  rendered: boolean;
  waitedMs: number;
};

function addWaiter(storyId: string, waiter: Waiter): void {
  let set = waiters.get(storyId);
  if (!set) {
    set = new Set();
    waiters.set(storyId, set);
  }
  set.add(waiter);
}

function removeWaiter(storyId: string, waiter: Waiter): void {
  const set = waiters.get(storyId);
  if (!set) return;
  set.delete(waiter);
  if (set.size === 0) waiters.delete(storyId);
}

/**
 * Wait until Storybook reports the EXACT target story rendered, or until
 * timeoutMs elapses. Checks the early-render buffer first so a story that
 * rendered before this call still resolves immediately.
 */
export async function waitForStoryRendered({
  storyId,
  timeoutMs,
  channel,
}: {
  storyId: string;
  timeoutMs: number;
  channel: StorybookChannel | null;
}): Promise<ReadinessResult> {
  const start = Date.now();

  // Lazily bind tracking if getStorybook's early attach did not run.
  if (!trackedChannel && channel) startStoryRenderedTracking(channel);

  if (!trackedChannel) {
    return { path: 'no-channel', rendered: false, waitedMs: 0 };
  }

  // Early-render buffer: the event may have fired before we got here.
  if (lastRenderedStoryId === storyId) {
    return { path: 'story-rendered-buffered', rendered: true, waitedMs: 0 };
  }

  const rendered = await new Promise<boolean>((resolve) => {
    let settled = false;

    const onRendered: Waiter = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      removeWaiter(storyId, onRendered);
      resolve(false);
    }, timeoutMs);

    addWaiter(storyId, onRendered);
  });

  return {
    path: rendered ? 'story-rendered' : 'timeout',
    rendered,
    waitedMs: Date.now() - start,
  };
}

/** Test-only: reset the singleton tracker between unit tests. */
export function __resetStoryRenderedTrackingForTests(): void {
  if (trackedChannel) {
    try {
      trackedChannel.off(STORY_RENDERED, handleStoryRendered as (...args: unknown[]) => void);
    } catch {
      // best effort
    }
  }
  trackedChannel = null;
  lastRenderedStoryId = undefined;
  waiters.clear();
}
