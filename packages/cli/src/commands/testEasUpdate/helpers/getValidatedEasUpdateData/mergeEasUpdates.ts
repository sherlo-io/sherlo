import { EasUpdateInfo } from '../../../../types';

type RawEasUpdate = {
  branch: string;
  message: string;
  group: string;
  platforms: string;
};

function mergeEasUpdates(firstUpdate: RawEasUpdate, secondUpdate?: RawEasUpdate): EasUpdateInfo {
  const easUpdateInfo: EasUpdateInfo = {
    branch: firstUpdate.branch,
    group: {},
    message: firstUpdate.message,
  };

  // First update has both platforms
  if (firstUpdate.platforms.includes('android') && firstUpdate.platforms.includes('ios')) {
    easUpdateInfo.group.android = firstUpdate.group;
    easUpdateInfo.group.ios = firstUpdate.group;
    return easUpdateInfo;
  }

  // Check if we have two separate updates with the same message and different platforms
  if (
    secondUpdate &&
    firstUpdate.message === secondUpdate.message &&
    firstUpdate.platforms !== secondUpdate.platforms
  ) {
    // Merge the two updates
    if (firstUpdate.platforms.includes('android')) {
      easUpdateInfo.group.android = firstUpdate.group;
      easUpdateInfo.group.ios = secondUpdate.group;
    } else {
      easUpdateInfo.group.ios = firstUpdate.group;
      easUpdateInfo.group.android = secondUpdate.group;
    }
    return easUpdateInfo;
  }

  // Just use the first update
  if (firstUpdate.platforms.includes('android')) {
    easUpdateInfo.group.android = firstUpdate.group;
  }
  if (firstUpdate.platforms.includes('ios')) {
    easUpdateInfo.group.ios = firstUpdate.group;
  }

  return easUpdateInfo;
}

export default mergeEasUpdates;
