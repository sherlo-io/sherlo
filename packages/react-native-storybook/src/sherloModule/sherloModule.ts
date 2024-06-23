import { NativeModules, Platform } from 'react-native';
import base64 from 'base-64';
import utf8 from 'utf8';

let isExpoGo = false;
try {
  const Constants = require('expo-constants').default;
  isExpoGo = Constants.appOwnership === 'expo';
} catch (error) {
  // Optional module is not installed
}

const { RNSherlo } = NativeModules;

interface SherloModule {
  mkdir: (path: string) => Promise<void>;
  appendFile: (path: string, base64: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
}

let sherloModule: SherloModule;

if (RNSherlo === null) {
  if (isExpoGo) {
    // ExpoGo apps are not uploaded to Sherlo so we allow dummy version of SherloModule to be used as no tests should be run in ExpoGo
    sherloModule = {
      mkdir: async () => {},
      appendFile: async () => {},
      readFile: async () => '',
      writeFile: async () => {},
    };
  } else {
    throw new Error(
      '@sherlo/react-native-storybook: Sherlo native module is not accessible. Rebuild the app to link it on the native side.'
    );
  }
} else {
  let basePath =
    Platform.OS === 'android'
      ? RNSherlo.getConstants().RNExternalDirectoryPath
      : RNSherlo.getConstants().RNDocumentDirectoryPath;

  basePath += '/sherlo';

  sherloModule = {
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

export default sherloModule;

/* ========================================================================== */

const filePathPrefix = 'file://';
function normalizeFilePath(path: string): string {
  return path.startsWith(filePathPrefix) ? path.slice(filePathPrefix.length) : path;
}
