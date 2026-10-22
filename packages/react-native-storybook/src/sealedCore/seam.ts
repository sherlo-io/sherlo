/**
 * THE SEAM: the one open contract between the SDK and its sealed cores.
 *
 * The JS core imports nothing. Everything it reaches, it reaches through the host the SDK hands its
 * `install`, and this file is where that host is typed. sherlo-runner keeps a copy of this file,
 * byte for byte, and types the core's source against it: the seam hash a core is stored under is
 * the sha256 of this file. So this file imports nothing either, and every type it names is
 * declared here. A change here is a change of the seam: it needs a new core built against it, and
 * a change of shape raises the seam number on both sides (SEAM_THIS_SDK_SPEAKS in
 * ./loadSealedCore, the seam number each core states, and SUPPORTED_SEAM in both native loaders).
 *
 * The SDK's own modules import these types from here; they do not declare them again. So does
 * every party to the app's connection: each message that crosses it is typed here, once.
 *
 * Nothing here runs, except the constants that say which protocol the connection speaks and what
 * the C core's JNI face on Android must answer to.
 */

/* ---- The core and its host ------------------------------------------------------------------ */

/** A network request no mock rule answered. */
export type UnansweredRequest = { method: string; url: string };

export type SealedCoreHost = {
  /** Sherlo's native module: the calls of it the core makes. */
  native: NativeCalls;
  /** The driver's two lines: a protocol message it answers, and a log line it reads. */
  runner: { send: SendFn; log: LogFn };
  /** The address of the bundler the app's JavaScript came from, or null in a built app. */
  bundlerOrigin: () => string | null;
  /** The errors stories threw, by story id. */
  storyErrors: {
    read: (storyId: string) => StoryError | undefined;
    clear: (storyId: string) => void;
    /** The words Sherlo's error boundary draws in place of a story that threw. */
    fallbackText: string;
  };
  /** What Storybook's start() was handed, or null in a launch where Storybook has not started. */
  storybookFacts: () => StorybookFacts | null;
  /** Storybook's channel, or null when nothing usable is reachable. */
  storybookChannel: () => StorybookChannel | null;
  /** Turn on one story's mocks; a promise while some are still installing, else null. */
  activateMocksForStory: (storyId: string | undefined) => Promise<void> | null;
  /**
   * The app's own modules the current story's screen ran as real code, as paths from the project
   * root. Nothing outside a capture; a module the story mocks is never in it. Read once per capture.
   */
  stillRealModulesOfStory?: () => string[];
  /** The requests the current story made that no mock rule answered, in the order made. */
  unansweredRequestsOfStory?: () => UnansweredRequest[];
  /** Put every mocked module, the clock, the randomness and the network back the way they are. */
  clearMocks: () => void;
  /** One story's mocks from its project's, its file's and its own, the most specific winning. */
  mergeStoryMocks: (
    global?: OpaqueStoryMocks,
    meta?: OpaqueStoryMocks,
    story?: OpaqueStoryMocks
  ) => OpaqueStoryMocks;
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
  /** The core's own version. */
  version: string;
  /** The number of the contract this core speaks. */
  seam: number;
  /** Called once by the SDK, with everything the core may reach. */
  install: (host: SealedCoreHost) => void;

  /** The app's views, read off each fiber generation and merged, the current one winning. */
  mergeGenerations: (roots: WalkedFiber[]) => Metadata;

  /**
   * A run's first launch: list every story from the Storybook facts, keep the ones the run asked
   * for, and send them to the runner. A launch that already has a story does nothing.
   */
  startTestSession: () => Promise<void>;
  /**
   * A launch with a story: wait until it is ready, report it, and report every further part of a
   * tall screen the runner asks for. A launch with no story does nothing. Never throws.
   */
  testStory: (story: {
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
  startCaptureTransport: (start: { channel: StorybookChannel; capture: CaptureTransport }) => void;
  /** Stop waiting for captures. */
  stopCaptureTransport: () => void;
  /**
   * `sherlo open`: wait on the bundler's letterbox through `letterbox`, the road the SDK hands in,
   * and put every story it hands over on screen. A second start while one is collecting does
   * nothing.
   */
  startOpenStoryChannel: (start: {
    channel: StorybookChannel;
    atTheStoryBrowser: boolean;
    letterbox: BundlerLetterbox;
  }) => void;
  /** Stop waiting on the letterbox. */
  stopOpenStoryChannel: () => void;
  /**
   * Storybook's default setup, a launch in default mode: the app's own entry runs and no Storybook
   * is loaded, so the core waits on both of the bundler's roads, `letterbox` for `sherlo open` and
   * `capture` for `sherlo capture`, as the app.
   */
  startWaitingAsTheApp: (start: { letterbox: BundlerLetterbox; capture: CaptureTransport }) => void;
};

declare global {
  var __SHERLO_CORE__: SealedCore | undefined;
}

/* ---- The native calls ----------------------------------------------------------------------- */

/** The calls of Sherlo's native module the core makes, as the SDK wraps them. */
export interface NativeCalls {
  getMode: () => 'default' | 'storybook' | 'testing';
  /** Throws when there is no config.sherlo on disk - use getConfigOrDefault where that is normal. */
  getConfig: () => Config;
  /** The app's own config, or the SDK's defaults when there is none. Never throws. */
  getConfigOrDefault: () => Config;
  getLastState: () => LastState | undefined;
  getInspectorData: () => Promise<InspectorData>;
  /** Restart into testing mode, landing on `storyId` when it is given, carrying `config` along. */
  openTesting: (storyId: string | undefined, config: Config) => void;
  openStorybook: () => void;
  /**
   * Start the app's JavaScript again in the same process. The connection stays open, and the mode
   * and the story native code keeps are read again by the JavaScript that starts.
   */
  reloadJavaScript: () => void;
  /**
   * The memory the app's process uses, in MB, as native code measures it (iOS phys_footprint,
   * Android total PSS); null when native code cannot measure it.
   */
  getMemoryMb: () => Promise<number | null>;
  stabilize: (
    requiredMatches: number,
    minScreenshotsCount: number,
    intervalMs: number,
    timeoutMs: number,
    saveScreenshots: boolean,
    threshold: number,
    includeAA: boolean
  ) => Promise<boolean>;
  /** Resolve on the next real frame commit, or false once timeoutMs passed first. */
  awaitFrameCommit: (timeoutMs: number) => Promise<boolean>;
  isScrollable: () => Promise<{
    scrollable: boolean;
    scrollViewFrame?: ScrollViewFrame;
  }>;
  scrollToCheckpoint: (
    index: number,
    offset: number,
    maxIndex: number
  ) => Promise<{
    reachedBottom: boolean;
    appliedIndex: number;
    appliedOffsetPx: number;
    viewportPx: number;
    contentPx: number;
    scrollViewFrame?: ScrollViewFrame;
  }>;
}

/** Where the story's scroll view sits on screen, in pixels. */
export type ScrollViewFrame = { x: number; y: number; width: number; height: number };

/** The run's settings, as native code hands them over: what the runner's `config` carried. */
export type Config = {
  stabilization: {
    requiredMatches: number;
    minScreenshotsCount: number;
    intervalMs: number;
    timeoutMs: number;
    threshold: number;
    includeAA: boolean;
    saveScreenshots?: boolean;
  };
  easUpdateDeeplink?: string;
  initialStoryRenderDelayMs?: number;
  /**
   * Story-readiness + native-paint-barrier knobs.
   *
   * All optional: an OLD runner that omits them, paired with this SDK, still
   * works because every value falls back to a default the core
   * holds.
   */
  /**
   * When STORY_RENDERED is not received in time (or no Storybook channel is
   * reachable), wait this many ms before the first stabilize for SCROLLABLE
   * snapshots. Default 3000.
   */
  scrollableFallbackDelayMs?: number;
  /**
   * How long to wait for Storybook core's STORY_RENDERED event before giving up
   * and using the scrollable fallback. Default 5000.
   */
  storyRenderedTimeoutMs?: number;
  /**
   * Cap for the native paint barrier (awaitFrameCommit). On timeout the SDK
   * warns and proceeds (best-effort catch-up); the stability loop still runs
   * afterwards. Default 1000.
   */
  paintBarrierTimeoutMs?: number;
  /**
   * Re-run the paint barrier before each post-scroll stabilize, not just the
   * initial one. Default true.
   */
  paintBarrierPerScrollPart?: boolean;
  /**
   * When set, launches the app in interactive storybook-UI mode (not testing).
   * Used for manual inspection of stories. The runner never sets this; humans/devtools do.
   */
  inspect?: {
    initialStoryId?: string;
  };
  discoveryFilter?: {
    includeStoryIds?: string[];
  };
};

/** The story the runner handed this launch, and the request it answers. */
export type LastState = {
  nextSnapshot: Snapshot;
  requestId: string;
};

export type InspectorDataNode = {
  id: number;
  className: string;
  isVisible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  adjustedWidth?: number;
  adjustedHeight?: number;
  properties?: Record<string, any>;
  children?: InspectorDataNode[];
};

export type InspectorData = {
  viewHierarchy: InspectorDataNode;
  density: number;
  fontScale: number;
};

/* ---- The core's lines to the runner --------------------------------------------------------- */

export type LogFn = (key: string, parameters?: Record<string, any>) => void;

/**
 * Send one message the core writes, and resolve with what the runner answers about the story: a
 * scroll to its next part, or the next story. Native code acts on a story itself, by reloading the
 * JavaScript, so a core rarely lives to read one.
 */
export type SendFn = (
  message: StartProtocolItem | RequestSnapshotProtocolItem
) => Promise<ScrollMessage | StoryMessage>;

/** A run's first launch: every story the run takes, one entry per screen mode. */
export type StartProtocolItem = {
  action: 'START';
  snapshots: Snapshot[];
};

/** One story, ready for its picture, or one further part of a tall one. */
export type RequestSnapshotProtocolItem = {
  action: 'REQUEST_SNAPSHOT';
  storyId: string;
  /**
   * The memory the app's process uses, in MB, as native code measured it. The runner restarts an
   * app past its limit before the next story; a report without it never restarts the app.
   */
  memoryMb?: number;
  error?: {
    name: string;
    message: string;
    stack: string;
    componentStack: string;
  };
  hasError?: boolean;
  inspectorData?: string;
  isStable?: boolean;
  requestId: string;
  hasNetworkImage?: boolean;
  isScrollable?: boolean;
  isAtEnd?: boolean;
  scrollOffset?: number;
  scrollViewFrame?: ScrollViewFrame;
  safeAreaMetadata?: {
    shouldAddSafeArea: boolean;
    insetBottom: number;
    insetTop: number;
  };
};

/* The runner's answers on the file road, where it writes them into the app's protocol file. */

export type AckStartProtocolItem = {
  action: 'ACK_START';
  nextSnapshot: Snapshot;
  requestId: string;
};

export type AckRequestSnapshotProtocolItem = {
  action: 'ACK_REQUEST_SNAPSHOT';
  nextSnapshot: Snapshot;
  requestId: string;
};

export type AckScrollRequestProtocolItem = {
  action: 'ACK_SCROLL_REQUEST';
  requestId: string;
  scrollIndex: number;
  offsetPx: number;
};

export type RunnerProtocolItem =
  | AckStartProtocolItem
  | AckRequestSnapshotProtocolItem
  | AckScrollRequestProtocolItem;

/* ---- The app's connection ------------------------------------------------------------------- */

/**
 * The version of the message set below. Every party says it: the app in its `hello`, and the
 * bundler's and the runner's server half, which refuse a `hello` in a version they do not speak.
 */
export const SHERLO_PROTOCOL_VERSION = 1;

/** The app's first message on every connection, said by its native code. */
export type HelloMessage = {
  action: 'hello';
  protocolVersion: number;
  /** The version of the SDK's native code. */
  nativeVersion: string;
  /**
   * The version of the SDK's JavaScript, or null when native code says hello before any
   * JavaScript exists; JS_EVAL_COMPLETE then carries it.
   */
  jsVersion: string | null;
};

/** How far the app got as it started, each said once as it gets there. */
export type LoadEventMessage =
  | { action: 'NATIVE_INIT_STARTED' }
  | { action: 'NATIVE_LOADED'; requestId?: string }
  /** `jsVersion` on the connection, for a `hello` said before the JavaScript existed. */
  | { action: 'JS_EVAL_COMPLETE'; jsVersion?: string }
  | { action: 'WITHSTORYBOOK_APPLIED' }
  | { action: 'WITHSTORYBOOK_DISABLED' }
  | { action: 'STORYBOOK_LOADED' }
  | { action: 'STORYBOOK_RENDERED'; requestId?: string };

/**
 * Which sealed core ran in this launch, as START reports it to the runner in testing mode: where
 * the JS core came from (`none` when no core ran), the JS core's version, and the C core's.
 */
export type CoreReport = {
  origin: 'shipped' | 'override' | 'none';
  version: string | null;
  cVersion: string | null;
};

/** The core's START, with the report of which core ran that the SDK adds in testing mode. */
export type StartMessage = StartProtocolItem & { core?: CoreReport };

/** An error native code caught. */
export type NativeErrorMessage = {
  action: 'NATIVE_ERROR';
  errorCode: string;
  message: string;
  data?: Record<string, unknown>;
};

/** The first uncaught error of the app's JavaScript. */
export type JsErrorMessage = {
  action: 'JS_ERROR';
  data: StoryError;
};

/** One log line, for people. */
export type LogMessage = {
  action: 'log';
  line: string;
};

/** Every message the app sends over its connection. */
export type MessageFromTheApp =
  | HelloMessage
  | LoadEventMessage
  | StartMessage
  | RequestSnapshotProtocolItem
  | NativeErrorMessage
  | JsErrorMessage
  | LogMessage;

/** The answer to `hello`: the run's settings and, in a run that swaps it, the JS core. */
export type ConfigMessage = {
  action: 'config';
  /** The run's stillness settings, and the EAS update deeplink when the run sets one. */
  settings: Config;
  /** The JS core to run in place of the one shipped in the SDK, and Sherlo's signature of it. */
  jsCore?: {
    source: string;
    /** A base64 RSA-SHA256 signature of `source`, by Sherlo's key. */
    signature: string;
  };
};

/**
 * The story to show next. Native code keeps it, reloads the JavaScript, and hands it back through
 * its last-state call as `{ nextSnapshot: { storyId, parameters }, requestId }`.
 */
export type StoryMessage = {
  action: 'story';
  storyId: StoryId;
  /** The id the story's REQUEST_SNAPSHOT answers with. */
  requestId: string;
  /** The two of the story's parameters the app draws it with: its theme, and no safe area. */
  parameters: { theme?: Record<string, unknown>; noSafeArea?: boolean };
};

/** Scroll a tall story to its next part, and report that part. */
export type ScrollMessage = {
  action: 'scroll';
  /** The story's own requestId: every part of a story answers with it. */
  requestId: string;
  scrollIndex: number;
  offsetPx: number;
};

/** Every message the app is sent over its connection. */
export type MessageToTheApp = ConfigMessage | StoryMessage | ScrollMessage;

export type StoryId = `${string}--${string}`;

export type SnapshotMode = 'deviceHeight' | 'fullHeight';

export type Snapshot = {
  // sherlo exclusive parameters
  viewId: string; // components-avatar--basic-deviceHeight
  mode: SnapshotMode; // deviceHeight
  displayName: string; // components/Avatar - Basic
  /** The story's `parameters.sherlo`, as it wrote them (the SDK's SherloParameters). */
  sherloParameters?: Record<string, any>;
  /**
   * Project-root-relative import path of the story file (e.g. "./src/Button.stories.tsx").
   * Emitted by the device so Diff Scope can map storyId → source file server-side.
   * Absent on older SDK versions; runner captures every story when missing.
   */
  importPath?: string;

  // storybook parameters
  componentId: string; // components-avatar
  componentTitle: string; // components/Avatar
  storyId: StoryId; // components-avatar--basic
  storyTitle: string; // Basic
  parameters: any;
  argTypes: any;
  args: any;
};

/* ---- Storybook and the stories -------------------------------------------------------------- */

/**
 * What Storybook's start() was handed, as plain data: the stories, their files with every
 * parameter and mock they declare, and the project's preview annotations. The core reads no field
 * of Storybook's own.
 */
export type StorybookFacts = {
  /** Every story, by id, as Storybook's exported prepareStories indexes the story files. */
  storyIndex: Record<string, StorybookIndexEntry>;
  /** Each story file's exports, by the import path the index names. */
  storyFiles: Record<string, StoryFileExports>;
  /**
   * The preview annotations start() was handed, in order, each a preview file's annotations (its
   * default export when it has one). The project's own preview is among them, with the parameters
   * and mocks of every story.
   */
  previewAnnotations: StorybookAnnotations[];
  /** The story files that threw while they loaded, each with its error. Absent when all loaded. */
  brokenFiles?: BrokenStoryFile[];
};

/**
 * A story file that threw while it loaded: its project-root-relative import path, the error, and
 * the title the bundle recorded for the file when it could be read.
 */
export type BrokenStoryFile = {
  file: string;
  title?: string;
  error: { name: string; message: string };
};

/** One story in Storybook's index. */
export type StorybookIndexEntry = {
  id: string;
  title: string;
  /** The story's display name, which also finds its export in its file. */
  name: string;
  /** Project-root-relative path of the story's file (e.g. "./src/Button.stories.tsx"). */
  importPath: string;
  tags?: string[];
};

/** A story file's exports: the default export is the file's meta, and every other a story. */
export type StoryFileExports = Record<string, StorybookAnnotations | undefined>;

/** As much of a meta, a story or a preview file as Sherlo reads: its parameters. */
export type StorybookAnnotations = { parameters?: Record<string, any>; [other: string]: unknown };

/**
 * As much of the Storybook channel as Sherlo uses. `emit` is how a story asked for from outside is
 * put on screen (the letterbox); the readiness tracker only listens.
 */
export type StorybookChannel = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
};

/**
 * A story's mocks, as its parameters declare them. The core only carries them from a story's
 * parameters to the SDK's mocking, so their shape is the SDK's (src/mocking), opaque here.
 */
export type OpaqueStoryMocks = unknown[] | Record<string, unknown>;

/** What a story threw while it rendered, as Sherlo's error boundary recorded it. */
export interface StoryError {
  name: string;
  message: string;
  stack: string;
  componentStack: string;
}

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
  mocks: OpaqueStoryMocks;
}

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

