import {
  getValidatedConfig,
  getGitInfo,
  getOptionsWithDefaults,
  printHeader,
  uploadBuildsAndRunTests,
  validatePackages,
} from '../../helpers';
import { Options } from '../../types';
import getExpoSlug from './getExpoSlug';
import validatePlatformUpdateUrls from './validatePlatformUpdateUrls';

async function expoUpdate(
  passedOptions: Options<'expo-update', 'withoutDefaults'>
): Promise<{ buildIndex: number; url: string }> {
  printHeader();

  validatePackages('expo-update');

  const options = getOptionsWithDefaults(passedOptions);

  // TODO: byc moze nie powinnismy tego wymagac tylko rzucac error na pozniejszym etapie jezeli sie okaze ze API nie zwrocilo nam buildow (ktore powinny byc trzymane na naszym serwerze)
  const config = getValidatedConfig(options, { validatePlatformPaths: true });

  validatePlatformUpdateUrls({ config, options });

  // TODO: poprawic
  const slug = getExpoSlug(options.projectRoot);

  const expoUpdateInfo = {
    slug,
    androidUpdateUrl: options.androidUpdateUrl,
    iosUpdateUrl: options.iosUpdateUrl,
  };

  return uploadBuildsAndRunTests({
    config,
    gitInfo: options.gitInfo ?? getGitInfo(),
    expoUpdateInfo,
  });
}

export default expoUpdate;
