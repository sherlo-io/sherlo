import { getPlatformsToTest, throwError } from '../../helpers';
import { Config } from '../../types';

function validatePlatformUpdateUrls({
  config,
  options: { androidUpdateUrl, iosUpdateUrl },
}: {
  config: Config;
  options: { androidUpdateUrl?: string; iosUpdateUrl?: string };
}) {
  const platformsToTest = getPlatformsToTest(config.devices);
  const platformConfigs = [
    {
      platform: 'android',
      label: 'Android',
      url: androidUpdateUrl,
      flagName: '--androidUpdateUrl',
    },
    {
      platform: 'ios',
      label: 'iOS',
      url: iosUpdateUrl,
      flagName: '--iosUpdateUrl',
    },
  ] as const;

  platformConfigs.forEach(({ platform, label, url, flagName }) => {
    if (!platformsToTest.includes(platform)) return;

    if (!url) {
      throwError({
        message: `\`sherlo expo-update\` requires \`${flagName}\` to test ${label} devices (defined in sherlo.config.json)`,
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
