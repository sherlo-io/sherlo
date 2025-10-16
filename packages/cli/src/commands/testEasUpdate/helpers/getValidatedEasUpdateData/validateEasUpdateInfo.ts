import { Platform } from '@sherlo/api-types';
import { PLATFORM_LABEL } from '../../../../constants';
import { getPlatformsToTest, throwError } from '../../../../helpers';
import { CommandParams, EasUpdateInfo } from '../../../../types';
import { THIS_COMMAND } from '../../constants';
import { getUpdatePlatformsArray } from './shared';

function validateEasUpdateInfo({
  commandParams,
  easUpdateInfo,
}: {
  commandParams: CommandParams<THIS_COMMAND>;
  easUpdateInfo: EasUpdateInfo;
}) {
  const platformsToTest = getPlatformsToTest(commandParams.devices);
  const updatePlatformsArray = getUpdatePlatformsArray(easUpdateInfo);

  platformsToTest.forEach((platform) => {
    if (!updatePlatformsArray.includes(platform)) {
      throwError(getError({ type: 'missing_platform', platform, easUpdateInfo }));
    }
  });
}

export default validateEasUpdateInfo;

/* ========================================================================== */

type EasUpdateError = {
  type: 'missing_platform';
  platform: Platform;
  easUpdateInfo: EasUpdateInfo;
};

function getError(error: EasUpdateError) {
  switch (error.type) {
    case 'missing_platform':
      return {
        message:
          `Missing required ${
            PLATFORM_LABEL[error.platform]
          } (based on devices in config) in latest update\n\n` +
          'Update Info\n' +
          `└─ message: ${error.easUpdateInfo.message}\n` +
          `└─ group: ${error.easUpdateInfo.group.android ?? error.easUpdateInfo.group.ios}\n` +
          `└─ platforms: ${error.easUpdateInfo.group.android ? 'android' : 'ios'}\n` +
          `└─ branch: ${error.easUpdateInfo.branch}`,
      };
  }
}
