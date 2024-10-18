import { Build } from '@sherlo/api-types';
import {
  getConfig,
  getGitInfo,
  getOptionsWithDefaults,
  printHeader,
  validateConfig,
  uploadBuildsAndRunTests,
} from '../../helpers';
import { OptionDefaults } from '../../types';

type Options = {
  android?: string;
  ios?: string;
  token?: string;
  gitInfo?: Build['gitInfo']; // For GitHub Actions, not a CLI flag
} & Partial<OptionDefaults>;

async function localBuilds(passedOptions: Options): Promise<{ buildIndex: number; url: string }> {
  printHeader();

  const options = getOptionsWithDefaults(passedOptions);

  const config = getConfig(options);

  validateConfig(config, { validateBuildPaths: true });

  const gitInfo = getGitInfo(passedOptions.gitInfo);

  return uploadBuildsAndRunTests({
    config,
    gitInfo,
  });
}

export default localBuilds;
