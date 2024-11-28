import { Platform } from '@sherlo/api-types';
import { ExpoUpdateInfo } from '../../../../../types';

function getUpdatePlatformsArray(updateInfo: ExpoUpdateInfo): Platform[] {
  return updateInfo.platforms.split(',').map((p: string) => p.trim()) as Platform[];
}

export default getUpdatePlatformsArray;
