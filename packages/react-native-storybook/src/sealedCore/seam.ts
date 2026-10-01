/**
 * THE SEAM: the one open contract between the SDK and its sealed JavaScript core.
 *
 * The core imports nothing. Everything it reaches, it reaches through the host the SDK hands its
 * `install`, and this file is where that host is typed. The core's source types itself against it
 * too (packages/sherlo-core/js/src/index.ts), so a change here is a change of the seam: raise the
 * seam number on both sides (SEAM_THIS_SDK_SPEAKS in ./loadSealedCore, SEAM in the core's source,
 * and SUPPORTED_SEAM in both native loaders).
 *
 * Types only: nothing here runs.
 */
import type SherloModule from '../SherloModule';
import type { LogFn, SendFn } from '../helpers/RunnerBridge/types';
import type { StoryError } from '../getStorybook/storyErrorRegistry';
import type { Metadata } from '../getStorybook/components/TestingMode/MetadataProvider';
import type { RenderedFiber } from '../componentNames';
import type { StorybookView } from '../types';

export type SealedCoreHost = {
  /** Sherlo's native module, as the SDK wraps it. */
  native: typeof SherloModule;
  /** The runner's two lines: a protocol message it answers, and a log line it reads. */
  runner: { send: SendFn; log: LogFn };
  /** The address of the bundler the app's JavaScript came from, or null in a built app. */
  bundlerOrigin: () => string | null;
  /** The errors stories threw, by story id. */
  storyErrors: {
    record: (storyId: string, error: StoryError) => void;
    read: (storyId: string) => StoryError | undefined;
    clear: (storyId: string) => void;
  };
  /** Turn on one story's mocks; a promise while some are still installing, else null. */
  activateMocksForStory: (view: StorybookView, storyId: string | undefined) => Promise<void> | null;
  /** The app's views as its renderer reads them, or nothing before the app has rendered. */
  collectAppMetadata: () => Metadata | undefined;
  /** The fiber at the top of the app's story, or nothing before it has rendered. */
  storyOfTheAppFiber: () => RenderedFiber | undefined;
  /** Plug in, or remove with `undefined`, where each log line is pushed live. */
  setCaptureLogSink: (sink: ((line: string) => void) | undefined) => void;
  /** Say something is wrong, without stopping anything. */
  warn: (message: string) => void;
  /** The app's real fetch, taken before any story's mock wraps it. */
  fetch: typeof fetch;
};

export type SealedCore = {
  /** The SDK version the core was built for. */
  version: string;
  /** The number of the contract this core speaks. */
  seam: number;
  /** Called once by the SDK, with everything the core may reach. */
  install: (host: SealedCoreHost) => void;
};

declare global {
  var __SHERLO_CORE__: SealedCore | undefined;
}
