import { NativeModules } from 'react-native';
import { normalizeFilePath } from './utils/normalizeFilePath';

const { RNSherlo } = NativeModules;

type MkdirOptions = {
  NSFileProtectionKey?: string; // iOS only
  NSURLIsExcludedFromBackupKey?: boolean; // IOS only
};

function mkdir(filepath: string, options: MkdirOptions = {}): Promise<void> {
  return RNSherlo.mkdir(normalizeFilePath(filepath), options).then(() => void 0);
}

export default mkdir;
