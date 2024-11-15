import { EXPO_UPDATES_COMMAND } from '../../constants';
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
import getPlatformUpdateUrls from './getPlatformUpdateUrls';
import validatePlatformUpdateUrls from './validatePlatformUpdateUrls';
import validateRequiredOptions from './validateRequiredOptions';

// TODO:
// - lepsze info odnosnie reuzywania wczesniej zupladowanych DEVELOPERSKICH buildow + info o update'ach

async function expoUpdates(
  passedOptions: Options<typeof EXPO_UPDATES_COMMAND, 'withoutDefaults'>
): Promise<{ buildIndex: number; url: string }> {
  printHeader();

  validatePackages(EXPO_UPDATES_COMMAND);

  validateRequiredOptions(passedOptions);

  const options = getOptionsWithDefaults(passedOptions);

  // TODO: byc moze nie powinnismy tego wymagac tylko rzucac error na pozniejszym etapie jezeli sie okaze ze API nie zwrocilo nam buildow (ktore powinny byc trzymane na naszym serwerze)
  const config = getValidatedConfig(options, { validatePlatformPaths: true });

  const { channel, easUpdateJsonOutput, gitInfo, projectRoot } = options;

  const platformUpdateUrls = getPlatformUpdateUrls({ channel, easUpdateJsonOutput });

  // TODO: pozbyc sie na rzecz getValidatedPlatformUpdateUrls - powinno walidowac czy zwracane sa url'e dla wszystkich platform ktore sa w config.devices (podobnie jak w validateConfigPlatforms())
  validatePlatformUpdateUrls({ config, platformUpdateUrls });

  return uploadBuildsAndRunTests({
    config,
    gitInfo: gitInfo ?? getGitInfo(),
    expoUpdateInfo: {
      platformUpdateUrls,
      slug: getExpoSlug(projectRoot),
    },
  });
}

export default expoUpdates;