/* ---- The app's views ------------------------------------------------------------------------ */

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

/** The app's views as its renderer reads them. */
export interface Metadata {
  viewProps: ViewProps;
  texts: string[];
  /**
   * The same reading above, kept SEPARATE per fiber generation this collector walked - `fiber`
   * and its `.alternate` (see the comment on `roots` in `collectMetadata`) - CURRENT GENERATION
   * FIRST. `viewProps`/`texts` are the two MERGED across every generation, current one last, so
   * for a native tag present in both a stale entry can only ADD an entry no live view holds
   * (never reused across a story switch), never survive over what the current generation drew
   * for a tag it shares with the stale one (reused every time a view updates in place, keeping
   * its native tag). It is NOT right for "is the story ON SCREEN NOW throwing": a story that
   * threw a switch or two ago left its fallback text sitting in the merged reading forever, under
   * no tag a live inspector reading will ever match again. A caller asking that question reads
   * this instead, picking the one generation whose own testID-carrying view is still live.
   */
  generations: { viewProps: ViewProps; texts: string[] }[];
}

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

/**
 * One node of the fiber tree the app is rendered from, as much of it as naming a view reads.
 *
 * A fiber typed by a string draws a native view; any other fiber draws a component of its own,
 * which is where the names come from. The native tag on a host fiber is the id the inspector
 * reports for the same view, which is how a name finds the view that carries it.
 */
