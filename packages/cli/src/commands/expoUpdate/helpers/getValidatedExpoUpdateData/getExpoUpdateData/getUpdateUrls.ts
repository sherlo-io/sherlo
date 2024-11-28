import { ExpoUpdateInfo } from '../../../../../types';
import { getUpdatePlatformsArray } from '../shared';

function getUpdateUrls({
  baseUpdateUrl,
  expoUpdateInfo,
}: {
  baseUpdateUrl: string;
  expoUpdateInfo: ExpoUpdateInfo;
}) {
  const updateUrls: { android?: string; ios?: string } = {};

  const updatePlatformsArray = getUpdatePlatformsArray(expoUpdateInfo);

  updatePlatformsArray.forEach((platform) => {
    updateUrls[platform] = `${baseUpdateUrl}/group/${expoUpdateInfo.group}?platform=${platform}`;
  });

  return updateUrls;
}

export default getUpdateUrls;
