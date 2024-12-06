import { ExpoUpdateInfo, ExpoUpdateData } from '../../../../../types';
import getUpdateUrls from './getUpdateUrls';
import parseUpdateInfoMessageString from './parseUpdateInfoMessageString';

function getExpoUpdateData({
  baseUpdateUrl,
  expoUpdateInfo,
  slug,
}: {
  baseUpdateUrl: string;
  expoUpdateInfo: ExpoUpdateInfo;
  slug: string;
}): ExpoUpdateData {
  const updateUrls = getUpdateUrls({ baseUpdateUrl, expoUpdateInfo });

  const { message, author, timeAgo } = parseUpdateInfoMessageString(expoUpdateInfo.message);

  return {
    branch: expoUpdateInfo.branch,
    message,
    slug,
    updateUrls,
    author,
    timeAgo,
  };
}

export default getExpoUpdateData;
