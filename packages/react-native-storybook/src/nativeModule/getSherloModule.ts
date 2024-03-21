import { NativeModules, Platform } from 'react-native';
import base64 from 'base-64';
import utf8 from 'utf8';
import Constants from 'expo-constants';

import { normalizeFilePath } from './utils/normalizeFilePath';

const isExpoGo = Constants.appOwnership === 'expo';

const { RNSherlo } = NativeModules;

interface SherloModule {
  mkdir: (path: string) => Promise<void>;
  appendFile: (path: string, base64: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
}

function getSherloModule(): SherloModule {
  if (RNSherlo === null) {
    if (isExpoGo) {
      return {
        mkdir: async () => {},
        appendFile: async () => {},
        readFile: async () => '',
        writeFile: async () => {},
      };
    }

    throw new Error(
      '@sherlo/react-natve-storybook: Sherlo native module is not accessible. Rebuild the app to link it on the native side.'
    );
  }

  const basePath =
    Platform.OS === 'android'
      ? RNSherlo.getConstants().RNExternalDirectoryPath
      : RNSherlo.getConstants().RNDocumentDirectoryPath;

  return {
    appendFile: (filepath: string, contents: string) => {
      const b64 = base64.encode(utf8.encode(contents));
      const normalizedFilePath = normalizeFilePath(`${basePath}/${filepath}`);

      return RNSherlo.appendFile(normalizedFilePath, b64);
    },
    writeFile: (filepath: string, contents: string) => {
      const b64 = base64.encode(utf8.encode(contents));
      const normalizedFilePath = normalizeFilePath(`${basePath}/${filepath}`);

      return RNSherlo.writeFile(normalizedFilePath, b64, { encoding: 'utf8' });
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

export default getSherloModule;