import { Platform } from '@sherlo/api-types';
import { EasUpdateInfo } from '../../../../../types';

function getUpdatePlatformsArray(easUpdateInfo: EasUpdateInfo): Platform[] {
  return easUpdateInfo.platforms.split(',').map((p: string) => p.trim()) as Platform[];
}

export default getUpdatePlatformsArray;
