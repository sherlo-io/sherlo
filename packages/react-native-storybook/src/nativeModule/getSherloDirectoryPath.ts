import { Platform } from 'react-native';
import { getModule } from './getModule';

export function getSherloDirectoryPath(): string {
  let path =
    Platform.OS === 'android'
      ? getModule().getConstants().RNExternalDirectoryPath
      : getModule().getConstants().RNDocumentDirectoryPath;

  path += '/sherlo';

  return path;
}

export default getSherloDirectoryPath;
