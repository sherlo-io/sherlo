import base64 from 'base-64';
import { NativeModules } from 'react-native';
import utf8 from 'utf8';
import isExpoGo from './isExpoGo';

type SherloModule = {
  getInitialMode: () => 'testing' | 'default';
  appendFile: (path: string, base64: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  openStorybook: () => Promise<void>;
  toggleStorybook: () => Promise<void>;
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
    getInitialMode: () => SherloNativeModule.getConstants().initialMode,
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
    getInitialMode: () => 'default',
    appendFile: async () => {},
    mkdir: async () => {},
    readFile: async () => '',
    openStorybook: async () => {},
    toggleStorybook: async () => {},
  };
}
