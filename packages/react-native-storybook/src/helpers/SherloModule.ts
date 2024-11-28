import base64 from 'base-64';
import { NativeModules, Platform } from 'react-native';
import utf8 from 'utf8';
import isExpoGo from './isExpoGo';
import { StorybookViewMode } from '../types/types';
import { getGlobalStates } from '../utils';

type SherloModule = {
  getMode: () => StorybookViewMode;
  storybookRegistered: () => Promise<void>;
  getInspectorData: () => Promise<string>;
  appendFile: (path: string, base64: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  openStorybook: () => Promise<void>;
  toggleStorybook: () => Promise<void>;
  verifyIntegration: () => Promise<void>;
  clearFocus: () => Promise<void>;
  checkIfContainsStorybookError: () => Promise<boolean>;
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
        await SherloNativeModule.clearFocus();
      }
    },
    getInspectorData: async () => {
      return SherloNativeModule.getInspectorData();
    },
    storybookRegistered: async () => {
      await SherloNativeModule.storybookRegistered();
    },
    getMode: () => {
      const { testConfig, isVerifySetupTest } = getGlobalStates();
      if (testConfig && !isVerifySetupTest) {
        return 'testing';
      }

      return SherloNativeModule.getConstants().mode;
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
    clearFocus: async () => {},
    getInspectorData: async () => '',
    storybookRegistered: async () => {},
    getMode: () => 'default',
    appendFile: async () => {},
    mkdir: async () => {},
    readFile: async () => '',
    openStorybook: async () => {},
    toggleStorybook: async () => {},
    verifyIntegration: async () => {},
  };
}
