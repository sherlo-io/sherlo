import chalk from 'chalk';
import { FULL_INIT_COMMAND, STORYBOOK_REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { throwError } from '../../../helpers';
import findPackageJsonPaths from './findPackageJsonPaths';
import hasDependency from './hasDependency';

/** Whether the app (or its monorepo root) has Storybook. */
async function hasStorybook(): Promise<boolean> {
  const { current, monorepoRoot } = await findPackageJsonPaths();

  return (
    (await hasDependency(current, STORYBOOK_REACT_NATIVE_PACKAGE_NAME)) ||
    (await hasDependency(monorepoRoot, STORYBOOK_REACT_NATIVE_PACKAGE_NAME))
  );
}

/** The refusal for an app with no Storybook, as it has always been. */
export function refuseMissingStorybook(): void {
  throwError({
    message: 'Set up Storybook before initializing Sherlo',
    learnMoreLink: 'https://github.com/storybookjs/react-native',
    below: '\n' + chalk.reset('Then re-run:\n') + chalk.cyan(`  ${FULL_INIT_COMMAND}`),
  });
}

export default hasStorybook;
