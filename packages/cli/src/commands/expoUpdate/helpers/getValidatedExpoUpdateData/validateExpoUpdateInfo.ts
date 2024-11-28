import { Platform } from '@sherlo/api-types';
import { PLATFORMS } from '../../../../constants';
import { getPlatformsToTest, throwError } from '../../../../helpers';
import { CommandParams, ExpoUpdateInfo } from '../../../../types';
import { THIS_COMMAND } from '../../constants';
import { getUpdatePlatformsArray } from './shared';

function validateExpoUpdateInfo({
  commandParams,
  expoUpdateInfo,
}: {
  commandParams: CommandParams<THIS_COMMAND>;
  expoUpdateInfo: ExpoUpdateInfo;
}) {
  const platformsToTest = getPlatformsToTest(commandParams.devices);
  const updatePlatformsArray = getUpdatePlatformsArray(expoUpdateInfo);

  PLATFORMS.forEach((platform) => {
    if (platformsToTest.includes(platform) && !updatePlatformsArray.includes(platform)) {
      throwError(getError({ type: 'missing_platform', platform, expoUpdateInfo }));
    }
  });
}

export default validateExpoUpdateInfo;

/* ========================================================================== */

type ExpoUpdateError = {
  type: 'missing_platform';
  platform: Platform;
  expoUpdateInfo: ExpoUpdateInfo;
};

function getError(error: ExpoUpdateError) {
  switch (error.type) {
    case 'missing_platform':
      return {
        message:
          `Missing required ${error.platform === 'ios' ? 'iOS' : 'Android'} (based on devices in config) in latest update\n\n` +
          `Update Info\n` +
          `└─ message: ${error.expoUpdateInfo.message}\n` +
          `└─ group: ${error.expoUpdateInfo.group}\n` +
          `└─ platforms: ${error.expoUpdateInfo.platforms}\n` +
          `└─ branch: ${error.expoUpdateInfo.branch}`,
      };
  }
}
