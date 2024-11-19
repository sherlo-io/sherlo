import { EXPO_UPDATES_COMMAND } from '../../constants';
import {
  getValidatedConfig,
  getGitInfo,
  getOptionsWithDefaults,
  printHeader,
  uploadOrReuseBuildsAndRunTests,
  validatePackages,
} from '../../helpers';
import { Options } from '../../types';
import getExpoSlug from './getExpoSlug';
import getPlatformUpdateUrls from './getPlatformUpdateUrls';
import validatePlatformUpdateUrls from './validatePlatformUpdateUrls';
import validateRequiredOptions from './validateRequiredOptions';

// TODO:
// - lepsze info odnosnie reuzywania wczesniej zupladowanych DEVELOPERSKICH buildow + info o update'ach

// TODO: lepiej ogarnac ponizszy error: (np. "your previously uploaded Android build ..." -> "rebuild your app and pass it through `--android`")
/**
 * Error: Your build contains outdated `@sherlo/react-native-storybook` version
 *
 * Found version: 1.0.43
 * Minimum required version: 1.0.43
 *
 * Please rebuild your app
 */

// TODO: lepiej ogarnac ponizszy error (np. "missing `android` path to your Android build"? / "pass through `--android` or in sherlo.config.json")
/**
 * Config Error: missing `android` path (based on devices defined in config)
 * ↳ Learn more: https://docs.sherlo.io/getting-started/config#android
 */

// TODO: "last uploaded build is not development" (isExpoDev === false)

// TODO: latest update for "development" channel was done only for iOS platform (2 hours ago) - you need to update both platforms if you want to test both platforms (config devices)

async function expoUpdates(
  passedOptions: Options<typeof EXPO_UPDATES_COMMAND, 'withoutDefaults'>
): Promise<{ buildIndex: number; url: string }> {
  printHeader();

  validatePackages(EXPO_UPDATES_COMMAND);

  validateRequiredOptions(passedOptions);

  const options = getOptionsWithDefaults(passedOptions);

  const config = getValidatedConfig(options, {
    requirePlatformPaths: false /* Platform paths are validated in getValidatedBinariesInfo() */,
  });

  const { channel, /* easUpdateJsonOutput, */ gitInfo, projectRoot } = options;

  const platformUpdateUrls = getPlatformUpdateUrls({
    channel,
    // easUpdateJsonOutput,
    projectRoot,
  });

  // TODO: pozbyc sie na rzecz getValidatedPlatformUpdateUrls - powinno walidowac czy zwracane sa url'e dla wszystkich platform ktore sa w config.devices (podobnie jak w validateConfigPlatforms())
  validatePlatformUpdateUrls({ config, platformUpdateUrls });

  return uploadOrReuseBuildsAndRunTests({
    config,
    gitInfo: gitInfo ?? getGitInfo(projectRoot),
    expoUpdateInfo: {
      platformUpdateUrls,
      slug: getExpoSlug(projectRoot),
    },
  });
}

export default expoUpdates;
