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
}

type SherloModule = {
  isTurboModule: boolean;
  getMode: () => StorybookViewMode;
  getConfig: () => Config;
  getLastState: () => LastState | undefined;
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
  isScrollableSnapshot: () => Promise<boolean>;
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
  }>;
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
    getMode: () => {
      return getConstants().mode;
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
      const configString = getConstants().config;
      const config = JSON.parse(configString) as Config | undefined;
      if (config?.overrideLastState) {
        return config.overrideLastState;
      }

      const lastState = getConstants().lastState;
      const parsedLastState = lastState ? JSON.parse(lastState) : undefined;

      if (parsedLastState && Object.keys(parsedLastState).length === 0) {
        return undefined;
      }

      return parsedLastState;
    },
    appendFile: (filename: string, data: string) => {
      const encodedData = base64.encode(utf8.encode(data));
      return module.appendFile(filename, encodedData);
    },
    readFile: (filename: string) => {
      const decodeData = (data: string) => utf8.decode(base64.decode(data));
      return module.readFile(filename).then(decodeData);
    },
    openStorybook: () => module.openStorybook(),
    toggleStorybook: () => module.toggleStorybook(),
    isScrollableSnapshot: () => module.isScrollableSnapshot(),
    scrollToCheckpoint: (index: number, offset: number, maxIndex: number) =>
      module.scrollToCheckpoint(index, offset, maxIndex),
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
    }),
    appendFile: async () => {},
    readFile: async () => '',
    openStorybook: () => {},
    toggleStorybook: () => {},
    isScrollableSnapshot: async () => false,
    scrollToCheckpoint: async () => ({
      reachedBottom: true,
      appliedIndex: 0,
      appliedOffsetPx: 0,
      viewportPx: 0,
      contentPx: 0,
    }),
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