export type RenderedFiber = {
  type: unknown;
  stateNode?: unknown;
  child?: RenderedFiber | null;
  sibling?: RenderedFiber | null;
};

/** The names of the app's components that render each native view, by the view's native tag. */
export type ComponentNamesByNativeTag = Map<number, string[]>;

/* ---- The capture socket: `sherlo capture` --------------------------------------------------- */

/** What a story threw while rendering, as the app reports it to the bundler. */
export type StoryThrew = { name: string; message: string };

/**
 * How one of the capture's two waits ended: on the very first check, after re-checking one or more
 * times, or by running out its ceiling without ever seeing what it was waiting for.
 *
 * Without it, a capture that waited its whole ceiling and gave up would record the same shape as
 * one that found everything on the first check - `outcome` and `ms` are the difference reaching the
 * terminal, instead of only a tree that happens to be wrong.
 */
export type WaitOutcome = {
  outcome: 'first-check' | 'polled' | 'timed-out';
  /** How long the wait took, start to finish, in ms. */
  ms: number;
};

/**
 * WHY the capture recorded the window rather than the story - the branch the core's driver took,
 * carried out instead of thrown away.
 */
export type WindowReason =
  /**
   * The app never published ANY reading of its views, of any story, at any point the poll ran -
   * nothing rendered this app the way a run renders it. Carries when MetadataProvider - the
   * component that would have published one - first rendered in this boot, relative to when the
   * poll began, because the provider can still have rendered ONCE, earlier in this same boot, and
   * then been withdrawn (unmounted) before the poll ever started - `undefined` is that it never
   * rendered at all.
   *
   * SPLIT FROM A SINGLE `'no-metadata'` CAUSE THAT USED TO COVER THIS AND `'story-unnamed'` BOTH
   * (sherlo-capture-the-reading-never-names-the-first-story). A capture measured on a real device
   * found the app's own reading published and ANSWERING, seconds before its poll even started, and
   * still never naming the first story of the boot - a state the old single cause could not tell
   * apart from "nothing published at all", which is why ten rounds of this epic kept aiming fixes at
   * the wrong target. The two are different failures with different next steps: this one asks why
   * MetadataProvider never rendered (or was torn down); `'story-unnamed'` below asks why a reading
   * that DID exist never grew this story's testID.
   */
  | {
      cause: 'nothing-published';
      providerRenderedRelativeToPollMs?: number;
    }
  /**
   * A reading of the app's views WAS published - `collectAppMetadata()` answered with something at
   * some point the poll ran - but it never named this story. Carries the same two facts
   * `'nothing-published'` does, for the same reason: whether the reading already existed the moment
   * the poll began, and when MetadataProvider first rendered relative to that moment - both read off
   * the SAME published-but-wrong reading, not off its absence.
   */
  | {
      cause: 'story-unnamed';
      /** Whether `collectAppMetadata()` already answered with something when the poll began. */
      publishedAtPollStart: boolean;
      /**
       * How MetadataProvider's first render in this boot relates to when the poll began: positive
       * is that many ms AFTER the poll started, negative is that many ms BEFORE it, and `undefined`
       * is that the provider had not rendered at all by the time the poll gave up - which can still
       * happen here: a LATER poll check found a reading (of some prior story) that this diagnostic
       * treats as "published", even though THIS poll's own MetadataProvider render never happened.
       */
      providerRenderedRelativeToPollMs?: number;
      /**
       * The distinct testIDs the reading held at the moment the poll gave up - never this story's
       * own, since 'story-unnamed' already means it held no view carrying that one, but whatever
       * OTHER testIDs (if any) its views carried. Empty means the reading held no story's testID at
       * all - a traversal that is not finding a story's views, of any story. One or more means it
       * held a DIFFERENT story's - the app describing a different story than the one this capture
       * asked for, a selection bug wearing a metadata costume. The two are indistinguishable without
       * this, and point at different code. Capped at a handful of entries.
       */
      testIdsAtGiveUp: string[];
    }
  /** The story on screen is broken, by the registry Sherlo's own boundary fills. */
  | { cause: 'story-broken'; source: 'error-registry' }
  /**
   * The story on screen is broken, by the fallback words being on screen - and which fiber
   * generation the live-tag check read them off.
   */
  | { cause: 'story-broken'; source: 'fallback-text'; generation: 'live' | 'merged' }
  /** Metadata named the story and it was not broken, but the inspector's own tree never grew it. */
  | { cause: 'story-not-in-tree' };

