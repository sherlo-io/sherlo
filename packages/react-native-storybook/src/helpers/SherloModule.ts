import base64 from 'base-64';
import { NativeModules, Platform } from 'react-native';
import utf8 from 'utf8';
import isExpoGo from './isExpoGo';
import { StorybookViewMode } from '../types/types';
import { Config, LastState } from './RunnerBridge/types';
import RunnerBridge from './RunnerBridge';

type SherloModule = {
  getMode: () => StorybookViewMode;
  getConfig: () => Config;
  getLastState: () => LastState | undefined;
  storybookRegistered: () => Promise<void>;
  getInspectorData: () => Promise<string>;
  appendFile: (path: string, base64: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  openStorybook: () => Promise<void>;
  toggleStorybook: () => Promise<void>;
  verifyIntegration: () => Promise<void>;
  clearFocus: () => Promise<boolean>;
  checkIfContainsStorybookError: () => Promise<boolean>;
  checkIfStable: (
    requiredMatches: number,
    intervalMs: number,
    timeoutMs: number
  ) => Promise<boolean>;
};

let SherloModule: SherloModule;
const { SherloModule: SherloNativeModule } = NativeModules;

if (SherloNativeModule !== null) {
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
  return {
    checkIfContainsStorybookError: async () => {
      return SherloNativeModule.checkIfContainsStorybookError();
    },
    clearFocus: async () => {
      if (Platform.OS === 'android') {
        return SherloNativeModule.clearFocus();
      }

      return false;
    },
    getInspectorData: async () => {
      return SherloNativeModule.getInspectorData();
    },
    storybookRegistered: async () => {
      await SherloNativeModule.storybookRegistered();
    },
    checkIfStable: async (requiredMatches: number, intervalMs: number, timeoutMs: number) => {
      return SherloNativeModule.checkIfStable(requiredMatches, intervalMs, timeoutMs);
    },
    getMode: () => {
      return SherloNativeModule.getConstants().mode;
    },
    getConfig: () => {
      return JSON.parse(SherloNativeModule.getConstants().config);
    },
    getLastState: () => {
      const lastState = SherloNativeModule.getConstants().lastState;
      try {
        RunnerBridge.log('lastState directly from native module', lastState);
      } catch (error) {
        ///
      }
      const parsedLastState = lastState ? JSON.parse(lastState) : undefined;

      if (parsedLastState && Object.keys(parsedLastState).length === 0) {
        return undefined;
      }

      return parsedLastState;
    },
    appendFile: (path: string, data: string) => {
      const encodedData = base64.encode(utf8.encode(data));

      return SherloNativeModule.appendFile(normalizePath(path), encodedData);
    },
    mkdir: (path: string) => SherloNativeModule.mkdir(normalizePath(path)),
    readFile: (path: string) => {
      const decodeData = (data: string) => utf8.decode(base64.decode(data));

      return SherloNativeModule.readFile(normalizePath(path)).then(decodeData);
    },
    openStorybook: () => SherloNativeModule.openStorybook(),
    toggleStorybook: () => SherloNativeModule.toggleStorybook(),
    verifyIntegration: () => SherloNativeModule.verifyIntegration(),
  };
}

function normalizePath(path: string): string {
  const { syncDirectoryPath } = SherloNativeModule.getConstants();
  const sherloPath = `${syncDirectoryPath}/${path}`;
  const filePathPrefix = 'file://';

  return sherloPath.startsWith(filePathPrefix)
    ? sherloPath.slice(filePathPrefix.length)
    : sherloPath;
}

function createDummySherloModule(): SherloModule {
  return {
    checkIfContainsStorybookError: async () => false,
    clearFocus: async () => false,
    getInspectorData: async () => '',
    storybookRegistered: async () => {},
    getMode: () => 'default',
    getLastState: () => undefined,
    getConfig: () => ({ stabilization: { requiredMatches: 3, intervalMs: 500, timeoutMs: 5_000 } }),
    appendFile: async () => {},
    mkdir: async () => {},
    readFile: async () => '',
    openStorybook: async () => {},
    toggleStorybook: async () => {},
    verifyIntegration: async () => {},
    checkIfStable: async () => true,
  };
}
