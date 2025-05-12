import base64 from 'base-64';
import { NativeModules } from 'react-native';
import utf8 from 'utf8';
import isExpoGo from './helpers/isExpoGo';
import { StorybookViewMode, InspectorData } from './types/types';
import {
  Config,
  LastState,
  AppProtocolItem,
  ProtocolItemMetadata,
} from './helpers/RunnerBridge/types';
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
    saveScreenshots: boolean
  ) => Promise<boolean>;
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
      saveScreenshots: boolean
    ) => {
      return module.stabilize(
        requiredMatches,
        minScreenshotsCount,
        intervalMs,
        timeoutMs,
        saveScreenshots
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
      },
    }),
    appendFile: async () => {},
    readFile: async () => '',
    openStorybook: () => {},
    toggleStorybook: () => {},
    stabilize: async () => true,
  };
}
