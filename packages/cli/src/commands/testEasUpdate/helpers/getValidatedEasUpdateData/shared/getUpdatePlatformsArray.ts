import { Platform } from '@sherlo/api-types';
import { EasUpdateInfo } from '../../../../../types';

function getUpdatePlatformsArray(easUpdateInfo: EasUpdateInfo): Platform[] {
  const platforms: Platform[] = [];

  if (easUpdateInfo.group.android) {
    platforms.push('android');
  }

  if (easUpdateInfo.group.ios) {
    platforms.push('ios');
  }

  return platforms;
}

export default getUpdatePlatformsArray;
