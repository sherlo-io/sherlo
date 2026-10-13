/**
 * STORYBOOK'S OWN FIELDS: the one file of the SDK that reads a field of Storybook's that starts
 * with an underscore.
 *
 * Everything else the SDK knows of Storybook it takes from what Storybook's public start() was
 * handed (./storybookFacts), and adds through one public annotation (./sherloAnnotation). What is
 * left has no public way in Storybook 8, 9 and 10 alike, so it is read here and only here, which
 * makes this the one file to look at when a Storybook upgrade moves a field:
 *
 * - Storybook's channel, the line its own events travel on.
 * - Whether Storybook has picked a story of its own yet, and whether it has named the one it looks
 *   for (`sherlo open` waits for that pick, ../openStoryChannel).
 *
 * No read here throws. A read that finds nothing answers with an error that names the Storybook
 * version, so whoever asked can say so instead of crashing the app.
 *
 * The event names that travel on the channel are not imported from Storybook's core package: it is
 * only a peer dependency of `@storybook/react-native`, and is not sure to be reachable from here.
 */
import type { StorybookChannel } from '../sealedCore/seam';

/** What a read of Storybook's own fields found: the value, or why there is none. */
export type StorybookRead<T> = { value: T; error: null } | { value: null; error: string };

/** The Storybook this launch started, as Sherlo's start wrapper hands it over. */
let startedStorybook: { view: unknown; version: string } | null = null;

/**
 * Keep the view Storybook's start() returned, and the version of `@storybook/react-native` the
 * bundle was built with, for the reads below.
 */
export function keepStartedStorybook(view: unknown, version: string): void {
  startedStorybook = { view, version };
}

/**
 * Storybook's channel. Read off the view first and the global last: turning Storybook's websockets
 * on swaps the view's channel for the socket's, and leaves the global on the old one.
 */
export function readStorybookChannel(
  view: unknown = startedStorybook?.view
): StorybookRead<StorybookChannel> {
  return guardedRead("Storybook's channel", () => {
    const storybookView = view as
      | { _channel?: unknown; _preview?: { channel?: unknown } }
      | undefined;
    const candidate =
      storybookView?._channel ??
      storybookView?._preview?.channel ??
      (globalThis as { __STORYBOOK_ADDONS_CHANNEL__?: unknown }).__STORYBOOK_ADDONS_CHANNEL__;

    return isChannel(candidate) ? candidate : NOT_THERE;
  });
}

/** The id of the story Storybook has on screen, or null while it has not picked one yet. */
export function readStorybooksCurrentStory(view: unknown): StorybookRead<string | null> {
  return guardedRead('the story Storybook shows', () => {
    const preview = previewOf(view);
    if (!preview) return NOT_THERE;
    const selection = preview.currentSelection as { storyId?: string } | null | undefined;
    return selection?.storyId ?? null;
  });
}

/** Whether Storybook has named the story it looks for as it starts. */
export function readWhetherStorybookNamedItsStory(view: unknown): StorybookRead<boolean> {
  return guardedRead('the story Storybook looks for', () => {
    const selectionStore = previewOf(view)?.selectionStore as
      | { selectionSpecifier?: unknown }
      | undefined;
    if (!selectionStore) return NOT_THERE;
    return Boolean(selectionStore.selectionSpecifier);
  });
}

/* ========================================================================== */

/** What a read answers when the field it reads is not on Storybook. */
const NOT_THERE = Symbol('not there');

type StorybookPreview = { currentSelection?: unknown; selectionStore?: unknown };

function previewOf(view: unknown): StorybookPreview | undefined {
  return (view as { _preview?: StorybookPreview } | undefined)?._preview;
}

/**
 * Run one read of Storybook's fields. A read that finds nothing, or throws, answers with an error
 * naming the Storybook version.
 */
function guardedRead<T>(what: string, read: () => T | typeof NOT_THERE): StorybookRead<T> {
  try {
    const found = read();
    if (found !== NOT_THERE) return { value: found, error: null };
    return { value: null, error: `Sherlo found no ${what} in ${storybookNamed()}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      value: null,
      error: `Sherlo could not read ${what} in ${storybookNamed()}: ${message}`,
    };
  }
}

/** Storybook for React Native, with the version Sherlo's start wrapper handed over. */
function storybookNamed(): string {
  return `@storybook/react-native ${startedStorybook?.version ?? 'unknown'}`;
}

function isChannel(candidate: unknown): candidate is StorybookChannel {
  const channel = candidate as Partial<StorybookChannel> | undefined;
  return (
    typeof channel?.on === 'function' &&
    typeof channel?.off === 'function' &&
    typeof channel?.emit === 'function'
  );
}

/** Test-only: forget the started Storybook between tests. */
export function __resetStartedStorybookForTests(): void {
  startedStorybook = null;
}
