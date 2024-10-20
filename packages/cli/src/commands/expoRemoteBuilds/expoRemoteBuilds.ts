import {
  getConfig,
  getGitInfo,
  getOptionsWithDefaults,
  printHeader,
  throwError,
  validateConfig,
} from '../../helpers';
import asyncInitMode from './asyncInitMode';

type Options<T extends 'default' | 'withDefaults' = 'default'> = {
  buildScript?: string;
  manual?: boolean;
  token?: string; // only CLI
  // remoteExpo?: boolean;
  // remoteExpoBuildScript?: string;
  // async?: boolean;
  // asyncBuildIndex?: number;
  // TODO: gitInfo?: Build['gitInfo']; // Can be passed only in GitHub Action
} & (T extends 'withDefaults' ? OptionDefaults : Partial<OptionDefaults>);
type OptionDefaults = { config: string; projectRoot: string };

// TODO: powinno wymagac buildScript LUB manual

// async function expoRemoteBuilds(options: any, githubActionParameters?: Parameters) {
async function expoRemoteBuilds(passedOptions: Options) {
  if (!passedOptions.buildScript && !passedOptions.manual) {
    throwError({
      message: 'Either `--buildScript` or `--manual` must be provided',
      learnMoreLink: 'TODO: dodac link do docsow',
    });
  }

  printHeader();

  const options = getOptionsWithDefaults(passedOptions);

  // TODO: zmienic ze to jest config + options (token, android, ios) ???
  const config = getConfig(options);

  validateConfig(config, { validateBuildPaths: false });

  // TODO: gitInfo moze byc przekazany z GitHub Action
  return asyncInitMode({
    // token: options.token,
    projectRoot: options.projectRoot,
    config,
    token: config.token,
    gitInfo: /* TODO: options.gitInfo ?? */ getGitInfo(),
    remoteExpoBuildScript: options.buildScript,
  });
}

export default expoRemoteBuilds;
