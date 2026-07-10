/**
 * Interactive-mode counterpart to the testing-mode activation wired in TestingMode.tsx:
 * whenever the user picks a different story in Storybook's UI, install that story's
 * merged mock set before it renders, and clear it when Storybook is torn down.
 *
 * CHANNEL / EVENT-NAME CHOICE
 * Storybook emits `storyChanged` once a new selection settles, BEFORE the story
 * component itself renders - `storyRendered` (used by storyRenderedReadiness.ts for
 * testing-mode readiness) fires much later, after render AND play have finished. We
 * deliberately do NOT import the event name from a `storybook` core package: it is only
 * a peer dependency of `@storybook/react-native` and isn't guaranteed resolvable from
 * this SDK. The literal string is part of Storybook's stable wire protocol (8.x/9.x).
 *
 * SUBSCRIBE-EARLY
 * We attach the listener as soon as `getStorybook()` knows it is in interactive mode -
 * before the returned component tree ever renders - mirroring
 * storyRenderedReadiness.startStoryRenderedTracking. React flushes a child component's
 * effects before its parent's, so a listener attached from a hook inside the rendered
 * tree could lose the race against Storybook's own initial-selection effects; attaching
 * imperatively from getStorybook() has no such race.
 */
import { StorybookView } from '../types';
import { enumerateStories } from '../storybook/adapter';
import { activateStoryMocks, clearMocks } from '../mocking';

const STORY_CHANGED = 'storyChanged';

type StorybookChannel = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
};

let trackedChannel: StorybookChannel | null = null;
let trackedView: StorybookView | undefined;

function extractStoryId(args: unknown[]): string | undefined {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    const obj = first as { storyId?: string; id?: string };
    return obj.storyId ?? obj.id;
  }
  return undefined;
}

function handleStoryChanged(...args: unknown[]): void {
  const storyId = extractStoryId(args);
  if (!storyId || !trackedView) return;

  const storyMeta = enumerateStories(trackedView).find((story) => story.id === storyId);
  activateStoryMocks(storyMeta?.mocks ?? {});
}

/**
 * Attach the story-change listener. Idempotent: only the first usable channel is
 * bound, subsequent calls are no-ops - safe to call once from getStorybook().
 */
export function startInteractiveMockActivation(
  view: StorybookView,
  channel: StorybookChannel | null
): void {
  if (trackedChannel || !channel) return;
  trackedChannel = channel;
  trackedView = view;
  channel.on(STORY_CHANGED, handleStoryChanged as (...args: unknown[]) => void);
}

/** Call when Storybook is torn down / left: stop tracking and clear the active mock set. */
export function stopInteractiveMockActivation(): void {
  if (trackedChannel) {
    try {
      trackedChannel.off(STORY_CHANGED, handleStoryChanged as (...args: unknown[]) => void);
    } catch {
      // best effort
    }
  }
  trackedChannel = null;
  trackedView = undefined;
  clearMocks();
}

/** Test-only: reset the singleton tracker between unit tests. */
export function __resetInteractiveMockActivationForTests(): void {
  trackedChannel = null;
  trackedView = undefined;
}
