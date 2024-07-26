import base64 from 'base-64';
import { NativeModules } from 'react-native';
import utf8 from 'utf8';
import { AppOrStorybookMode } from '../types';
import isExpoGo from './isExpoGo';

type SherloModule = {
  appOrStorybookMode: AppOrStorybookMode;
  getAppOrStorybookMode: () => Promise<AppOrStorybookMode>;
  setAppOrStorybookModeAndRestart: (appOrStorybookMode: AppOrStorybookMode) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  appendFile: (path: string, base64: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
};

const { RNSherlo } = NativeModules;

let SherloModule: SherloModule;

if (RNSherlo === null) {
  if (isExpoGo) {
    SherloModule = createDummySherloModule();
  } else {
    throw new Error(
      '@sherlo/react-native-storybook: Sherlo native module is not accessible. Rebuild the app to link it on the native side.'
    );
  }
} else {
  SherloModule = createSherloModule(RNSherlo);
}

export default SherloModule;

/* ========================================================================== */

function createDummySherloModule(): SherloModule {
  return {
    appOrStorybookMode: 'app',
    getAppOrStorybookMode: async () => 'app',
    setAppOrStorybookModeAndRestart: async () => {},
    mkdir: async () => {},
    appendFile: async () => {},
    readFile: async () => '',
    writeFile: async () => {},
  };
}

function createSherloModule(RNSherlo: any): SherloModule {
  const { appOrStorybookMode, sherloDirectoryPath } = RNSherlo.getConstants();

  return {
    appOrStorybookMode,
    getAppOrStorybookMode: () => {
      return RNSherlo.getAppOrStorybookMode();
    },
    setAppOrStorybookModeAndRestart: (appOrStorybookMode: AppOrStorybookMode) => {
      return RNSherlo.setAppOrStorybookModeAndRestart(appOrStorybookMode);
    },
    mkdir: (path: string) => {
      const normalizedFilePath = normalizeFilePath(`${sherloDirectoryPath}/${path}`);

      return RNSherlo.mkdir(normalizedFilePath, {});
    },
    appendFile: (filepath: string, contents: string) => {
      const encodedContents = base64.encode(utf8.encode(contents));
      const normalizedFilePath = normalizeFilePath(`${sherloDirectoryPath}/${filepath}`);

      return RNSherlo.appendFile(normalizedFilePath, encodedContents);
    },
    writeFile: (filepath: string, contents: string) => {
      const encodedContents = base64.encode(utf8.encode(contents));
      const normalizedFilePath = normalizeFilePath(`${sherloDirectoryPath}/${filepath}`);

      return RNSherlo.writeFile(normalizedFilePath, encodedContents, { encoding: 'utf8' });
    },
    readFile: (filepath: string) => {
      const normalizedFilePath = normalizeFilePath(`${sherloDirectoryPath}/${filepath}`);

      return RNSherlo.readFile(normalizedFilePath).then((b64: string) => {
        return utf8.decode(base64.decode(b64));
      });
    },
  };
}

const filePathPrefix = 'file://';
function normalizeFilePath(path: string): string {
  return path.startsWith(filePathPrefix) ? path.slice(filePathPrefix.length) : path;
}
