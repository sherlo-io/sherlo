import chalk from 'chalk';
import logWarning from '../../helpers/logWarning';
import { Platform } from './types';

function detectPlatform(text: string): Platform {
  const isAndroid =
    /index\.android\.bundle/.test(text) ||
    /\/data\/user\/0\//.test(text) ||
    /data\/data\//.test(text);
  if (isAndroid) return 'android';

  const isIos =
    /\.jsbundle/.test(text) ||
    /CoreSimulator\/Devices/.test(text) ||
    /Library\/Application Support\/.expo-internal/.test(text);
  if (isIos) return 'ios';

  logWarning({ message: 'Could not detect platform from frame paths, defaulting to ios.' });
  return 'ios';
}

export default detectPlatform;
