/**
 * THE SEAM: the one open contract between the SDK and its sealed JavaScript core.
 *
 * The core imports nothing. Everything it reaches, it reaches through the host the SDK hands its
 * `install`, and this file is where that host is typed. The core's source types itself against it
 * too (packages/sherlo-core/js/src), so a change here is a change of the seam: raise the seam
 * number on both sides (SEAM_THIS_SDK_SPEAKS in ./loadSealedCore, SEAM in the core's source, and
 * SUPPORTED_SEAM in both native loaders).
 *
 * The core's source may import a type from this file and from nowhere else, so every SDK type it
 * reads is named here too.
 *
 * Types only: nothing here runs.
 */
import type SherloModule from '../SherloModule';
import type { Config, LogFn, SendFn } from '../helpers/RunnerBridge/types';
import type { StoryError } from '../getStorybook/storyErrorRegistry';
import type { Metadata } from '../getStorybook/components/TestingMode/MetadataProvider';
import type { RenderedFiber } from '../componentNames';
import type { StoryMocks } from '../mocking/mockDeclaration';
import type { StorybookChannel } from '../getStorybook/storybookChannel';
import type {
  CaptureInstruction,
  CaptureSettings,
  CaptureTransport,
  CapturedAnswer,
  CapturedViewTree,
  StoryThrew,
  WaitOutcome,
  WindowReason,
} from '../captureTransport';
import type { BundlerLetterbox, LetterboxAnswer } from '../openStoryChannel';
import type {
  InspectorData,
  InspectorDataNode,
  Snapshot,
  SnapshotMode,
  StoryId,
  StorybookView,
} from '../types';

export type {
  BundlerLetterbox,
  CaptureInstruction,
  CaptureSettings,
  CaptureTransport,
  CapturedAnswer,
  CapturedViewTree,
  Config,
  InspectorData,
  InspectorDataNode,
  LetterboxAnswer,
  Metadata,
  RenderedFiber,
  Snapshot,
  SnapshotMode,
  StoryId,
  StoryMocks,
  StoryThrew,
  StorybookChannel,
  StorybookView,
  WaitOutcome,
  WindowReason,
};

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
    /** The words Sherlo's error boundary draws in place of a story that threw. */
    fallbackText: string;
  };
  /** The Storybook channel of a `view`, or null when nothing usable is reachable. */
  storybookChannelOf: (view: StorybookView | undefined) => StorybookChannel | null;
  /** Turn on one story's mocks; a promise while some are still installing, else null. */
  activateMocksForStory: (view: StorybookView, storyId: string | undefined) => Promise<void> | null;
  /** Put every mocked module, the clock, the randomness and the network back the way they are. */
  clearMocks: () => void;
  /** One story's mocks from its project's, its file's and its own, the most specific winning. */
  mergeStoryMocks: (global?: StoryMocks, meta?: StoryMocks, story?: StoryMocks) => StoryMocks;
  /** The app's views as its renderer reads them, or nothing before the app has rendered. */
  collectAppMetadata: () => Metadata | undefined;
  /** When the component that publishes the app's views first rendered in this boot, if it has. */
  providerFirstRenderedAt: () => number | undefined;
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

  /** Every story the app can show: read from its story files, filled in from Storybook's index. */
  enumerateStories: (view: StorybookView) => StoryMeta[];
  /** One entry per story and screen mode: the list a run's first launch sends the runner. */
  prepareSnapshots: (stories: { storyMetas: StoryMeta[]; splitByMode?: boolean }) => Snapshot[];
  /** The inspector's tree, matched to the app's views and re-rooted at the story's own view. */
  prepareInspectorData: (
    inspectorData: InspectorData,
    fabricMetadata: Metadata,
    storyId: string
  ) => { inspectorData: InspectorData; hasNetworkImage: boolean };
  /** The app's views, read off each fiber generation and merged, the current one winning. */
  mergeGenerations: (roots: WalkedFiber[]) => Metadata;
  /** The names of the app's components that render each native view of the story on screen. */
  componentNamesByNativeTag: () => ComponentNamesByNativeTag;
  /** The word a host fiber's React type names a view by: the platform's `RCT` prefix removed. */
  primitiveOfHostType: (type: string) => string;

  /**
   * A run's first launch: list every story, keep the ones the run asked for, and send them to the
   * runner. A launch that already has a story does nothing.
   */
  startTestSession: (view: StorybookView) => Promise<void>;
  /**
   * A launch with a story: wait until it is ready, report it, and report every further part of a
   * tall screen the runner asks for. A launch with no story does nothing. Never throws.
   */
  testStory: (story: {
    view: StorybookView | undefined;
    insets: SafeAreaInsets;
    collectMetadata: () => Metadata | undefined;
  }) => Promise<void>;

  /** Listen for Storybook's rendered event from now on. True once a channel is listened to. */
  startStoryRenderedTracking: (channel: StorybookChannel | null) => boolean;

  /**
   * `sherlo capture`: wait on the bundler's capture address through `capture`, the road the SDK
   * hands in, and walk every story it asks for. A second start while one is collecting does
   * nothing.
   */
  startCaptureTransport: (start: {
    view: StorybookView;
    channel: StorybookChannel;
    capture: CaptureTransport;
  }) => void;
  /** Stop waiting for captures. */
  stopCaptureTransport: () => void;
  /**
   * `sherlo open`: wait on the bundler's letterbox through `letterbox`, the road the SDK hands in,
   * and put every story it hands over on screen. A second start while one is collecting does
   * nothing.
   */
  startOpenStoryChannel: (start: {
    view: StorybookView;
    channel: StorybookChannel;
    atTheStoryBrowser: boolean;
    letterbox: BundlerLetterbox;
  }) => void;
  /** Stop waiting on the letterbox. */
  stopOpenStoryChannel: () => void;
};

