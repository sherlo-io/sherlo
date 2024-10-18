import { Build } from '@sherlo/api-types';
import {
  getConfig,
  getGitInfo,
  getOptionsWithDefaults,
  printHeader,
  validateConfig,
} from '../../helpers';
import { OptionDefaults } from '../../types';
import uploadBuildsAndRunTests from './uploadBuildsAndRunTests';

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

  const gitInfo = passedOptions.gitInfo ?? getGitInfo();

  return uploadBuildsAndRunTests({
    config,
    gitInfo,
  });
}

export default localBuilds;
