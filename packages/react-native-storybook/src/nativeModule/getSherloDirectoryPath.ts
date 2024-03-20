import { NativeModules, Platform } from 'react-native';

const { RNSherlo } = NativeModules;

export function getSherloDirectoryPath(): string {
  let path =
    Platform.OS === 'android'
      ? RNSherlo.getConstants().RNExternalDirectoryPath
      : RNSherlo.getConstants().RNDocumentDirectoryPath;

  path += '/sherlo';

  return path;
}

export default getSherloDirectoryPath;
