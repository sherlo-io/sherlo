import { NativeModules } from 'react-native';
import isExpoGo from './helpers/isExpoGo';
import { StorybookViewMode, InspectorData, ViewVisibility } from './types/types';
import type { Config, LastState } from './sealedCore/seam';
import TurboModule, { Spec } from './specs/NativeSherloModule';

interface SherloConstants {
  mode: StorybookViewMode;
  config: string;
  lastState: string;
  nativeVersion: string | null;
  /** The C core's version, read in testing mode only; null outside it, or with no usable C core. */
  compiledCoreVersion?: string | null;
}

/**
 * A run's settings come from the runner over the connection, and native code hands them over.
 * With none handed (a capture is exactly that state - see captureTransport.ts) the app falls back
 * to these, which are also the numbers the SDK answers with when it is not wired into a build at
 * all (createDummySherloModule below).
 */
const DEFAULT_CONFIG: Config = {
  stabilization: {
    requiredMatches: 3,
    minScreenshotsCount: 3,
    intervalMs: 500,
    timeoutMs: 5_000,
    saveScreenshots: true,
    threshold: 0.0,
    includeAA: true,
  },
  scrollableFallbackDelayMs: 3000,
  storyRenderedTimeoutMs: 5000,
  paintBarrierTimeoutMs: 1000,
  paintBarrierPerScrollPart: true,
};

/** What the native touch answers (../specs/NativeSherloModule `tap`). */
export type NativeTapAnswer = {
  reachedReact: boolean;
  hitTag: number;
  hitClass: string;
  missing: string[];
};

type SherloModule = {
  isTurboModule: boolean;
  /**
   * Touch the screen at (x, y), in points, for holdMs, as a finger does. Null
   * when the native module has no touch (no module, or a native build from before it).
   */
  tap: (x: number, y: number, holdMs: number) => Promise<NativeTapAnswer | null>;
  getMode: () => StorybookViewMode;
  /** Throws when the runner handed no settings - use getConfigOrDefault where that is normal. */
  getConfig: () => Config;
  /** The runner's settings, or the SDK's own when it handed none. Never throws. */
  getConfigOrDefault: () => Config;
  getLastState: () => LastState | undefined;
  getNativeVersion: () => string | null;
  /** The C core's version, in testing mode; null outside it, or with no usable C core. */
  getCompiledCoreVersion: () => string | null;
  sendNativeError: (
    errorCode: string,
    message: string,
    data?: Record<string, string | null>
  ) => void;
  getInspectorData: () => Promise<InspectorData>;
  /** Whether each view named by testID is drawn, from the native view tree (../specs). */
  getViewVisibility: (testIDs: string[]) => Promise<ViewVisibility>;
  openStorybook: () => void;
  toggleStorybook: () => void;
  /**
   * Restart into testing mode. `storyId`, when given, is the story to land the restarted app on
   * directly - a capture's first story of a session, handed over the same way a run's restart
   * always has a story to land `initialSelection` on (see captureTransport.ts). `config` rides
   * along the same restart, so the native side that comes back can produce the exact `config`/
   * `lastState` shape a run's own config.sherlo would have (see SherloModuleCore on each
   * platform) - a capture has no config.sherlo to read, so the caller hands over
   * getConfigOrDefault()'s answer, the same values the SDK already falls back to.
   */
  openTesting: (storyId: string | undefined, config: Config) => void;
  /** Start the app's JavaScript again in the same process; the connection stays open. */
  reloadJavaScript: () => void;
  /** The memory the app's process uses, in MB, or null when native code cannot measure it. */
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
  awaitFrameCommit: (timeoutMs: number) => Promise<boolean>;
  isScrollable: () => Promise<{
    scrollable: boolean;
    scrollViewFrame?: { x: number; y: number; width: number; height: number };
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
    scrollViewFrame?: { x: number; y: number; width: number; height: number };
  }>;
  notifyGetStorybookCalled: () => void;
};

let SherloModule: SherloModule;
const { SherloModule: SherloNativeModule } = NativeModules;

const module: Spec = TurboModule || SherloNativeModule;

if (module !== null) {
  SherloModule = createSherloModule();
} else {
  SherloModule = createDummySherloModule();

  if (!isExpoGo) {
    console.warn(
      '@sherlo/react-native-storybook: Sherlo native module is not accessible. Rebuild the app to link it on the native side.'
    );
  }
}

export default SherloModule;

/* ========================================================================== */

