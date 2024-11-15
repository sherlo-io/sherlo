import { LOCAL_BUILDS_COMMAND } from '../../constants';
import {
  getValidatedConfig,
  getGitInfo,
  getOptionsWithDefaults,
  printHeader,
  uploadBuildsAndRunTests,
  validatePackages,
} from '../../helpers';
import { Options } from '../../types';

async function localBuilds(
  passedOptions: Options<typeof LOCAL_BUILDS_COMMAND, 'withoutDefaults'>
): Promise<{ buildIndex: number; url: string }> {
  printHeader();

  validatePackages(LOCAL_BUILDS_COMMAND);

  const options = getOptionsWithDefaults(passedOptions);

  const config = getValidatedConfig(options, { validatePlatformPaths: true });

  return uploadBuildsAndRunTests({
    config,
    gitInfo: options.gitInfo ?? getGitInfo(),
  });
}

export default localBuilds;