/**
 * One view in the tree a capture records - everything the inspector read for it, plus what the
 * test run's own preparation matched to it.
 *
 * `components` is the names of the app's components that render this view, outermost first. No
 * names means the app did not write this view, or its bundle did not keep the names. `style` and
 * `testID` are absent for the same reason `components` can be empty: no fiber matched this view,
 * either because nothing of the app's rendered it (a native-only view above the story) or the
 * story on screen is broken, in which case a run reads none of this either.
 */
export type CapturedViewTree = {
  primitive: string;
  components: string[];
  visible: boolean;
  /** The view's box in pixels, as the native side measured it. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The same box in points - pixels divided by the device's own density, and rounded. */
  size: { width: number; height: number };
  /** The view's React style, as one object - a style array merged in order, later wins. */
  style?: Record<string, unknown>;
  testID?: string;
  /** What a text view draws - the words among the children prop of the fiber that drew it, and of
   * every nested text span it holds. Absent for a view that draws no words of its own or nested. */
  text?: string;
  /** A `TextInput`'s placeholder, a `Text`'s numberOfLines when it is set, and a view's own
   * accessibilityLabel - nothing else a fiber's props hold. */
  props?: Record<string, string | number>;
  children: CapturedViewTree[];
};

/** What the app answers about the story it was handed. */
export type CapturedAnswer =
  | {
      kind: 'captured';
      storyId: string;
      /** How the stabilization ended: settled after so long over so many frames, or gave up. */
      settled: { ms: number; frames: number } | 'timed-out';
      /**
       * Only when the story never settled: the views whose text, style or size differ between two
       * reads of its tree, each named by its innermost app component, else its primitive.
       */
      changing?: string[];
      threw?: StoryThrew;
      /** The app modules the story ran as real code. Left out when none, or the SDK cannot say. */
      stillReal?: string[];
      /** The requests no mock answered, in the order made. Left out when none. */
      unanswered?: UnansweredRequest[];
      /** How many screenfuls the story was captured in - 1 is a story that fits the screen. */
      parts: number;
      /** Whether any view in the story loads an image over the network. */
      hasNetworkImage: boolean;
      /** The device's own density and font scale - a size in pixels means nothing without them. */
      density: number;
      fontScale: number;
      tree: CapturedViewTree;
      /**
       * How the two waits a capture cannot see through the drawn screen went: the wait for the
       * app's own reading of its views to name this story, and the wait for the story's own views
       * to actually be in the inspector's tree once that reading did.
       */
      waited: {
        metadata: WaitOutcome;
        /** The same three answers, plus how many times the inspector was re-read. */
        storyViews: WaitOutcome & { rereads: number };
      };
      /**
       * What the recorded tree is rooted at - the story's own root, or the app's whole window - how
       * many nodes it holds, and, for a window, WHY (see WindowReason) - absent for a story root,
       * which is never asked why.
       */
      root: { at: 'story' | 'window'; nodeCount: number; reason?: WindowReason };
    }
  | {
      kind: 'crashed';
      storyId: string;
      error?: StoryThrew;
    };

