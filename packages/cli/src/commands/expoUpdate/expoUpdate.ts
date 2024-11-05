import { DOCS_LINK } from '../../constants';
import {
  getValidatedConfig,
  getGitInfo,
  getOptionsWithDefaults,
  printHeader,
  throwError,
  uploadBuildsAndRunTests,
  getPlatformsToTest,
} from '../../helpers';
import { Options } from '../../types';
import verifyExpoProject from './verifyExpoProject';
import getExpoSlug from './getExpoSlug';

async function expoUpdate(
  passedOptions: Options<'expo-update', 'withoutDefaults'>
): Promise<{ buildIndex: number; url: string }> {
  printHeader();

  const options = getOptionsWithDefaults(passedOptions);
  // TODO: byc moze nie powinnismy tego wymagac tylko rzucac error na pozniejszym etapie jezeli sie okaze ze API nie zwrocilo nam buildow (ktore powinny byc trzymane na naszym serwerze)
  const config = getValidatedConfig(options, { validatePlatformPaths: true });

  const { androidUpdateUrl, gitInfo, iosUpdateUrl, projectRoot } = options;

  verifyExpoProject(projectRoot);

  const platformsToTest = getPlatformsToTest(config.devices);

  if (platformsToTest.includes('android') && !androidUpdateUrl) {
    throwError({
      message:
        '`--androidUpdateUrl` must be provided for `sherlo expo-update` command when testing Android (based on devices defined in the config)',
      learnMoreLink: DOCS_LINK.expoUpdate,
    });
  }

  if (platformsToTest.includes('ios') && !iosUpdateUrl) {
    throwError({
      message:
        '`--iosUpdateUrl` must be provided for `sherlo expo-update` command when testing iOS (based on devices defined in the config)',
      learnMoreLink: DOCS_LINK.expoUpdate,
    });
  }

  // TODO: poprawic
  const slug = getExpoSlug(projectRoot);

  const expoUpdateInfo = {
    slug,
    androidUpdateUrl,
    iosUpdateUrl,
  };

  return uploadBuildsAndRunTests({
    config,
    gitInfo: gitInfo ?? getGitInfo(),
    expoUpdateInfo,
  });
}

export default expoUpdate;
