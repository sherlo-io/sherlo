import { normalizeFilePath } from './utils/normalizeFilePath';
import { getModule } from './getModule';

type MkdirOptions = {
  NSFileProtectionKey?: string; // iOS only
  NSURLIsExcludedFromBackupKey?: boolean; // IOS only
};

function mkdir(filepath: string, options: MkdirOptions = {}): Promise<void> {
  return getModule()
    .mkdir(normalizeFilePath(filepath), options)
    .then(() => void 0);
}

export default mkdir;