/**
 * The stabilization numbers a capture is handed, as the runner writes them today. Every one is
 * optional here because the app falls back to its own config when a value is missing.
 *
 * threshold AND includeAA ARE HERE FOR THE SAME REASON AS THE TIMINGS. They decide whether two
 * frames count as the same frame, so they decide whether a story is reported settled or never
 * settled - the ending a developer reads. Falling back to the app's own config would be falling back
 * to the SDK's defaults on an app that has never taken a test run, which is the app a capture runs
 * on, and a capture would then call a story never-settled that the run settles.
 */
export type CaptureSettings = {
  requiredMatches?: number;
  minScreenshotsCount?: number;
  intervalMs?: number;
  timeoutMs?: number;
  threshold?: number;
  includeAA?: boolean;
};

/** What the bundler hands an app that has been waiting: the instruction to act on. */
export type CaptureInstruction = {
  /** The app is not in testing mode; restart there, and the capture waits for the app that returns. */
  restartIntoTesting?: boolean;
  /** The story to capture, sent only to an app already in testing mode. */
  storyId?: string;
  /** How to stabilize the story, sent with it. */
  settings?: CaptureSettings;
};

/** What the app asks of the bundler, and nothing else. */
export type CaptureTransport = {
  /**
   * Hold a request open at the bundler until there is a capture for this app, saying what mode it is
   * in, what stories it has, and the answer to the capture it was last handed. Resolves with an
   * empty answer when the hold ran out with nothing posted.
   */
  waitForACapture(saying: {
    mode: string;
    stories: string[] | null;
    /** The story files that failed to load; sent only when there is at least one. */
    brokenFiles?: BrokenStoryFile[];
    answer: CapturedAnswer | null;
  }): Promise<CaptureInstruction>;
};

