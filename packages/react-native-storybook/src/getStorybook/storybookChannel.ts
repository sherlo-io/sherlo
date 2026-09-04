/**
 * Resolves the Storybook addons channel off a `view`. Split out of the (now
 * private, moved to sherlo-runner) STORY_RENDERED readiness tracker: this one
 * function is a pure `view -> channel` lookup with no capture-loop state, and
 * interactiveMockActivation.ts (public - interactive mocking is a developer-
 * path feature) needs it to subscribe to `storyChanged`.
 *
 * CHANNEL / EVENT-NAME CHOICE: read directly off the Storybook `view`
 * (`view._channel`, with `view._preview.channel` and the
 * `global.__STORYBOOK_ADDONS_CHANNEL__` global as fallbacks) rather than
 * importing from `@storybook/core-events` / `storybook/internal` - the core
 * `storybook` package is only a PEER dependency of `@storybook/react-native`
 * and is not guaranteed resolvable from this SDK.
 */
export type StorybookChannel = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
};

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
