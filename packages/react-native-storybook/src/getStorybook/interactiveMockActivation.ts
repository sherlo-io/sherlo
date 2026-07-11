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
 *
 * INITIAL STORY
 * `storyChanged` fires only on SUBSEQUENT selections - it does NOT fire for the story
 * Storybook lands on at launch. So a session that starts directly on a mocked story
 * (e.g. inspect.initialStoryId) would serve REAL values until the user navigated away
 * and back. We therefore activate the initial story's mocks IMMEDIATELY when tracking
 * starts, using the same activation path as the storyChanged handler so the two can
 * never diverge. Story- and meta-level mocks resolve synchronously; global-level mocks
 * fold in once the preview is ready - activateMocksForStory (the shared path used by
 * the testing-capture entry point too) handles both.
 */
import { StorybookView } from '../types';
import { activateMocksForStory } from './storyMockActivation';
import { clearMocks } from '../mocking';

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
  if (!trackedView) return;
  activateMocksForStory(trackedView, extractStoryId(args));
}

/**
 * Attach the story-change listener and activate the initial story's mocks.
 * Idempotent: only the first usable channel is bound, subsequent calls are no-ops -
 * safe to call once from getStorybook(). `initialStoryId` is the story Storybook lands
 * on at launch; its mocks are activated immediately because storyChanged does not fire
 * for that first selection (see INITIAL STORY above).
 */
export function startInteractiveMockActivation(
  view: StorybookView,
  channel: StorybookChannel | null,
  initialStoryId?: string
): void {
  if (trackedChannel || !channel) return;
  trackedChannel = channel;
  trackedView = view;
  channel.on(STORY_CHANGED, handleStoryChanged as (...args: unknown[]) => void);
  activateMocksForStory(view, initialStoryId);
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
