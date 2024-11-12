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
  passedOptions: Options<'local-builds', 'withoutDefaults'>
): Promise<{ buildIndex: number; url: string }> {
  printHeader();

  validatePackages('local-builds');

  const options = getOptionsWithDefaults(passedOptions);

  const config = getValidatedConfig(options, { validatePlatformPaths: true });

  return uploadBuildsAndRunTests({
    config,
    gitInfo: options.gitInfo ?? getGitInfo(),
  });
}

export default localBuilds;
