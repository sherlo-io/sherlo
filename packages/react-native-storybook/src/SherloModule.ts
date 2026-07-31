import base64 from 'base-64';
import { NativeModules } from 'react-native';
import utf8 from 'utf8';
import isExpoGo from './helpers/isExpoGo';
import { StorybookViewMode, InspectorData } from './types/types';
import { Config, LastState } from './helpers/RunnerBridge/types';
import TurboModule, { Spec } from './specs/NativeSherloModule';

interface SherloConstants {
  mode: StorybookViewMode;
  config: string;
  lastState: string;
  nativeVersion: string | null;
}

type SherloModule = {
  isTurboModule: boolean;
  getMode: () => StorybookViewMode;
  getConfig: () => Config;
  getLastState: () => LastState | undefined;
  getNativeVersion: () => string | null;
  sendNativeError: (
    errorCode: string,
    message: string,
    data?: Record<string, string | null>
  ) => void;
  getInspectorData: () => Promise<InspectorData>;
  appendFile: (path: string, base64: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  openStorybook: () => void;
  toggleStorybook: () => void;
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
    getInspectorData: async () => {
      const inspectorDataString = await module.getInspectorData();
      return JSON.parse(inspectorDataString) as InspectorData;
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
    getLastState: () => {
      const lastState = getConstants().lastState;
      const parsedLastState = lastState ? JSON.parse(lastState) : undefined;

      if (parsedLastState && Object.keys(parsedLastState).length === 0) {
        return undefined;
      }

      return parsedLastState;
    },
    appendFile: (filename: string, data: string) => {
      const encodedData = base64.encode(utf8.encode(data));
      const result = module.appendFile(filename, encodedData);
      return result;
    },
    readFile: (filename: string) => {
      const decodeData = (data: string) => utf8.decode(base64.decode(data));
      return module.readFile(filename).then(decodeData);
    },
    openStorybook: () => module.openStorybook(),
    toggleStorybook: () => module.toggleStorybook(),
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
    sendNativeError: () => {},
    getLastState: () => undefined,
    getConfig: () => ({
      stabilization: {
        requiredMatches: 3,
        minScreenshotsCount: 3,
        intervalMs: 500,
        timeoutMs: 5_000,
        saveScreenshots: true,
        threshold: 0.0,
        includeAA: true,
      },
      // Readiness knobs - represented here so the dummy config shape
      // matches the real one.
      scrollableFallbackDelayMs: 3000,
      storyRenderedTimeoutMs: 5000,
      paintBarrierTimeoutMs: 1000,
      paintBarrierPerScrollPart: true,
    }),
    appendFile: async () => {},
    readFile: async () => '',
    openStorybook: () => {},
    toggleStorybook: () => {},
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
