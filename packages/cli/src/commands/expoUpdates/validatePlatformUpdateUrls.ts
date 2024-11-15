import { EXPO_UPDATES_COMMAND, PLATFORM_LABEL } from '../../constants';
import { getPlatformsToTest, throwError } from '../../helpers';
import { Config } from '../../types';

function validatePlatformUpdateUrls({
  config,
  platformUpdateUrls,
}: {
  config: Config;
  platformUpdateUrls: { android?: string; ios?: string };
}) {
  const platformsToTest = getPlatformsToTest(config.devices);
  const platformConfigs = [
    {
      platform: 'android',
      label: PLATFORM_LABEL.android,
      url: platformUpdateUrls.android,
      flagName: '--androidUpdateUrl',
    },
    {
      platform: 'ios',
      label: PLATFORM_LABEL.ios,
      url: platformUpdateUrls.ios,
      flagName: '--iosUpdateUrl',
    },
  ] as const;

  platformConfigs.forEach(({ platform, label, url, flagName }) => {
    if (!platformsToTest.includes(platform)) return;

    // TODO: do poprawy
    if (!url) {
      throwError({
        message: `\`sherlo ${EXPO_UPDATES_COMMAND}\` requires \`${flagName}\` to test ${label} devices (defined in sherlo.config.json)`,
        learnMoreLink: 'TODO: add link to docs',
      });
    }

    try {
      // TODO: do poprawy - sprawdzac domene?
      new URL(url);
    } catch {
      throwError({
        message: `\`${flagName}\` must be a valid URL`,
        learnMoreLink: 'TODO: add link to docs',
      });
    }
  });
}

export default validatePlatformUpdateUrls;
