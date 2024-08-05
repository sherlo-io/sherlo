import base64 from 'base-64';
import { NativeModules } from 'react-native';
import utf8 from 'utf8';
import isExpoGo from './isExpoGo';

type SherloModule = {
  appendFile: (path: string, base64: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  openStorybook: () => Promise<void>;
  toggleStorybook: () => Promise<void>;
};

let SherloModule: SherloModule;
const { RNSherlo } = NativeModules;

if (RNSherlo !== null) {
  SherloModule = createSherloModule();
} else {
  if (isExpoGo) {
    SherloModule = createDummySherloModule();
  } else {
    throw new Error(
      '@sherlo/react-native-storybook: Sherlo native module is not accessible. Rebuild the app to link it on the native side.'
    );
  }
}

export default SherloModule;

/* ========================================================================== */

function createSherloModule(): SherloModule {
  return {
    appendFile: (path: string, data: string) => {
      const encodedData = base64.encode(utf8.encode(data));

      return RNSherlo.appendFile(normalizePath(path), encodedData);
    },
    mkdir: (path: string) => RNSherlo.mkdir(normalizePath(path)),
    readFile: (path: string) => {
      const decodeData = (data: string) => utf8.decode(base64.decode(data));

      return RNSherlo.readFile(normalizePath(path)).then(decodeData);
    },
    openStorybook: () => RNSherlo.openStorybook(),
    toggleStorybook: () => RNSherlo.toggleStorybook(),
  };
}

function normalizePath(path: string): string {
  const { sherloDirectoryPath } = RNSherlo.getConstants();
  const sherloPath = `${sherloDirectoryPath}/${path}`;
  const filePathPrefix = 'file://';

  return sherloPath.startsWith(filePathPrefix)
    ? sherloPath.slice(filePathPrefix.length)
    : sherloPath;
}

function createDummySherloModule(): SherloModule {
  return {
    appendFile: async () => {},
    mkdir: async () => {},
    readFile: async () => '',
    openStorybook: async () => {},
    toggleStorybook: async () => {},
  };
}
