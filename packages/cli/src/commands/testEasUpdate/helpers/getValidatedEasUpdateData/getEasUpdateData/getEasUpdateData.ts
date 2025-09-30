import { EasUpdateData, EasUpdateInfo } from '../../../../../types';
import getUpdateUrls from './getUpdateUrls';
import parseUpdateInfoMessageString from './parseUpdateInfoMessageString';

function getEasUpdateData({
  baseUpdateUrl,
  easUpdateInfo,
  slug,
}: {
  baseUpdateUrl: string;
  easUpdateInfo: EasUpdateInfo;
  slug: string;
}): EasUpdateData {
  const updateUrls = getUpdateUrls({ baseUpdateUrl, easUpdateInfo });

  const { message, author, timeAgo } = parseUpdateInfoMessageString(easUpdateInfo.message);

  return {
    branch: easUpdateInfo.branch,
    message,
    slug,
    updateUrls,
    author,
    timeAgo,
  };
}

export default getEasUpdateData;
