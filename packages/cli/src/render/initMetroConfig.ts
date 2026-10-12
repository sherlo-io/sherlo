/**
 * WHAT `sherlo init` PRINTS FOR THE METRO CONFIG: its title, and one block per outcome of the
 * rewrite. The refusals that end the run after a missing config or a missing `withStorybook(` are
 * printed by the tool's error path, under the block here.
 *
 * Pure, like everything under ./: state in, print-call arguments out. `path` is the Metro config
 * the step found, as the command resolved it.
 */
import { DOCS_LINK } from '../constants';
import { renderCheckLine, renderSectionTitle } from './initLines';
import { renderNotice } from './pushSpine';

const STORYBOOK_SETUP_LINK = 'https://github.com/storybookjs/react-native#setup';

export function renderMetroConfigTitle(): string[] {
  return renderSectionTitle('🧩 Metro Config');
}

/** The folder holds no Metro config at all. */
export function renderMetroConfigNotFound(): string[] {
  return [
    renderNotice({
      level: 'warning',
      message: 'metro.config.js not found - complete Storybook setup first',
      learnMoreLink: STORYBOOK_SETUP_LINK,
    }),
  ];
}

/** The config already requires Sherlo's `withStorybook`, so it is left as it is. */
export function renderMetroConfigAlreadyUpdated(path: string): string[] {
  return [renderCheckLine({ type: 'success', message: `Already updated: ${path}` })];
}

/** The config never calls `withStorybook(`, so Storybook's own setup is not finished. */
export function renderMetroConfigWithoutWithStorybook(path: string): string[] {
  return [
    renderCheckLine({ type: 'fail', message: `${path} has no withStorybook(...) call` }),
    renderNotice({
      level: 'warning',
      message: 'Complete Storybook integration in metro.config.js first',
      learnMoreLink: STORYBOOK_SETUP_LINK,
    }),
  ];
}

/** The config's export is not a call the rewrite understands, so the edit is left to the user. */
export function renderMetroConfigNeedsManualEdit(path: string): string[] {
  return [
    renderCheckLine({ type: 'fail', message: `Could not automatically update ${path}` }),
    renderNotice({
      level: 'warning',
      message:
        'metro.config.js has a non-standard shape - add withStorybook from @sherlo/react-native-storybook/metro/withStorybook manually',
      learnMoreLink: DOCS_LINK.setupMetroConfig,
    }),
  ];
}

/** The config was rewritten to require Sherlo's `withStorybook`. */
export function renderMetroConfigUpdated(path: string): string[] {
  return [renderCheckLine({ type: 'success', message: `Updated: ${path}` })];
}