function createSherloModule(): SherloModule {
  const getConstants = (): SherloConstants => {
    const turboModuleConstants = module.getSherloConstants?.() || {};
    const nativeModuleConstants = module.getConstants?.() || {};
    return { ...turboModuleConstants, ...nativeModuleConstants } as SherloConstants;
  };

  const sherloModule: SherloModule = {
    isTurboModule: !!TurboModule,
    tap: async (x: number, y: number, holdMs: number) =>
      typeof module.tap === 'function' ? module.tap(x, y, holdMs) : null,
    getInspectorData: async () => {
      const inspectorDataString = await module.getInspectorData();
      return JSON.parse(inspectorDataString) as InspectorData;
    },
    getViewVisibility: async (testIDs: string[]) => {
      return JSON.parse(await module.getViewVisibility(JSON.stringify(testIDs))) as ViewVisibility;
    },
    stabilize: async (
      requiredMatches: number,
      minScreenshotsCount: number,
      intervalMs: number,
      timeoutMs: number,
      saveScreenshots: boolean,
      threshold: number,
      includeAA: boolean
    ) => {
      return module.stabilize(
        requiredMatches,
        minScreenshotsCount,
        intervalMs,
        timeoutMs,
        saveScreenshots,
        threshold,
        includeAA
      );
    },
    awaitFrameCommit: async (timeoutMs: number) => {
      // Graceful degradation: an OLD native binary paired with this newer JS may
      // not expose awaitFrameCommit. Treat its absence as "no barrier available"
      // (resolve false) so the capture flow continues best-effort rather than
      // throwing. The stability loop still runs afterwards.
      if (typeof (module as any).awaitFrameCommit !== 'function') {
        return false;
      }
      return (module as any).awaitFrameCommit(timeoutMs);
    },
    getMode: () => {
      return getConstants().mode;
    },
    getNativeVersion: () => {
      return getConstants().nativeVersion ?? null;
    },
    getCompiledCoreVersion: () => {
      return getConstants().compiledCoreVersion ?? null;
    },
    sendNativeError: (errorCode: string, message: string, data?: Record<string, string | null>) => {
      module.sendNativeError(errorCode, message, data ? JSON.stringify(data) : '');
    },
    getConfig: () => {
      const configString = getConstants().config;
      const config = JSON.parse(configString) as Config | undefined;
      if (!config) {
        throw new Error('Config is undefined');
      }
      return config;
    },
    getConfigOrDefault: () => {
      try {
        const config = JSON.parse(getConstants().config) as Config | undefined;
        return config ?? DEFAULT_CONFIG;
      } catch (_e) {
        return DEFAULT_CONFIG;
      }
    },
    getLastState: () => {
      const lastState = getConstants().lastState;
      const parsedLastState = lastState ? JSON.parse(lastState) : undefined;

      if (parsedLastState && Object.keys(parsedLastState).length === 0) {
        return undefined;
      }

      return parsedLastState;
    },
    openStorybook: () => module.openStorybook(),
    toggleStorybook: () => module.toggleStorybook(),
    // The turbo module spec takes required strings, following the same empty-string-for-"nothing"
    // convention sendNativeError's dataJson already uses - there is no separate optional-arg shape
    // to keep in sync between the JS side and the generated native one.
    openTesting: (storyId: string | undefined, config: Config) =>
      module.openTesting(storyId ?? '', JSON.stringify(config)),
    // A native build from before the connection has neither call: it cannot reload, and it
    // measures nothing.
    reloadJavaScript: () => {
      if (typeof module.reloadJavaScript === 'function') module.reloadJavaScript();
    },
    getMemoryMb: async () => {
      if (typeof module.getMemoryMb !== 'function') return null;
      const memoryMb = await module.getMemoryMb();
      return memoryMb < 0 ? null : memoryMb;
    },
    isScrollable: () => module.isScrollable(),
    scrollToCheckpoint: (index: number, offset: number, maxIndex: number) =>
      module.scrollToCheckpoint(index, offset, maxIndex),
    notifyGetStorybookCalled: () => {
      if (typeof (module as any).notifyGetStorybookCalled === 'function') {
        (module as any).notifyGetStorybookCalled();
      }
    },
  };

  return sherloModule;
}

function createDummySherloModule(): SherloModule {
  return {
    isTurboModule: false,
    tap: async () => null,
    getViewVisibility: async (testIDs: string[]) =>
      Object.fromEntries(testIDs.map((testID) => [testID, 'absent' as const])),
    getInspectorData: async () => ({
      viewHierarchy: {
        id: 1,
        className: 'View',
        isVisible: true,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
      density: 1,
      fontScale: 1,
    }),
    // IMPORTANT: We should make sure that the mode is always 'default'
    // because if user doesn't want to supply native library in their production
    // build, this will be the value returned.
    getMode: () => 'default',
    getNativeVersion: () => null,
    getCompiledCoreVersion: () => null,
    sendNativeError: () => {},
    getLastState: () => undefined,
    getConfig: () => DEFAULT_CONFIG,
    getConfigOrDefault: () => DEFAULT_CONFIG,
    openStorybook: () => {},
    toggleStorybook: () => {},
    openTesting: () => {},
    reloadJavaScript: () => {},
    getMemoryMb: async () => null,
    awaitFrameCommit: async () => false,
    isScrollable: async () => ({ scrollable: false }),
    scrollToCheckpoint: async () => ({
      reachedBottom: true,
      appliedIndex: 0,
      appliedOffsetPx: 0,
      viewportPx: 0,
      contentPx: 0,
    }),
    notifyGetStorybookCalled: () => {},
    stabilize: async (
      _requiredMatches: number,
      _minScreenshotsCount: number,
      _intervalMs: number,
      _timeoutMs: number,
      _saveScreenshots: boolean,
      _threshold: number,
      _includeAA: boolean
    ) => true,
  };
}
