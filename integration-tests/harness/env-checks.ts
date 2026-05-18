import { PLATFORM } from './platform.js';
import { execSync } from 'node:child_process';

export function requireDeviceTooling(): void {
  if (PLATFORM === 'android') {
    if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
      throw new Error('ANDROID_HOME / ANDROID_SDK_ROOT not set.');
    }
  } else {
    try { execSync('xcrun --version', { stdio: 'pipe' }); }
    catch { throw new Error('xcrun not available - Xcode command-line tools missing.'); }
  }
}
