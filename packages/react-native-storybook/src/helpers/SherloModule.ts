import base64 from 'base-64';
import { NativeModules, Platform } from 'react-native';
import utf8 from 'utf8';
import isExpoGo from './isExpoGo';
import { StorybookViewMode } from '../types/types';
import { Config, LastState } from './RunnerBridge/types';
import RunnerBridge from './RunnerBridge';

// Import the Turbo Module spec for the new architecture
import NativeSherloModule from './NativeSherloModule';

type SherloModule = {
  getMode: () => StorybookViewMode;
  getConfig: () => Config;
  getLastState: () => LastState | undefined;
  getInspectorData: () => Promise<string>;
  appendFile: (path: string, base64: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  openStorybook: () => Promise<void>;
  toggleStorybook: () => Promise<void>;
  stabilize: (requiredMatches: number, intervalMs: number, timeoutMs: number) => Promise<boolean>;
};

let SherloModule: SherloModule;
const { SherloModule: SherloNativeModule } = NativeModules;

// Determine which module to use - Turbo Module (new arch) or Legacy Module
const module = NativeSherloModule ?? SherloNativeModule;

if (module !== null) {
  SherloModule = createSherloModule(module);
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

function createSherloModule(nativeModule: any): SherloModule {
  return {
    getInspectorData: async () => {
      return nativeModule.getInspectorData();
    },
    stabilize: async (requiredMatches: number, intervalMs: number, timeoutMs: number) => {
      return nativeModule.stabilize(requiredMatches, intervalMs, timeoutMs);
    },
    getMode: () => {
      return nativeModule.getConstants().mode as StorybookViewMode;
    },
    getConfig: () => {
      const configString = nativeModule.getConstants().config;
      const config = JSON.parse(configString) as Config | undefined;
      if (!config) {
        throw new Error('Config is undefined');
      }
      return config;
    },
    getLastState: () => {
      const configString = nativeModule.getConstants().config;
      const config = JSON.parse(configString) as Config | undefined;
      if (config?.overrideLastState) {
        return config.overrideLastState;
      }

      const lastState = nativeModule.getConstants().lastState;
      const parsedLastState = lastState ? JSON.parse(lastState) : undefined;

      if (parsedLastState && Object.keys(parsedLastState).length === 0) {
        return undefined;
      }

      return parsedLastState;
    },
    appendFile: (filename: string, data: string) => {
      const encodedData = base64.encode(utf8.encode(data));
      return nativeModule.appendFile(filename, encodedData);
    },
    readFile: (filename: string) => {
      const decodeData = (data: string) => utf8.decode(base64.decode(data));
      return nativeModule.readFile(filename).then(decodeData);
    },
    openStorybook: () => nativeModule.openStorybook(),
    toggleStorybook: () => nativeModule.toggleStorybook(),
  };
}

function createDummySherloModule(): SherloModule {
  return {
    getInspectorData: async () => '',
    getMode: () => 'default',
    getLastState: () => undefined,
    getConfig: () => ({ stabilization: { requiredMatches: 3, intervalMs: 500, timeoutMs: 5_000 } }),
    appendFile: async () => {},
    readFile: async () => '',
    openStorybook: async () => {},
    toggleStorybook: async () => {},
    stabilize: async () => true,
  };
}
