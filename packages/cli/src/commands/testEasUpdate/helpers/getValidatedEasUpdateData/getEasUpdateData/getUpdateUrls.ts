import { EasUpdateInfo } from '../../../../../types';
import { getUpdatePlatformsArray } from '../shared';

function getUpdateUrls({
  baseUpdateUrl,
  easUpdateInfo,
}: {
  baseUpdateUrl: string;
  easUpdateInfo: EasUpdateInfo;
}) {
  const updateUrls: { android?: string; ios?: string } = {};

  const updatePlatformsArray = getUpdatePlatformsArray(easUpdateInfo);

  updatePlatformsArray.forEach((platform) => {
    const group = easUpdateInfo.group[platform];
    updateUrls[platform] = `${baseUpdateUrl}/group/${group}?platform=${platform}`;
  });

  return updateUrls;
}

export default getUpdateUrls;
