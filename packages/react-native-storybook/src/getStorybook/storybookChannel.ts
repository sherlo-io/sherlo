/**
 * STORYBOOK'S CHANNEL, read off the Storybook `view`: the one line Storybook's own events travel on.
 *
 * It stays open, in the SDK, because a person's Storybook reads it to turn on the mocks of the story
 * they select (./interactiveMockActivation), and mocking never depends on the sealed core. The core
 * reads it through its host (../sealedCore/seam) when it waits for a story to render.
 *
 * The channel is read directly off the view (`view._channel`, with `view._preview.channel` and the
 * `global.__STORYBOOK_ADDONS_CHANNEL__` global as fallbacks). The event names that travel on it are
 * not imported from `@storybook/core-events` / `storybook/internal`: the core `storybook` package is
 * only a peer dependency of `@storybook/react-native` and is not guaranteed to be resolvable from
 * this SDK. They are part of Storybook's stable cross-version wire protocol (8.x and 9.x alike).
 */

/**
 * As much of the Storybook channel as Sherlo uses. `emit` is how a story asked for from outside is
 * put on screen (../openStoryChannel); the readiness tracker only listens.
 */
export type StorybookChannel = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
};

/** The Storybook channel of a `view`, or null when nothing usable is reachable. */
export function getStorybookChannel(view?: unknown): StorybookChannel | null {
  const v = view as { _channel?: unknown; _preview?: { channel?: unknown } } | undefined;
  const candidate =
    v?._channel ??
    v?._preview?.channel ??
    (globalThis as { __STORYBOOK_ADDONS_CHANNEL__?: unknown }).__STORYBOOK_ADDONS_CHANNEL__;

  if (
    candidate &&
    typeof (candidate as StorybookChannel).on === 'function' &&
    typeof (candidate as StorybookChannel).off === 'function' &&
    typeof (candidate as StorybookChannel).emit === 'function'
  ) {
    return candidate as StorybookChannel;
  }
  return null;
}
