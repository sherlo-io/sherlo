import base64 from 'base-64';
import { NativeModules, Platform } from 'react-native';
import utf8 from 'utf8';
import { AppOrStorybookMode } from '../../../types';

type SherloModule = {
  mkdir: (path: string) => Promise<void>;
  setAppOrStorybookMode: (appOrStorybookMode: AppOrStorybookMode) => Promise<void>;
  getAppOrStorybookMode: () => Promise<AppOrStorybookMode>;
  appendFile: (path: string, base64: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
};

const { RNSherlo } = NativeModules;

let sherloModule: SherloModule;
if (RNSherlo === null) {
  if (isExpoGoApp()) {
    sherloModule = createDummySherloModule();
  } else {
    throw new Error(
      '@sherlo/react-native-storybook: Sherlo native module is not accessible. Rebuild the app to link it on the native side.'
    );
  }
} else {
  sherloModule = createRealSherloModule(RNSherlo);
}

export default sherloModule;

/* ========================================================================== */

function isExpoGoApp(): boolean {
  try {
    const Constants = require('expo-constants').default;
    return Constants.appOwnership === 'expo';
  } catch (error) {
    // Optional module is not installed
    return false;
  }
}

function createDummySherloModule(): SherloModule {
  return {
    getAppOrStorybookMode: async () => 'app',
    setAppOrStorybookMode: async () => {},
    mkdir: async () => {},
    appendFile: async () => {},
    readFile: async () => '',
    writeFile: async () => {},
  };
}

function createRealSherloModule(RNSherlo: any): SherloModule {
  const basePath = getBasePath(RNSherlo);

  return {
    getAppOrStorybookMode: () => {
      return RNSherlo.getAppOrStorybookMode();
    },
    setAppOrStorybookMode: (appOrStorybookMode: AppOrStorybookMode) => {
      return RNSherlo.setAppOrStorybookMode(appOrStorybookMode);
    },
    appendFile: (filepath: string, contents: string) => {
      const encodedContents = base64.encode(utf8.encode(contents));
      const normalizedFilePath = normalizeFilePath(`${basePath}/${filepath}`);

      return RNSherlo.appendFile(normalizedFilePath, encodedContents);
    },
    writeFile: (filepath: string, contents: string) => {
      const encodedContents = base64.encode(utf8.encode(contents));
      const normalizedFilePath = normalizeFilePath(`${basePath}/${filepath}`);

      return RNSherlo.writeFile(normalizedFilePath, encodedContents, { encoding: 'utf8' });
    },
    readFile: (filepath: string) => {
      const normalizedFilePath = normalizeFilePath(`${basePath}/${filepath}`);

      return RNSherlo.readFile(normalizedFilePath).then((b64: string) => {
        return utf8.decode(base64.decode(b64));
      });
    },
    mkdir: (path: string) => {
      const normalizedFilePath = normalizeFilePath(`${basePath}/${path}`);

      return RNSherlo.mkdir(normalizedFilePath, {});
    },
  };
}

function getBasePath(RNSherlo: any): string {
  const path =
    Platform.OS === 'android'
      ? RNSherlo.getConstants().RNExternalDirectoryPath
      : RNSherlo.getConstants().RNDocumentDirectoryPath;

  return `${path}/sherlo`;
}

const filePathPrefix = 'file://';
function normalizeFilePath(path: string): string {
  return path.startsWith(filePathPrefix) ? path.slice(filePathPrefix.length) : path;
}