/* ---- The letterbox: `sherlo open` ----------------------------------------------------------- */

/** What the letterbox answers an app that has been waiting. */
export type LetterboxAnswer = {
  /** The story to put on screen. Only ever sent to an app that is at the story browser. */
  storyId?: string | null;
  /** A story is waiting, and this app has to reach the story browser to collect it. */
  goToTheStoryBrowser?: boolean;
};

/** What the app asks of the letterbox, and nothing else. */
export type BundlerLetterbox = {
  /**
   * Hold a request open at the bundler until there is something for this app, saying what this app
   * has, where it is, and what is on screen now. Resolves with an empty answer when the hold ran
   * out with nothing posted.
   */
  waitForStory(saying: {
    stories: string[] | null;
    showing: string | null;
    atTheStoryBrowser: boolean;
    /** What the story named by `showing` threw while rendering, or null when it drew cleanly. */
    threw: StoryThrew | null;
  }): Promise<LetterboxAnswer>;
};

/* ---- The C core's JNI face on Android ------------------------------------------------------- */

/**
 * Every `native` method of android/.../CompiledCore.java. The C core binds its JNI entry points by
 * name (Java_io_sherlo_storybookreactnative_CompiledCore_<method>), so the C core sherlo-runner
 * builds must answer to exactly these.
 */
export const COMPILED_CORE_NATIVE_METHODS = [
  'nativeAbi',
  'nativeVersion',
  'nativeStillBegin',
  'nativeStillStep',
  'nativeStillEnd',
  'nativeScrollCandidateIsEligible',
  'nativeScrollCandidateFits',
  'nativeScrollIsScrollable',
  'nativeScrollNudgeTarget',
  'nativeScrollNudgeMoved',
  'nativeCheckpointTarget',
  'nativeCheckpointReadBack',
  'nativeInspectorHasRoom',
  'nativeInspectorIsOnScreen',
  'nativeInspectorJson',
] as const;

/**
 * The R8 rule in android/consumer-rules.pro that keeps CompiledCore and its native methods named
 * as they are in a customer's minified release build, so the C core's names still link.
 */
export const COMPILED_CORE_R8_KEEP_RULE = [
  '-keepclasseswithmembernames class io.sherlo.storybookreactnative.CompiledCore {',
  '    native <methods>;',
  '}',
].join('\n');