/** The screen's safe-area insets, in points. */
export type SafeAreaInsets = { top: number; bottom: number };

/** How a wait for Storybook's rendered event ended. */
export type ReadinessPath =
  | 'story-rendered' // the event arrived while it waited
  | 'story-rendered-buffered' // the event had already arrived before it waited
  | 'timeout' // a channel was there, but the event never came in time
  | 'no-channel'; // no Storybook channel was reachable

export type ReadinessResult = {
  path: ReadinessPath;
  rendered: boolean;
  waitedMs: number;
};

/** One story the core found, before it is split into one entry per screen mode. */
export interface StoryMeta {
  id: string;
  title: string;
  name: string;
  parameters: Record<string, any>;
  /**
   * Project-root-relative import path of the story file (e.g. "./src/Button.stories.tsx").
   * Used by Diff Scope to map storyId → source file without static reconstruction.
   * Sourced from _storyIndex.entries[id].importPath; derived from the require.context
   * directory + filename for the primary (titled) path.
   */
  importPath?: string;
  /**
   * Module Mocking (SHERLO-1735): the story's mocks, already merged per module across
   * global/meta/story parameters (precedence story > meta > global - see mergeStoryMocks).
   * Computed from the three RAW `parameters.sherlo.mocks` levels, not from `parameters`
   * above - that field is a shallow spread of all three levels, so a story's
   * `parameters.sherlo` replaces meta's and global's wholesale and the per-module mock
   * precedence would otherwise be lost.
   */
  mocks: StoryMocks;
}

/** What the app's fibers say about each native view, by the view's native tag. */
export type ViewProps = {
  [nativeTag: number]: {
    className?: string;
    style?: any;
    testID?: string;
    hasNetworkImage?: boolean;
    /** The words this view's own fiber draws, when it draws any - see wordsInChildren. */
    text?: string;
    /** A `TextInput`'s own placeholder, kept only for the fiber that carries one. */
    placeholder?: string;
    /** A `Text`'s own numberOfLines, kept only for the fiber that carries one. */
    numberOfLines?: number;
    /** A view's own accessibilityLabel - the only words an icon or image with no Text has. */
    accessibilityLabel?: string;
  };
};

/**
 * As much of a fiber as walking one generation reads - a structural subset of its-fine's own
 * `Fiber`, so a test can build one by hand without satisfying every field react-reconciler's own
 * type carries. Every real `Fiber` its-fine hands back already has these.
 */
export type WalkedFiber = {
  pendingProps: any;
  memoizedProps: any;
  stateNode?: any;
  type: any;
  child?: WalkedFiber | null;
  sibling?: WalkedFiber | null;
  return?: WalkedFiber | null;
  tag?: number;
};

/** The names of the app's components that render each native view, by the view's native tag. */
export type ComponentNamesByNativeTag = Map<number, string[]>;

declare global {
  var __SHERLO_CORE__: SealedCore | undefined;
}
