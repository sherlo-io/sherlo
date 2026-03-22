import chalk from 'chalk';
import { FULL_INIT_COMMAND, STORYBOOK_REACT_NATIVE_PACKAGE_NAME } from '../../../constants';
import { throwError } from '../../../helpers';
import findPackageJsonPaths from './findPackageJsonPaths';
import hasDependency from './hasDependency';

async function validateHasStorybook(): Promise<void> {
  const { current, monorepoRoot } = await findPackageJsonPaths();

  const hasStorybook =
    (await hasDependency(current, STORYBOOK_REACT_NATIVE_PACKAGE_NAME)) ||
    (await hasDependency(monorepoRoot, STORYBOOK_REACT_NATIVE_PACKAGE_NAME));

  if (!hasStorybook) {
    throwError({
      message: 'Set up Storybook before initializing Sherlo',
      learnMoreLink: 'https://github.com/storybookjs/react-native',
      below:
        '\n' +
        chalk.reset('Then re-run:\n') +
        chalk.cyan(`  ${FULL_INIT_COMMAND}`),
    });
  }
}

export default validateHasStorybook;
