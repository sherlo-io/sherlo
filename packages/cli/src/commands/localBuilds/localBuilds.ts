import {
  getValidatedConfig,
  getGitInfo,
  getOptionsWithDefaults,
  printHeader,
  uploadBuildsAndRunTests,
} from '../../helpers';
import { Options } from '../../types';

async function localBuilds(
  passedOptions: Options<'local-builds', 'withoutDefaults'>
): Promise<{ buildIndex: number; url: string }> {
  printHeader();

  const options = getOptionsWithDefaults(passedOptions);

  const config = getValidatedConfig(options, { validatePlatformPaths: true });

  return uploadBuildsAndRunTests({
    config,
    gitInfo: options.gitInfo ?? getGitInfo(),
  });
}

export default localBuilds;
