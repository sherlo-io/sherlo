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
import type { LogFn, SendFn } from '../helpers/RunnerBridge/types';
import type { StoryError } from '../getStorybook/storyErrorRegistry';
import type { Metadata } from '../getStorybook/components/TestingMode/MetadataProvider';
import type { RenderedFiber } from '../componentNames';
import type { StoryMocks } from '../mocking/mockDeclaration';
import type {
  InspectorData,
  InspectorDataNode,
  Snapshot,
  SnapshotMode,
  StoryId,
  StorybookView,
} from '../types';

export type {
  InspectorData,
  InspectorDataNode,
  Metadata,
  RenderedFiber,
  Snapshot,
  SnapshotMode,
  StoryId,
  StoryMocks,
  StorybookView,
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
  };
  /** Turn on one story's mocks; a promise while some are still installing, else null. */
  activateMocksForStory: (view: StorybookView, storyId: string | undefined) => Promise<void> | null;
  /** One story's mocks from its project's, its file's and its own, the most specific winning. */
  mergeStoryMocks: (global?: StoryMocks, meta?: StoryMocks, story?: StoryMocks) => StoryMocks;
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
